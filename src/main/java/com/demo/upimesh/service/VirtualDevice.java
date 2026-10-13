package com.demo.upimesh.service;

import com.demo.upimesh.model.MeshPacket;

import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A simulated phone in the mesh. Holds packets it has seen.
 *
 * In the real system, this state would be on a physical Android device,
 * with packets exchanged via BLE GATT characteristics.
 *
 * maxCapacity is the gossip-layer spam defense: a real phone has finite
 * storage and battery, so it can't accept unlimited packets from whoever it
 * happens to be near. Once full, new/incoming packets are dropped rather
 * than held — this is the device-level rate limit.
 */
public class VirtualDevice {

    private final String deviceId;
    private volatile boolean hasInternet;
    private final int maxCapacity;
    private final Map<String, MeshPacket> heldPackets = new ConcurrentHashMap<>();
    private final AtomicInteger droppedForCapacity = new AtomicInteger();

    public VirtualDevice(String deviceId, boolean hasInternet, int maxCapacity) {
        this.deviceId = deviceId;
        this.hasInternet = hasInternet;
        this.maxCapacity = maxCapacity;
    }

    public String getDeviceId() { return deviceId; }
    public boolean hasInternet() { return hasInternet; }
    /** Simulates the device walking into/out of signal — demo-only control, not something a real device exposes to the backend. */
    public void setHasInternet(boolean hasInternet) { this.hasInternet = hasInternet; }
    public int getMaxCapacity() { return maxCapacity; }
    public int getDroppedForCapacity() { return droppedForCapacity.get(); }

    /**
     * Tries to hold a packet. Returns false (and counts a drop) if the device
     * is already at capacity and doesn't already hold this exact packet —
     * i.e. this would be new spam, not a re-delivery of something it has.
     */
    public boolean hold(MeshPacket packet) {
        if (heldPackets.containsKey(packet.getPacketId())) {
            return true;
        }
        if (heldPackets.size() >= maxCapacity) {
            droppedForCapacity.incrementAndGet();
            return false;
        }
        heldPackets.put(packet.getPacketId(), packet);
        return true;
    }

    public Collection<MeshPacket> getHeldPackets() {
        return heldPackets.values();
    }

    public boolean holds(String packetId) {
        return heldPackets.containsKey(packetId);
    }

    public int packetCount() {
        return heldPackets.size();
    }

    /** Drops one packet once the server has permanently resolved it (settled,
     * rejected, or found invalid) — there's no reason for this device to keep
     * holding or re-gossiping something the backend is already done with. */
    public void forget(String packetId) {
        heldPackets.remove(packetId);
    }

    public void clear() {
        heldPackets.clear();
        droppedForCapacity.set(0);
    }
}
