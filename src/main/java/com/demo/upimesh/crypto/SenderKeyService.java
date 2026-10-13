package com.demo.upimesh.crypto;

import org.springframework.stereotype.Service;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Holds sender devices' RSA keypairs for signing PaymentInstructions.
 *
 * In a real deployment, each phone generates its own keypair on first setup
 * and registers only the PUBLIC half with the bank (stored on Account) when
 * it first comes online. The PRIVATE half never leaves the device. We
 * simulate that split here: this service plays the role of "key material
 * living on each demo phone," kept only in memory — never persisted to the
 * database, same as a real private key would never leave the handset.
 */
@Service
public class SenderKeyService {

    private final Map<String, PrivateKey> privateKeys = new ConcurrentHashMap<>();

    public KeyPair generateKeyPair() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        return gen.generateKeyPair();
    }

    /** Simulates the phone caching its own private key after generating it. */
    public void registerPrivateKey(String vpa, PrivateKey privateKey) {
        privateKeys.put(vpa, privateKey);
    }

    public PrivateKey getPrivateKey(String vpa) {
        PrivateKey key = privateKeys.get(vpa);
        if (key == null) {
            throw new IllegalStateException("No signing key registered for sender " + vpa);
        }
        return key;
    }

    public boolean hasKey(String vpa) {
        return privateKeys.containsKey(vpa);
    }
}
