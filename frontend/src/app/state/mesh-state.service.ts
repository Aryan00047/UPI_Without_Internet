import { Injectable, computed, signal } from '@angular/core';
import { Subject, forkJoin } from 'rxjs';
import { MeshApiService } from '../services/mesh-api.service';
import {
  Account,
  ActivityLogEntry,
  DemoSendRequest,
  FlushResultEntry,
  IngestOutcome,
  MeshDevice,
  PipelineStage,
  PipelineTraceEntry,
  StageStatus,
  Transaction
} from '../models/mesh.models';

/** Fired for the Mesh Proximity View to animate — not persisted state, just
 * transient "something happened" events. The view subscribes and animates,
 * nothing else depends on this stream. */
export type ProximityEvent =
  | { type: 'inject'; deviceId: string }
  | { type: 'gossip'; transfers: number }
  | { type: 'hop'; from: string; to: string; packetId: string }
  | { type: 'flush'; deviceId: string; outcome: IngestOutcome; packetId: string; reason: string };

export interface DuplicateRefusal {
  key: string;
  time: string;
  packetId: string;
  from: string;
  to: string;
  why: string;
}

const STAGE_NAMES: PipelineStage['name'][] = ['Idempotency', 'Decrypt', 'Signature', 'Freshness', 'Settle'];

/** Maps an INVALID/REJECTED reason to the 0-indexed stage it fails at.
 * Mirrors the backend's actual pipeline order in BridgeIngestionService.ingest().
 * NOT used for DUPLICATE_DROPPED — the backend sends reason:"" for that
 * outcome (see IngestResult.duplicate()), so duplicate-ness is read off
 * `outcome` directly, not matched against this table. */
const FAIL_STAGE: Record<string, number> = {
  decryption_failed: 1,
  unknown_sender_key: 2,
  invalid_signature: 2,
  stale_packet: 3,
  future_dated: 3,
  insufficient_funds: 4
};

/** Pure function: derive the FINAL 5-stage checklist from one flush result.
 * Used as the animation's target — see runAnimationQueue below for how a
 * trace entry progresses from all-pending to this over a few hundred ms. */
export function deriveStages(outcome: IngestOutcome, reason: string | null | undefined): PipelineStage[] {
  let failIndex: number;
  if (outcome === 'DUPLICATE_DROPPED') {
    failIndex = 0; // always fails at Idempotency, regardless of the (empty) reason text
  } else if (outcome === 'SETTLED') {
    failIndex = -1;
  } else {
    failIndex = reason ? FAIL_STAGE[reason] ?? -1 : -1;
  }
  return STAGE_NAMES.map((name, i) => {
    let status: StageStatus;
    if (failIndex < 0) status = 'passed';
    else if (i < failIndex) status = 'passed';
    else if (i === failIndex) status = 'failed';
    else status = 'not-reached';
    return { name, status };
  });
}

const TRACE_LIMIT = 20;
const LOG_LIMIT = 80;
const POLL_MS = 3000;
const STAGE_REVEAL_MS = 180;
const ENTRY_PAUSE_MS = 360;

interface AnimationJob {
  key: string;
  target: PipelineStage[];
}

@Injectable({ providedIn: 'root' })
export class MeshStateService {
  readonly devices = signal<MeshDevice[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly activityLog = signal<ActivityLogEntry[]>([]);
  readonly pipelineTrace = signal<PipelineTraceEntry[]>([]);
  readonly idempotencyCacheSize = signal(0);
  readonly flushing = signal(false);
  /** True for the whole 3-round gossip sequence, not just one call — guards
   * against the button being clicked again mid-sequence, which previously
   * stacked up multiple overlapping 3-round runs and spammed the log. */
  readonly gossiping = signal(false);
  readonly gossipRound = signal(0);
  /** Short (8-char) id of the most recently injected packet, for the
   * Mesh Proximity view's "holds tracked packet" indicator. Matches the
   * short form /api/mesh/state already returns in MeshDevice.packetIds. */
  readonly trackedPacketId = signal<string | null>(null);
  /** Last few DUPLICATE_DROPPED flush outcomes — the server's idempotency
   * cache refusing a packet it already claimed. Capped like the design's
   * own "Duplicate refusals" panel. */
  readonly duplicateRefusals = signal<DuplicateRefusal[]>([]);

  readonly nodesOnline = computed(() => {
    const d = this.devices();
    return `${d.filter((x) => x.hasInternet).length}/${d.length}`;
  });
  readonly packetsInMesh = computed(() =>
    this.devices().reduce((sum, d) => sum + d.packetCount, 0)
  );
  readonly settledCount = computed(
    () => this.transactions().filter((t) => t.status === 'SETTLED').length
  );

  readonly proximityEvents = new Subject<ProximityEvent>();

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private animQueue: AnimationJob[] = [];
  private animating = false;

  constructor(private api: MeshApiService) {}

  startPolling(): void {
    if (this.pollHandle) return;
    this.refresh();
    this.pollHandle = setInterval(() => this.refresh(), POLL_MS);
  }

  stopPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  refresh(): void {
    forkJoin({
      mesh: this.api.getMeshState(),
      accounts: this.api.getAccounts(),
      transactions: this.api.getTransactions()
    }).subscribe(({ mesh, accounts, transactions }) => {
      this.devices.set(mesh.devices);
      this.idempotencyCacheSize.set(mesh.idempotencyCacheSize);
      this.accounts.set(accounts);
      this.transactions.set(transactions);
    });
  }

  private addLog(message: string): void {
    this.activityLog.update((log) =>
      [{ time: new Date().toTimeString().slice(0, 8), message }, ...log].slice(0, LOG_LIMIT)
    );
  }

  injectPacket(req: DemoSendRequest): void {
    this.api.sendDemoPacket(req).subscribe({
      next: (res) => {
        this.addLog(
          `inject ${res.packetId.slice(0, 8)} on ${res.injectedAt}: ${req.senderVpa} → ${req.receiverVpa} ₹${req.amount.toFixed(2)}`
        );
        this.trackedPacketId.set(res.packetId.slice(0, 8));
        this.proximityEvents.next({ type: 'inject', deviceId: res.injectedAt });
        this.refresh();
      },
      error: (err) => this.addLog(`inject failed: ${err.error?.message ?? err.message}`)
    });
  }

  private readonly GOSSIP_ROUNDS = 3;
  private readonly ROUND_GAP_MS = 1800;

  /** Runs 3 real backend gossip calls back to back (matching the approved
   * design's "Run gossip (3 rounds)" behavior) instead of requiring the
   * user to click multiple times. Each round diffs device holdings
   * before/after to find which devices actually newly received the
   * currently-tracked packet, and animates that real hop sequence in Mesh
   * Proximity — the backend doesn't return per-hop pairs, but before/after
   * holdings are enough to reconstruct them for one packet. */
  runGossip(): void {
    if (this.gossiping()) return;
    this.gossiping.set(true);
    this.runGossipRound(1);
  }

  private runGossipRound(round: number): void {
    this.gossipRound.set(round);
    const beforeMap = new Map(this.devices().map((d) => [d.deviceId, new Set(d.packetIds)]));
    this.api.gossip().subscribe((res) => {
      this.addLog(
        `gossip round ${round}/${this.GOSSIP_ROUNDS}: ${res.transfers} copies moved, ${res.droppedForCapacity} dropped for capacity`
      );

      this.api.getMeshState().subscribe((mesh) => {
        this.devices.set(mesh.devices);
        this.idempotencyCacheSize.set(mesh.idempotencyCacheSize);

        const tracked = this.trackedPacketId();
        const hops: { from: string; to: string }[] = [];
        if (tracked) {
          for (const d of mesh.devices) {
            const hadBefore = beforeMap.get(d.deviceId)?.has(tracked) ?? false;
            if (!hadBefore && d.packetIds.includes(tracked)) {
              const source = mesh.devices.find(
                (s) => s.deviceId !== d.deviceId && (beforeMap.get(s.deviceId)?.has(tracked) ?? false)
              );
              if (source) hops.push({ from: source.deviceId, to: d.deviceId });
            }
          }
        }
        if (hops.length > 0) {
          this.animateHopsSequentially(hops, tracked!);
        } else {
          this.proximityEvents.next({ type: 'gossip', transfers: res.transfers });
        }

        if (round < this.GOSSIP_ROUNDS) {
          setTimeout(() => this.runGossipRound(round + 1), this.ROUND_GAP_MS);
        } else {
          this.gossiping.set(false);
          this.gossipRound.set(0);
          this.refresh();
        }
      });
    });
  }

  private animateHopsSequentially(hops: { from: string; to: string }[], packetId: string): void {
    let i = 0;
    const next = () => {
      if (i >= hops.length) return;
      const h = hops[i++];
      this.proximityEvents.next({ type: 'hop', from: h.from, to: h.to, packetId });
      setTimeout(next, 1300);
    };
    next();
  }

  toggleDeviceInternet(deviceId: string): void {
    this.api.toggleInternet(deviceId).subscribe((res) => {
      this.addLog(`${deviceId} connectivity → ${res.hasInternet ? 'ONLINE' : 'OFFLINE'}`);
      this.refresh();
    });
  }

  flushBridges(): void {
    this.flushing.set(true);
    this.api.flush().subscribe({
      next: (res) => {
        if (res.results.length === 0) {
          this.addLog('flush: no online node holds packets');
        } else {
          const bridges = [...new Set(res.results.map((r) => r.bridgeNode))].join(', ');
          this.addLog(`flush: ${bridges} ingesting ${res.results.length} packets`);
          this.recordTrace(res.results);
          res.results.forEach((r, i) => {
            this.addLog(`ingest ${r.packetId} via ${r.bridgeNode}: ${r.outcome}${r.reason ? ' (' + r.reason + ')' : ''}`);
            if (r.outcome === 'DUPLICATE_DROPPED') {
              this.duplicateRefusals.update((list) =>
                [
                  {
                    key: `${r.packetId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    time: new Date().toTimeString().slice(0, 8),
                    packetId: r.packetId,
                    from: r.bridgeNode,
                    to: 'bank',
                    why: 'idempotency cache hit — already claimed by an earlier delivery, dropped before decrypt'
                  },
                  ...list
                ].slice(0, 6)
              );
            }
            setTimeout(
              () =>
                this.proximityEvents.next({
                  type: 'flush',
                  deviceId: r.bridgeNode,
                  outcome: r.outcome,
                  packetId: r.packetId,
                  reason: r.reason
                }),
              i * 150
            );
          });
        }
        this.flushing.set(false);
        // Refresh now (so device/ledger panels aren't stuck mid-flush) and
        // again once the trace animation finishes settling, since the
        // ledger/balances are already final server-side but the trace
        // panel is still visually catching up to them.
        this.refresh();
      },
      error: () => this.flushing.set(false)
    });
  }

  resetMesh(): void {
    this.api.reset().subscribe(() => {
      this.addLog('mesh reset: packets cleared, idempotency cache emptied');
      this.pipelineTrace.set([]);
      this.trackedPacketId.set(null);
      this.duplicateRefusals.set([]);
      this.animQueue = [];
      this.animating = false;
      this.refresh();
    });
  }

  /** Inserts trace entries immediately in a 'pending' state, then animates
   * each one's stages revealing in sequence — mirrors the approved design's
   * own staged-reveal behavior instead of snapping straight to the final
   * pass/fail state. */
  private recordTrace(results: FlushResultEntry[]): void {
    const jobs: { entry: PipelineTraceEntry; target: PipelineStage[] }[] = results.map((r) => {
      const target = deriveStages(r.outcome, r.reason || null);
      const entry: PipelineTraceEntry = {
        key: `${r.packetId}-${r.transactionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        hash: r.packetId,
        bridgeNode: r.bridgeNode,
        time: new Date().toTimeString().slice(0, 8),
        outcome: r.outcome,
        reason: r.reason,
        stages: target.map((s) => ({ name: s.name, status: 'pending' as StageStatus }))
      };
      return { entry, target };
    });

    this.pipelineTrace.update((trace) => [...jobs.map((j) => j.entry), ...trace].slice(0, TRACE_LIMIT));
    this.animQueue.push(...jobs.map(({ entry, target }) => ({ key: entry.key, target })));
    if (!this.animating) this.runAnimationQueue();
  }

  private runAnimationQueue(): void {
    const job = this.animQueue.shift();
    if (!job) {
      this.animating = false;
      return;
    }
    this.animating = true;
    this.animateStage(job.key, job.target, 0);
  }

  private animateStage(key: string, target: PipelineStage[], index: number): void {
    if (index >= target.length) {
      setTimeout(() => this.runAnimationQueue(), ENTRY_PAUSE_MS);
      return;
    }
    this.setStage(key, index, 'checking');
    setTimeout(() => {
      const finalStatus = target[index].status;
      if (finalStatus === 'failed') {
        this.setStage(key, index, 'failed');
        for (let i = index + 1; i < target.length; i++) this.setStage(key, i, 'not-reached');
        setTimeout(() => this.runAnimationQueue(), ENTRY_PAUSE_MS);
      } else {
        this.setStage(key, index, 'passed');
        this.animateStage(key, target, index + 1);
      }
    }, STAGE_REVEAL_MS);
  }

  private setStage(key: string, index: number, status: StageStatus): void {
    this.pipelineTrace.update((trace) =>
      trace.map((e) => {
        if (e.key !== key) return e;
        return { ...e, stages: e.stages.map((s, i) => (i === index ? { ...s, status } : s)) };
      })
    );
  }
}
