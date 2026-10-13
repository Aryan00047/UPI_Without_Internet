package com.demo.upimesh.service;

import com.demo.upimesh.crypto.HybridCryptoService;
import com.demo.upimesh.model.Account;
import com.demo.upimesh.model.AccountRepository;
import com.demo.upimesh.model.MeshPacket;
import com.demo.upimesh.model.PaymentInstruction;
import com.demo.upimesh.model.Transaction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;

import java.security.PublicKey;
import java.time.Instant;
import java.util.Optional;

/**
 * Orchestrates the full server-side pipeline for one inbound packet from a
 * bridge node:
 *
 *   1. Hash the ciphertext.
 *   2. Try to claim that hash via the idempotency cache.
 *      - If already claimed: this is a duplicate. Drop it.
 *   3. Decrypt the ciphertext with the server's private key.
 *      - If decryption fails: tampered or junk. Reject.
 *   4. Verify the sender's signature on the decrypted instruction.
 *      - If missing/unknown sender key/invalid: reject — the ciphertext was
 *        valid but we can't trust who it claims to be from.
 *   5. Check freshness — reject if signedAt is too old (replay protection).
 *   6. Hand off to SettlementService for the actual debit/credit.
 */
@Service
public class BridgeIngestionService {

    private static final Logger log = LoggerFactory.getLogger(BridgeIngestionService.class);

    @Autowired private HybridCryptoService crypto;
    @Autowired private IdempotencyService idempotency;
    @Autowired private SettlementService settlement;
    @Autowired private AccountRepository accountRepo;

    @Value("${upi.mesh.packet-max-age-seconds:86400}")
    private long maxAgeSeconds;

    public IngestResult ingest(MeshPacket packet, String bridgeNodeId, int hopCount) {
        try {
            String packetHash = crypto.hashCiphertext(packet.getCiphertext());

            // ---- Idempotency gate ----
            if (!idempotency.claim(packetHash)) {
                log.info("DUPLICATE packet {} from bridge {} — dropped",
                        packetHash.substring(0, 12) + "...", bridgeNodeId);
                return IngestResult.duplicate(packetHash);
            }

            // ---- Decrypt ----
            PaymentInstruction instruction;
            try {
                instruction = crypto.decrypt(packet.getCiphertext());
            } catch (Exception e) {
                log.warn("Decryption failed for packet {}: {}",
                        packetHash.substring(0, 12) + "...", e.getMessage());
                return IngestResult.invalid(packetHash, "decryption_failed");
            }

            // ---- Signature verification (authorship, not just confidentiality) ----
            Optional<Account> sender = accountRepo.findById(instruction.getSenderVpa());
            if (sender.isEmpty() || sender.get().getPublicKeyBase64() == null) {
                log.warn("Packet {} claims unknown sender {}",
                        packetHash.substring(0, 12) + "...", instruction.getSenderVpa());
                return IngestResult.invalid(packetHash, "unknown_sender_key");
            }
            PublicKey senderPublicKey = crypto.decodeRsaPublicKey(sender.get().getPublicKeyBase64());
            if (!crypto.verify(instruction, senderPublicKey)) {
                log.warn("Packet {} failed signature verification for sender {}",
                        packetHash.substring(0, 12) + "...", instruction.getSenderVpa());
                return IngestResult.invalid(packetHash, "invalid_signature");
            }

            // ---- Freshness check (replay protection) ----
            long ageSeconds = (Instant.now().toEpochMilli() - instruction.getSignedAt()) / 1000;
            if (ageSeconds > maxAgeSeconds) {
                log.warn("Packet {} too old ({}s), rejected",
                        packetHash.substring(0, 12) + "...", ageSeconds);
                return IngestResult.invalid(packetHash, "stale_packet");
            }
            if (ageSeconds < -300) { // small clock-skew tolerance
                return IngestResult.invalid(packetHash, "future_dated");
            }

            // ---- Settle ----
            // Two DIFFERENT packets from the same sender (e.g. two separate
            // ₹10 payments, not duplicates — distinct nonces) can legitimately
            // arrive in the same parallel flush batch and both try to update
            // that sender's Account row at once. The @Version optimistic lock
            // correctly stops one from overwriting the other's update, but it
            // does so by throwing — so each attempt must retry against the
            // now-fresh account state rather than failing the payment outright.
            Transaction tx = settleWithRetry(instruction, packetHash, bridgeNodeId, hopCount);
            if (tx.getStatus() == Transaction.Status.REJECTED) {
                return IngestResult.rejected(packetHash, tx);
            }
            return IngestResult.settled(packetHash, tx);

        } catch (Exception e) {
            log.error("Ingestion error: {}", e.getMessage(), e);
            return IngestResult.invalid("?", "internal_error: " + e.getMessage());
        }
    }

    private static final int SETTLE_MAX_ATTEMPTS = 5;

    private Transaction settleWithRetry(PaymentInstruction instruction, String packetHash,
                                        String bridgeNodeId, int hopCount) {
        for (int attempt = 1; attempt <= SETTLE_MAX_ATTEMPTS; attempt++) {
            try {
                return settlement.settle(instruction, packetHash, bridgeNodeId, hopCount);
            } catch (ObjectOptimisticLockingFailureException e) {
                if (attempt == SETTLE_MAX_ATTEMPTS) throw e;
                log.info("Settlement for {} lost an optimistic-lock race on attempt {}/{} — retrying with fresh account state",
                        packetHash.substring(0, 12) + "...", attempt, SETTLE_MAX_ATTEMPTS);
            }
        }
        throw new IllegalStateException("unreachable");
    }

    public record IngestResult(String outcome, String packetHash, String reason, Long transactionId) {
        public static IngestResult settled(String hash, Transaction tx) {
            return new IngestResult("SETTLED", hash, null, tx.getId());
        }
        public static IngestResult duplicate(String hash) {
            return new IngestResult("DUPLICATE_DROPPED", hash, null, null);
        }
        public static IngestResult rejected(String hash, Transaction tx) {
            return new IngestResult("REJECTED", hash, "insufficient_funds", tx.getId());
        }
        public static IngestResult invalid(String hash, String reason) {
            return new IngestResult("INVALID", hash, reason, null);
        }
    }
}
