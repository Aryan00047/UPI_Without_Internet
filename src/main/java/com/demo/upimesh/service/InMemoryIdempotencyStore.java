package com.demo.upimesh.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Default idempotency store: a single JVM's ConcurrentHashMap.
 *
 * Active whenever the "redis" profile is NOT active — i.e. the app's normal
 * zero-setup demo mode. putIfAbsent is the JVM-local equivalent of Redis
 * SETNX; this only kills the duplicate-storm problem for a single instance,
 * which is exactly what RedisIdempotencyStore exists to fix for real
 * multi-instance deployments.
 */
@Service
@Profile("!redis")
public class InMemoryIdempotencyStore implements IdempotencyStore {

    private final Map<String, Instant> seen = new ConcurrentHashMap<>();

    @Value("${upi.mesh.idempotency-ttl-seconds:86400}")
    private long ttlSeconds;

    @Override
    public boolean claim(String packetHash) {
        Instant prev = seen.putIfAbsent(packetHash, Instant.now());
        return prev == null;
    }

    @Override
    public int size() {
        return seen.size();
    }

    @Override
    public void clear() {
        seen.clear();
    }

    /** Periodically evict entries past their TTL so the map doesn't grow forever. */
    @Scheduled(fixedDelay = 60_000)
    public void evictExpired() {
        Instant cutoff = Instant.now().minusSeconds(ttlSeconds);
        seen.entrySet().removeIf(e -> e.getValue().isBefore(cutoff));
    }
}
