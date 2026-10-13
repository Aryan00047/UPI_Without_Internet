package com.demo.upimesh.service;

import com.demo.upimesh.crypto.HybridCryptoService;
import com.demo.upimesh.crypto.SenderKeyService;
import com.demo.upimesh.crypto.ServerKeyHolder;
import com.demo.upimesh.model.Account;
import com.demo.upimesh.model.AccountRepository;
import com.demo.upimesh.model.MeshPacket;
import com.demo.upimesh.model.PaymentInstruction;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;

/**
 * Helper service that:
 *   - seeds demo accounts on startup
 *   - simulates "sender phone creates an encrypted packet" flow
 */
@Service
public class DemoService {

    private static final Logger log = LoggerFactory.getLogger(DemoService.class);

    @Autowired private AccountRepository accounts;
    @Autowired private HybridCryptoService crypto;
    @Autowired private ServerKeyHolder serverKey;
    @Autowired private SenderKeyService senderKeys;

    @PostConstruct
    public void seedAccounts() throws Exception {
        if (accounts.count() == 0) {
            seedAccountWithKeys("alice@demo", "Alice",   new BigDecimal("5000.00"));
            seedAccountWithKeys("bob@demo",   "Bob",     new BigDecimal("1000.00"));
            seedAccountWithKeys("carol@demo", "Carol",   new BigDecimal("2500.00"));
            seedAccountWithKeys("dave@demo",  "Dave",    new BigDecimal("500.00"));
            log.info("Seeded 4 demo accounts, each with its own signing keypair");
        }
    }

    /**
     * Generates a signing keypair for a demo account — simulating "the phone
     * generates a keypair and registers the public half with the bank."
     * The private key stays only in SenderKeyService's in-memory map.
     */
    private void seedAccountWithKeys(String vpa, String holderName, BigDecimal balance) throws Exception {
        KeyPair keyPair = senderKeys.generateKeyPair();
        senderKeys.registerPrivateKey(vpa, keyPair.getPrivate());

        Account account = new Account(vpa, holderName, balance);
        account.setPublicKeyBase64(Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded()));
        accounts.save(account);
    }

    /**
     * Simulates the sender's phone:
     *   1. Build a PaymentInstruction with a fresh nonce + signedAt timestamp.
     *   2. Encrypt with the server's public key (hybrid RSA+AES).
     *   3. Wrap in a MeshPacket with TTL.
     *
     * In a real Android app, this exact code (minus the server-side reference)
     * would run on the phone. The phone would have already cached the server's
     * public key during a previous online session.
     */
    public MeshPacket createPacket(String senderVpa, String receiverVpa,
                                   BigDecimal amount, String pin, int ttl) throws Exception {
        return createPacket(senderVpa, receiverVpa, amount, pin, ttl, null);
    }

    /**
     * Same as the 5-arg overload, but can deliberately introduce one flaw —
     * for demoing each rejection path the real pipeline supports, not just
     * duplicate (flush twice) and insufficient_funds (amount > balance),
     * which are reachable through honest use of the API alone.
     *
     * Every flaw models something a REAL malicious/broken sender could
     * produce — this is demo tooling, not a backend contract change.
     */
    public MeshPacket createPacket(String senderVpa, String receiverVpa,
                                   BigDecimal amount, String pin, int ttl, String flaw) throws Exception {
        long signedAt = Instant.now().toEpochMilli();
        if ("stale".equals(flaw)) {
            signedAt = Instant.now().minus(2, ChronoUnit.DAYS).toEpochMilli();
        } else if ("future".equals(flaw)) {
            signedAt = Instant.now().plus(10, ChronoUnit.MINUTES).toEpochMilli();
        }

        // unknown_sender: claim a VPA no Account was ever seeded for, so the
        // server's accountRepo.findById(...) lookup comes back empty.
        String claimedSender = "unknown_sender".equals(flaw) ? senderVpa + ".ghost" : senderVpa;

        PaymentInstruction instruction = new PaymentInstruction(
                claimedSender,
                receiverVpa,
                amount,
                sha256Hex(pin),
                UUID.randomUUID().toString(),
                signedAt
        );

        // bad_signature: sign with a throwaway keypair instead of the real
        // sender's registered key, so verification against the sender's
        // actual registered public key fails.
        PrivateKey signingKey = "bad_signature".equals(flaw)
                ? generateThrowawayKeyPair().getPrivate()
                : senderKeys.getPrivateKey(senderVpa);
        instruction.setSignature(crypto.sign(instruction, signingKey));

        String ciphertext = crypto.encrypt(instruction, serverKey.getPublicKey());
        if ("corrupt".equals(flaw)) {
            // Flip one character so AES-GCM's auth tag check fails on decrypt.
            char[] chars = ciphertext.toCharArray();
            int mid = chars.length / 2;
            chars[mid] = chars[mid] == 'A' ? 'B' : 'A';
            ciphertext = new String(chars);
        }

        MeshPacket packet = new MeshPacket();
        packet.setPacketId(UUID.randomUUID().toString());
        packet.setTtl(ttl);
        packet.setCreatedAt(Instant.now().toEpochMilli());
        packet.setCiphertext(ciphertext);
        return packet;
    }

    private KeyPair generateThrowawayKeyPair() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        return gen.generateKeyPair();
    }

    private String sha256Hex(String input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] hash = md.digest(input.getBytes());
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) hex.append(String.format("%02x", b));
        return hex.toString();
    }
}
