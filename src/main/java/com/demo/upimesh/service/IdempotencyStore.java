package com.demo.upimesh.service;

/**
 * Backing store for the idempotency cache. The contract, regardless of
 * implementation:
 *
 *   - claim(hash) returns true on the first call for a given hash, false on
 *     every call after that (within the TTL window).
 *   - the operation is atomic — even under heavy concurrency, exactly one
 *     caller for a given hash gets true.
 *
 * Two implementations:
 *   - InMemoryIdempotencyStore (default profile) — ConcurrentHashMap, zero
 *     setup, single-instance only.
 *   - RedisIdempotencyStore ("redis" profile) — SET NX EX, works across
 *     multiple app instances the way a real deployment would need.
 */
public interface IdempotencyStore {

    boolean claim(String packetHash);

    int size();

    void clear();
}
