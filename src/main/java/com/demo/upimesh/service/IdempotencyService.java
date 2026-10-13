package com.demo.upimesh.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Thin facade over the idempotency backing store (IdempotencyStore). The
 * contract:
 *
 *   - claim(hash) returns true on first call, false on every call after that
 *     (within the TTL window)
 *   - the operation is atomic — even if 100 threads call claim(hash) at the
 *     same instant, exactly one returns true
 *
 * This is what kills the "three bridges deliver simultaneously" problem.
 * Which store backs this (in-memory vs Redis) is a deployment choice —
 * see IdempotencyStore, InMemoryIdempotencyStore, RedisIdempotencyStore.
 */
@Service
public class IdempotencyService {

    @Autowired private IdempotencyStore store;

    public boolean claim(String packetHash) {
        return store.claim(packetHash);
    }

    public int size() {
        return store.size();
    }

    /** Test/demo helper. */
    public void clear() {
        store.clear();
    }
}
