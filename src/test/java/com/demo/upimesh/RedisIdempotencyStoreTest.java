package com.demo.upimesh;

import com.demo.upimesh.service.IdempotencyStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Proves RedisIdempotencyStore has the exact same atomicity guarantee as the
 * default in-memory store, against a REAL Redis (via Testcontainers) — not a
 * mock. Requires Docker to be running; every other test in this project does
 * not need Docker or Redis.
 */
@Testcontainers
@SpringBootTest
@ActiveProfiles("redis")
class RedisIdempotencyStoreTest {

    @Container
    static GenericContainer<?> redis = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
            .withExposedPorts(6379);

    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
    }

    @Autowired private IdempotencyStore store;

    @Test
    void firstClaimSucceedsSubsequentClaimsAreDuplicates() {
        store.clear();
        String hash = "test-hash-" + System.nanoTime();

        assertTrue(store.claim(hash), "first claim should succeed");
        assertFalse(store.claim(hash), "second claim of the same hash should be a duplicate");
        assertFalse(store.claim(hash), "third claim of the same hash should also be a duplicate");
    }

    @Test
    void concurrentClaimsOfSameHashYieldExactlyOneWinner() throws Exception {
        store.clear();
        String hash = "race-hash-" + System.nanoTime();

        int threads = 20;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger winners = new AtomicInteger();

        Future<?>[] futures = new Future[threads];
        for (int i = 0; i < threads; i++) {
            futures[i] = pool.submit(() -> {
                try {
                    start.await();
                    if (store.claim(hash)) winners.incrementAndGet();
                } catch (InterruptedException e) {
                    throw new RuntimeException(e);
                }
            });
        }
        start.countDown();
        for (Future<?> f : futures) f.get(5, TimeUnit.SECONDS);
        pool.shutdown();

        assertEquals(1, winners.get(), "exactly one of the concurrent claims should win");
    }
}
