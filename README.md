# UPI Offline Mesh

A payment system simulation: phones without internet pass encrypted payment
packets to each other over a Bluetooth-style mesh until one of them gets a
connection and uploads the packet to a backend for settlement. Spring Boot
backend, Angular 19 dashboard, Redis-backed idempotency, RSA/AES hybrid
encryption, and sender-side digital signatures.

> This is a simulation for learning and portfolio purposes, not a
> production payment system and not affiliated with NPCI or UPI.

Built on an existing UPI mesh demo project. See [Attribution](#attribution)
for what was inherited versus added.

## Table of contents

1. [What it demonstrates](#what-it-demonstrates)
2. [Architecture](#architecture)
3. [The three hard problems, and how they're solved](#the-three-hard-problems-and-how-theyre-solved)
4. [Tech stack](#tech-stack)
5. [Running it](#running-it)
6. [Using the dashboard](#using-the-dashboard)
7. [File walkthrough](#file-walkthrough)
8. [API reference](#api-reference)
9. [Tests](#tests)
10. [What's simulated, and what would need to change for production](#whats-simulated-and-what-would-need-to-change-for-production)
11. [Honest limitations of the concept](#honest-limitations-of-the-concept)
12. [Attribution](#attribution)

## What it demonstrates

Three payments problems, solved end to end and visible in the dashboard:

1. **A payment can pass through untrusted intermediaries without them being
   able to read or forge it.** Hybrid encryption (RSA-OAEP wraps an
   AES-256-GCM session key) plus a sender signature the backend verifies
   before settling anything.
2. **The same packet can arrive at the backend twice, at the same time,
   from two different devices, and still only settle once.** An atomic
   claim on the packet's hash, backed by Redis when it has to stay correct
   across more than one backend instance.
3. **A corrupted, stale, or replayed packet gets rejected** before it
   reaches the ledger, with the reason visible in the pipeline trace panel.

## Architecture

```
sender phone (simulated)
    │  sign (SHA256withRSA) + encrypt (RSA-OAEP → AES-256-GCM)
    ▼
phone-alice/bob/carol/dave  ──┐
    │  gossip (BLE-style)     │  packets copy between
    ▼                         │  nearby devices each round
phone-bridge / phone-edge  ◄──┘  (the only two with "internet")
    │  flush (HTTP POST)
    ▼
POST /api/bridge/ingest
    │
    ├─ 1. claim(hash) — idempotency check (reject duplicates here, cheaply,
    │      before spending CPU on decryption)
    ├─ 2. decrypt (RSA-OAEP unwraps the AES key, AES-GCM decrypts the
    │      payload and verifies the auth tag — tampering throws here)
    ├─ 3. verify sender signature against the sender's registered public key
    ├─ 4. check packet freshness (reject stale/future-dated)
    └─ 5. settle — debit sender, credit receiver, write ledger (@Transactional,
         retries on optimistic-lock conflicts)
```

The mesh itself is simulated in-process (`MeshSimulatorService`) rather than
over real Bluetooth, so the whole flow runs on one machine with no mobile
app or hardware required. `phone-alice/bob/carol/dave` each belong to one
of the four demo accounts; `phone-bridge` and `phone-edge` aren't tied to
any account — they're just whoever happens to have signal and can relay
for everyone else. Two of them are online by default specifically so the
same packet can reach both at once, which is what makes problem 2 above
reproducible instead of theoretical.

## The three hard problems, and how they're solved

### 1. Untrusted intermediaries

A random stranger's phone is carrying your transaction. How do you stop
them from reading the amount, or changing it?

The sender encrypts the payload with the server's public key, so
intermediates only ever see opaque ciphertext. RSA alone can't encrypt an
arbitrarily large payload, so this uses the standard hybrid pattern: a
fresh AES-256 key per packet, the payload encrypted with AES-256-GCM, and
only that AES key encrypted with RSA-OAEP. GCM is authenticated encryption
— if anyone flips a single bit anywhere in the ciphertext, decryption
throws instead of silently returning corrupted data. See
`HybridCryptoService.java`.

On top of that, every `PaymentInstruction` is signed with the sender's own
key (`SHA256withRSA`) before encryption, and the backend verifies that
signature against the sender's registered public key after decrypting
(`SenderKeyService`, `Account.publicKeyBase64`). Encryption protects
*confidentiality* — intermediates can't read it. The signature protects
*authorship* — nobody can forge a payment claiming to be from someone
else. They're separate guarantees solving separate problems.

### 2. The duplicate-storm

Two bridge devices hold the same packet (gossip copied it to both). Both
get internet within the same second and both POST it to
`/api/bridge/ingest`. Process both naively and the sender gets debited
twice for one payment.

The fix is an atomic claim on the packet's hash, computed from the
ciphertext (not the packet ID, which an intermediate could rewrite, and
not the cleartext, which would mean decrypting before you even know if you
need to): whichever request's claim lands first proceeds to decryption and
settlement; every other request for the same hash is rejected immediately
as `DUPLICATE_DROPPED`, before it costs any real work.

- **Default profile:** `ConcurrentHashMap.putIfAbsent` — atomic within one
  JVM, zero setup, fine for a single running instance.
- **`redis` profile:** Redis's `SET key value NX EX ttl` — the same
  atomic "claim if nobody has already" semantics, but correct across
  multiple backend instances behind a load balancer, which a plain
  in-memory map can't be (each instance would have its own separate map
  and could both say "first time I've seen this" for the same packet).

Both implementations sit behind one `IdempotencyStore` interface, so which
one is active is a Spring profile, not a code change.

### 3. Replay attacks

An attacker who captured a ciphertext could replay it later. Two layers
guard against this: the signed payload includes a timestamp, and the
backend rejects anything older than its freshness window (the attacker
can't alter the timestamp without breaking the GCM tag); and because a
genuine replay of one specific packet is byte-identical to the original,
the same idempotency check from problem 2 catches it as a duplicate.

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Java 17, Spring Boot 3.3, Spring Data JPA, H2 |
| Frontend | Angular 19, TypeScript, Signals, SVG |
| Idempotency | In-memory (default) or Redis, `SET key val NX EX ttl` |
| Crypto | RSA-OAEP, AES-256-GCM, SHA256withRSA signatures |
| Testing | JUnit, Testcontainers (Redis integration test) |

## Running it

### Prerequisites

- JDK 17+ (`java -version`)
- Node.js + npm, for the Angular frontend
- Docker, only if you want to run the Redis idempotency profile

### Backend

```bash
./mvnw spring-boot:run          # macOS/Linux
.\mvnw.cmd spring-boot:run       # Windows
```

Starts on `http://localhost:8080`, with an in-memory H2 database and the
default in-memory idempotency store. No external services required.

### Frontend

```bash
cd frontend
npm install
npm start
```

Serves on `http://localhost:4200` and proxies `/api` requests to the
backend on `8080` (see `frontend/proxy.conf.json`). Start the backend
first.

### Optional: Redis idempotency profile

```bash
docker compose up -d redis
./mvnw spring-boot:run -Dspring-boot.run.profiles=redis
```

Swaps the idempotency store from in-memory to Redis. Only worth doing if
you specifically want to demonstrate that the duplicate-prevention logic
stays correct across multiple backend instances, not just within one
JVM's memory — the app works fully without this.

## Using the dashboard

1. **Compose & inject** — pick a sender, receiver, and amount, then inject
   the packet onto that sender's simulated phone. The server builds a
   signed `PaymentInstruction`, encrypts it, and hands it to that phone.
2. **Run gossip** — copies the packet between nearby devices. Run it a
   couple of times to let it reach both of the online relay devices
   (`phone-bridge`, `phone-edge`) — that's what makes it possible for the
   same packet to arrive at the backend twice.
3. **Flush bridges** — every online device uploads whatever it's holding.
   If both relays picked up the same packet, you'll see one `SETTLED` and
   the other `DUPLICATE_DROPPED` for the same hash.
4. **Watch it settle** — the pipeline trace, transaction ledger, and
   account balances update live, no page refresh needed.

There's also a separate "gossip at scale" panel that isn't tied to the
real backend at all — it models gossip spread spatially (device count,
area, BLE range, fan-out) and animates it round by round, to make the
"gossip spreads exponentially, not linearly, with fan-out ≥ 2" argument
concrete instead of just asserting it.

## File walkthrough

```
upi-offline-mesh/
├── pom.xml, mvnw, mvnw.cmd          Maven build (Spring Boot 3.3, Java 17), wrapper
├── docker-compose.yml               Redis, for the optional redis profile
└── src/main/
    ├── resources/
    │   ├── application.properties       default profile config
    │   └── application-redis.properties  redis profile config
    └── java/com/demo/upimesh/
        ├── UpiMeshApplication.java      Spring Boot main class
        │
        ├── model/                       domain entities
        │   ├── Account.java             JPA entity, @Version = optimistic lock
        │   ├── Transaction.java         settled-tx ledger
        │   ├── MeshPacket.java          wire format — outer fields readable, ciphertext opaque
        │   └── PaymentInstruction.java  the decrypted payload
        │
        ├── crypto/
        │   ├── ServerKeyHolder.java     generates the server's RSA keypair on startup
        │   ├── SenderKeyService.java    sender-side keys + signature verification
        │   └── HybridCryptoService.java RSA-OAEP + AES-256-GCM encrypt/decrypt, sign/verify
        │
        ├── service/
        │   ├── DemoService.java              seeds accounts, simulates a sender phone
        │   ├── VirtualDevice.java            one simulated phone in the mesh
        │   ├── MeshSimulatorService.java      gossip protocol across virtual devices
        │   ├── IdempotencyService.java        thin facade over the active store
        │   ├── IdempotencyStore.java          the interface the two stores implement
        │   ├── InMemoryIdempotencyStore.java  default profile
        │   ├── RedisIdempotencyStore.java     redis profile
        │   ├── SettlementService.java         @Transactional debit + credit + ledger insert
        │   └── BridgeIngestionService.java    the pipeline: claim → decrypt → verify → settle
        │
        └── controller/
            └── ApiController.java        all REST endpoints

src/test/java/com/demo/upimesh/
├── IdempotencyConcurrencyTest.java    N bridges deliver the same packet at once
└── RedisIdempotencyStoreTest.java     same race, against a real Testcontainers Redis

frontend/src/app/
├── components/   one folder per dashboard panel — header, compose-payment-form,
│                 mesh-actions, device-list, pipeline-trace, transaction-ledger,
│                 account-balances, activity-log, how-it-works, info-tip,
│                 mesh-proximity (the SVG device map), gossip-scale-lab
│                 (the standalone spatial gossip simulator)
├── state/        MeshStateService — the signals-based store everything reads from
├── services/     HTTP calls to the backend
└── models/       shared TypeScript types
```

## API reference

| Method | Path | What it does |
|---|---|---|
| GET | `/api/server-key` | Server's RSA public key (base64) |
| GET | `/api/accounts` | All accounts and balances |
| GET | `/api/transactions` | Last 20 transactions |
| GET | `/api/mesh/state` | Current state of every virtual device |
| POST | `/api/demo/send` | Simulate a sender phone — sign, encrypt, inject packet |
| POST | `/api/mesh/gossip` | Run one round of gossip across the mesh |
| POST | `/api/mesh/devices/{id}/toggle-internet` | Flip a device's simulated connectivity |
| POST | `/api/mesh/flush` | Online devices upload to the backend (in parallel) |
| POST | `/api/mesh/reset` | Clear the mesh and the idempotency cache |
| POST | `/api/bridge/ingest` | **The production endpoint.** Real bridges POST here |

### `/api/bridge/ingest` response shape

```json
{
  "outcome": "SETTLED",
  "packetHash": "a3f8c9...",
  "reason": null,
  "transactionId": 42
}
```

`outcome` is one of `SETTLED`, `REJECTED` (e.g. insufficient funds),
`DUPLICATE_DROPPED`, or `INVALID` (decryption/signature/freshness failure,
with the specific reason in `reason`).

## Tests

```bash
./mvnw test
```

- **`IdempotencyConcurrencyTest`** — the headline test. Multiple threads
  deliver the same packet to `BridgeIngestionService.ingest()`
  simultaneously; asserts exactly one `SETTLED`, the rest
  `DUPLICATE_DROPPED`, and that the sender's balance changed by exactly
  the amount once, not once per thread.
- **`RedisIdempotencyStoreTest`** — the same kind of race, but against a
  real Redis instance spun up by Testcontainers rather than a mock, so it
  actually exercises the atomic `SETNX` behavior the code depends on.
  Needs Docker running; every other test does not.

## What's simulated, and what would need to change for production

| In this project | In production |
|---|---|
| H2 in-memory DB | PostgreSQL/MySQL with replicas |
| RSA keypair regenerated on every startup | Private key in an HSM (AWS KMS, Vault) |
| Software-simulated mesh (`MeshSimulatorService`) | Real BLE GATT or Wi-Fi Direct between phones |
| One settlement service that owns the ledger | Integration with NPCI / a real bank core |
| No auth on `/api/bridge/ingest` beyond packet signatures | Mutual TLS or signed bridge-node certificates |
| In-memory accounts seeded on startup | Real KYC'd users, real VPAs, real PIN verification |
| Redis handles the "same packet, multiple instances" race | Plus durable transaction-level idempotency, audit logging |

The cryptography and idempotency code here is shaped like what a real
system would use. The infrastructure and operational layers around it are
what would actually change.

## Honest limitations of the concept

These aren't implementation bugs — they're inherent to "no internet,
anywhere in the chain":

1. **The receiver can't verify the sender actually has the funds.** A
   "₹500 sent" confirmation on the sender's phone is an IOU, not a
   settled payment, until it reaches the backend. If the balance isn't
   there by then, settlement comes back `REJECTED` and the receiver has
   no recourse. This is why real offline UPI (UPI Lite) uses a pre-funded,
   hardware-backed wallet instead — it can prove funds are available
   without a network round trip.
2. **A malicious sender can double-spend offline** — send the same
   balance to two different people in two different basements. Whichever
   packet reaches the backend first wins; the other is `REJECTED`. Same
   root cause as #1.
3. **Background Bluetooth in real life is hard.** Android has throttled
   background BLE heavily since Android 8; iOS peripheral mode is locked
   down. Two strangers' phones reliably forming a connection without
   either app being actively open is a genuinely hard problem this project
   sidesteps entirely by simulating the mesh in software.
4. **Metadata and liability.** A stranger's phone carries your encrypted
   packet. They can't read it, but its existence alone is metadata worth
   thinking about in a real deployment.

The more accurate name for this concept is "mesh-routed deferred
settlement," not "real-time offline UPI" — and the cryptography and
idempotency engineering behind it is real, independent of that framing.

## Attribution

This project started from an existing UPI mesh demo and was extended with:
sender-side digital signatures, a profile-switchable idempotency layer
(in-memory/Redis), a concurrency bug fix for a real optimistic-locking
race, packet lifecycle cleanup in the mesh simulator, and a full rebuild
of the dashboard as a standalone Angular 19 application — the mesh
proximity view, pipeline trace, transaction ledger, and gossip-at-scale
simulator didn't exist in the original.

Original project: `https://github.com/perryvegehan/UPI_Without_Internet`
