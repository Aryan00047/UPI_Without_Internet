package com.demo.upimesh.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Set;

/**
 * Production-shaped idempotency store, backed by real Redis.
 *
 * claim() uses SET key value NX EX ttl — Redis's own atomic "set if not
 * present, with expiry" — which is exactly the same semantics as the
 * in-memory ConcurrentHashMap.putIfAbsent, except now correct across
 * multiple app instances/replicas, which was the whole limitation the
 * in-memory version called out in its own comments.
 *
 * Active only on the "redis" profile (--spring.profiles.active=redis),
 * so the default zero-setup demo mode is unaffected and needs no Redis.
 */
@Service
@Profile("redis")
public class RedisIdempotencyStore implements IdempotencyStore {

    private static final String KEY_PREFIX = "upimesh:idem:";

    @Autowired private StringRedisTemplate redis;

    @Value("${upi.mesh.idempotency-ttl-seconds:86400}")
    private long ttlSeconds;

    @Override
    public boolean claim(String packetHash) {
        Boolean claimed = redis.opsForValue()
                .setIfAbsent(KEY_PREFIX + packetHash, "1", Duration.ofSeconds(ttlSeconds));
        return Boolean.TRUE.equals(claimed);
    }

    @Override
    public int size() {
        // SCAN-based count, not O(1) — fine at demo scale, but note this is
        // not how you'd track cache size in a real high-throughput deployment
        // (a separate counter or Redis INFO/keyspace stats would be used instead).
        Set<String> keys = redis.keys(KEY_PREFIX + "*");
        return keys == null ? 0 : keys.size();
    }

    @Override
    public void clear() {
        Set<String> keys = redis.keys(KEY_PREFIX + "*");
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
    }
}
