package com.demo.upimesh.service;

import com.demo.upimesh.model.MeshPacket;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Simulates the Bluetooth mesh.
 *
 * Each VirtualDevice represents a phone. The "gossip" step picks pairs of
 * devices that are nearby (we just say all devices are nearby for the demo)
 * and copies packets between them, decrementing TTL each hop.
 *
 * When a device with internet (a "bridge node") holds a packet, the demo's
 * /api/mesh/flush endpoint causes it to actually POST that packet to our
 * backend — simulating the moment a phone walks outside and gets 4G.
 */
@Service
public class MeshSimulatorService {

    private static final Logger log = LoggerFactory.getLogger(MeshSimulatorService.class);

    private final Map<String, VirtualDevice> devices = new ConcurrentHashMap<>();

    @Value("${upi.mesh.device-max-packets:50}")
    private int deviceMaxPackets;

    // Seeding needs deviceMaxPackets, which @Value injects AFTER construction —
    // so this runs in @PostConstruct, not the constructor, where it would still be 0.
    @PostConstruct
    public void seedDefaultDevices() {
        // Default scenario: each of the 4 demo accounts has its own offline
        // phone (named to match — "phone-alice" holds alice@demo's packets,
        // etc., so DemoService.createPacket's startDevice can route an inject
        // to the right phone instead of always landing on phone-alice), plus
        // two separate relay phones ("bridge"/"edge") that aren't tied to any
        // account — they're just whoever happens to have signal right now.
        //
        // Two ONLINE relays is deliberate: gossip can copy the same packet to
        // both before either uploads, so a flush can genuinely deliver the
        // same packetId via two different bridgeNodeIds at once — this is
        // what the idempotency layer (and the pipeline trace panel's
        // DUPLICATE_DROPPED case) actually exists to defend against. With
        // only one online device this scenario can never occur live.
        devices.put("phone-alice", new VirtualDevice("phone-alice", false, deviceMaxPackets));
        devices.put("phone-bob",   new VirtualDevice("phone-bob",   false, deviceMaxPackets));
        devices.put("phone-carol", new VirtualDevice("phone-carol", false, deviceMaxPackets));
        devices.put("phone-dave",  new VirtualDevice("phone-dave",  false, deviceMaxPackets));
        devices.put("phone-bridge", new VirtualDevice("phone-bridge", true, deviceMaxPackets));
        devices.put("phone-edge",   new VirtualDevice("phone-edge",   true, deviceMaxPackets));
    }

    public Collection<VirtualDevice> getDevices() {
        return devices.values();
    }

    public VirtualDevice getDevice(String id) {
        return devices.get(id);
    }

    /**
     * Called once the backend has permanently resolved a packet (settled,
     * rejected, invalid, or duplicate — any terminal outcome). Removes it
     * from EVERY device, not just the one that flushed it, so offline phones
     * that received a copy via gossip but never got to flush don't keep
     * carrying dead weight (and wasting capacity) for something that's
     * already done.
     */
    public void purgePacket(String packetId) {
        devices.values().forEach(d -> d.forget(packetId));
    }

    /**
     * Demo-only toggle: flips a device between "has internet"/"offline,"
     * simulating a phone walking into or out of signal. Real devices decide
     * this themselves (ConnectivityManager callback); here it's an explicit
     * control so the UI can showcase what "online" actually gates.
     */
    public boolean toggleInternet(String deviceId) {
        VirtualDevice device = devices.get(deviceId);
        if (device == null) throw new IllegalArgumentException("Unknown device: " + deviceId);
        boolean next = !device.hasInternet();
        device.setHasInternet(next);
        log.info("Device {} connectivity toggled to {}", deviceId, next ? "ONLINE" : "OFFLINE");
        return next;
    }

    /**
     * Sender drops a packet into the mesh by handing it to their own device.
     */
    public void inject(String senderDeviceId, MeshPacket packet) {
        VirtualDevice sender = devices.get(senderDeviceId);
        if (sender == null) throw new IllegalArgumentException("Unknown device: " + senderDeviceId);
        if (!sender.hold(packet)) {
            throw new IllegalStateException(
                    "Device " + senderDeviceId + " is at capacity (" + sender.getMaxCapacity() +
                    " packets) — cannot inject a new packet until it frees up space");
        }
        log.info("Packet {} injected at {} (TTL={})",
                packet.getPacketId().substring(0, 8), senderDeviceId, packet.getTtl());
    }

    /**
     * One round of gossip. Every device shares everything it has with every
     * other device. TTL is decremented per hop; packets at TTL 0 stay where
     * they are but are not forwarded further.
     *
     * Real BLE gossip would be pair-by-pair when devices come into range.
     * For the demo we let everyone gossip with everyone in one round, which
     * is equivalent to "fast-forward N rounds of pairwise gossip".
     */
    public GossipResult gossipOnce() {
        int transfers = 0;
        int droppedForCapacity = 0;
        List<VirtualDevice> deviceList = new ArrayList<>(devices.values());

        // Snapshot what each device holds at the start of this round, so
        // we don't gossip the same packet through 5 devices in 1 step.
        Map<String, List<MeshPacket>> snapshot = new HashMap<>();
        for (VirtualDevice d : deviceList) {
            snapshot.put(d.getDeviceId(), new ArrayList<>(d.getHeldPackets()));
        }

        for (VirtualDevice src : deviceList) {
            for (MeshPacket pkt : snapshot.get(src.getDeviceId())) {
                if (pkt.getTtl() <= 0) continue;
                for (VirtualDevice dst : deviceList) {
                    if (dst == src) continue;
                    if (dst.holds(pkt.getPacketId())) continue;
                    MeshPacket copy = new MeshPacket();
                    copy.setPacketId(pkt.getPacketId());
                    copy.setTtl(pkt.getTtl() - 1);
                    copy.setCreatedAt(pkt.getCreatedAt());
                    copy.setCiphertext(pkt.getCiphertext());
                    if (dst.hold(copy)) {
                        transfers++;
                    } else {
                        droppedForCapacity++;
                    }
                }
            }
        }

        log.info("Gossip round complete: {} packet transfers, {} dropped for capacity",
                transfers, droppedForCapacity);
        return new GossipResult(transfers, droppedForCapacity, snapshotMap());
    }

    public Map<String, Integer> snapshotMap() {
        Map<String, Integer> m = new LinkedHashMap<>();
        for (VirtualDevice d : devices.values()) {
            m.put(d.getDeviceId(), d.packetCount());
        }
        return m;
    }

    /**
     * Returns all packets held by devices with internet — these are what would
     * be uploaded to the backend the moment they reach connectivity.
     */
    public List<BridgeUpload> collectBridgeUploads() {
        List<BridgeUpload> out = new ArrayList<>();
        for (VirtualDevice d : devices.values()) {
            if (!d.hasInternet()) continue;
            for (MeshPacket pkt : d.getHeldPackets()) {
                out.add(new BridgeUpload(d.getDeviceId(), pkt));
            }
        }
        return out;
    }

    public void resetMesh() {
        devices.values().forEach(VirtualDevice::clear);
    }

    public record GossipResult(int transfers, int droppedForCapacity, Map<String, Integer> deviceCounts) {}
    public record BridgeUpload(String bridgeNodeId, MeshPacket packet) {}
}
