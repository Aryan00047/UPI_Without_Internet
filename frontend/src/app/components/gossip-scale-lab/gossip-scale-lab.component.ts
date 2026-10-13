import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InfoTipComponent } from '../info-tip/info-tip.component';

interface SimDevice {
  x: number;
  y: number;
  isBridge: boolean;
  isOrigin: boolean;
}

interface SimResult {
  devices: SimDevice[];
  areaSize: number;
  rounds: number[][]; // rounds[r] = indices holding the packet as of round r (round 0 = just origin), cumulative
  firstHolderRound: (number | null)[]; // per device: round it first received the packet, or null if never
  reachedBridgeRound: number | null;
  /** The ONE bridge that actually settles the payment — same idempotency
   * story as the real demo above: whichever bridge gets there first wins.
   * Any OTHER bridge that later also receives the packet is rendered as a
   * duplicate (it would be DUPLICATE_DROPPED by the real backend), not a
   * second "success" — there is only ever one. */
  firstSuccessBridge: number | null;
  saturatedRound: number | null;
  reachableCount: number; // size of origin's connected component — the theoretical ceiling
}

const MAX_ROUNDS = 40;
const NO_GROWTH_LIMIT = 3;

/** Pure simulation: N devices scattered randomly in a square area, gossip
 * spreads only between devices within BLE range of each other (not a
 * global all-pairs mesh like the real demo's simplified MeshSimulatorService
 * — this is deliberately the more realistic, spatially-constrained model). */
function runGossipSimulation(
  deviceCount: number,
  areaSize: number,
  bleRange: number,
  fanout: number,
  bridgeCount: number
): SimResult {
  const devices: SimDevice[] = Array.from({ length: deviceCount }, () => ({
    x: Math.random() * areaSize,
    y: Math.random() * areaSize,
    isBridge: false,
    isOrigin: false
  }));

  const bridgeIdx = new Set<number>();
  while (bridgeIdx.size < Math.min(bridgeCount, deviceCount)) {
    bridgeIdx.add(Math.floor(Math.random() * deviceCount));
  }
  bridgeIdx.forEach((i) => (devices[i].isBridge = true));

  const origin = Math.floor(Math.random() * deviceCount);
  devices[origin].isOrigin = true;

  // Neighbor graph: edge if distance <= bleRange. O(N^2), fine at N<=300.
  const neighbors: number[][] = Array.from({ length: deviceCount }, () => []);
  for (let i = 0; i < deviceCount; i++) {
    for (let j = i + 1; j < deviceCount; j++) {
      const dx = devices[i].x - devices[j].x;
      const dy = devices[i].y - devices[j].y;
      if (Math.hypot(dx, dy) <= bleRange) {
        neighbors[i].push(j);
        neighbors[j].push(i);
      }
    }
  }

  // Theoretical ceiling: BFS reachable set from origin, independent of fanout.
  const reachable = new Set<number>([origin]);
  const queue = [origin];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbors[cur]) {
      if (!reachable.has(n)) {
        reachable.add(n);
        queue.push(n);
      }
    }
  }

  const firstHolderRound: (number | null)[] = new Array(deviceCount).fill(null);
  firstHolderRound[origin] = 0;

  let holders = new Set<number>([origin]);
  const rounds: number[][] = [[...holders]];
  let reachedBridgeRound: number | null = devices[origin].isBridge ? 0 : null;
  let firstSuccessBridge: number | null = devices[origin].isBridge ? origin : null;
  let saturatedRound: number | null = holders.size === reachable.size ? 0 : null;
  let noGrowthStreak = 0;

  for (let r = 1; r <= MAX_ROUNDS && saturatedRound === null; r++) {
    const next = new Set(holders);
    for (const h of holders) {
      const pool = neighbors[h];
      if (pool.length === 0) continue;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (let k = 0; k < Math.min(fanout, shuffled.length); k++) {
        next.add(shuffled[k]);
      }
    }
    const grew = next.size > holders.size;
    for (const i of next) {
      if (firstHolderRound[i] === null) firstHolderRound[i] = r;
    }
    holders = next;
    rounds.push([...holders]);

    if (reachedBridgeRound === null) {
      for (const i of holders) {
        if (devices[i].isBridge) {
          reachedBridgeRound = r;
          firstSuccessBridge = i;
          break;
        }
      }
    }
    if (saturatedRound === null && holders.size === reachable.size) {
      saturatedRound = r;
    }

    noGrowthStreak = grew ? 0 : noGrowthStreak + 1;
    if (noGrowthStreak >= NO_GROWTH_LIMIT) break;
  }

  return {
    devices, areaSize, rounds, firstHolderRound,
    reachedBridgeRound, firstSuccessBridge, saturatedRound, reachableCount: reachable.size
  };
}

@Component({
  selector: 'app-gossip-scale-lab',
  standalone: true,
  imports: [FormsModule, InfoTipComponent],
  template: `
    <div class="blueprint panel">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>

      <div class="title-row">
        <h3>Gossip at scale (simulator)</h3>
        <span class="subtitle">Not the real pipeline above — a standalone, spatial model proving why gossip stays fast at scale.</span>
        <app-info-tip text="Devices here are scattered randomly across a real area and can only gossip with others within BLE range — unlike the real demo above, which simplifies to 'everyone is always nearby' for clarity at 6 devices. This is where the device count/distance/fan-out story actually gets proven with numbers."></app-info-tip>
      </div>

      <div class="controls">
        <label class="field">
          <span>Sender</span>
          <input type="text" class="input" [(ngModel)]="senderName" maxlength="20">
        </label>
        <label class="field">
          <span>Receiver</span>
          <input type="text" class="input" [(ngModel)]="receiverName" maxlength="20">
        </label>
        <label class="field">
          <span>Amount (INR)</span>
          <input type="number" class="input" [(ngModel)]="amount" min="1">
        </label>
        <label class="field">
          <span>Devices</span>
          <input type="number" class="input" [(ngModel)]="deviceCount" min="5" max="300" step="5">
        </label>
        <label class="field">
          <span>Area (m)</span>
          <input type="number" class="input" [(ngModel)]="areaSize" min="50" max="2000" step="50">
        </label>
        <label class="field">
          <span>BLE range (m) <app-info-tip text="How far apart two devices can be and still gossip directly — real BLE is roughly 10-50m. Two devices farther apart than this never exchange packets with each other, even indirectly, unless some other device bridges the gap."></app-info-tip></span>
          <input type="number" class="input" [(ngModel)]="bleRange" min="5" max="200" step="5">
        </label>
        <label class="field">
          <span>Fan-out <app-info-tip text="How many random neighbors each holder gossips to per round. Fan-out 1 spreads roughly linearly (slow); fan-out 2+ spreads exponentially (fast) — this is the single biggest lever on how many rounds it takes to reach a bridge."></app-info-tip></span>
          <input type="number" class="input" [(ngModel)]="fanout" min="1" max="5" step="1">
        </label>
        <label class="field">
          <span>Bridges <app-info-tip text="How many of the N devices have internet signal and could relay the packet to the bank. More bridges means more chances the gossip wave happens to reach one quickly — same idea as phone-bridge/phone-edge in the real demo above, just more of them."></app-info-tip></span>
          <input type="number" class="input" [(ngModel)]="bridgeCount" min="1" [max]="deviceCount" step="1">
        </label>
        <button class="btn btn-primary run-btn" (click)="run()">
          {{ playing() ? 'Playing... (round ' + selectedRound() + ')' : 'Run simulation' }}
        </button>
      </div>

      @if (result(); as res) {
        <div class="stats">
          <span class="stat-line" [class.ok]="res.reachedBridgeRound !== null" [class.bad]="res.reachedBridgeRound === null">
            {{ res.reachedBridgeRound !== null
              ? 'Reached a bridge in round ' + res.reachedBridgeRound
              : 'Never reached a bridge within ' + (res.rounds.length - 1) + ' rounds — too sparse for this range/fan-out' }}
          </span>
          <span class="stat-line" [class.ok]="res.saturatedRound !== null" [class.bad]="res.saturatedRound === null">
            {{ res.saturatedRound !== null
              ? 'Fully saturated (all reachable devices) in round ' + res.saturatedRound
              : res.rounds[res.rounds.length - 1].length + ' of ' + res.reachableCount + ' reachable devices got it — stalled, rest unreachable at this range/fan-out' }}
          </span>
          @if (res.reachableCount < res.devices.length) {
            <span class="stat-line dim">{{ res.devices.length - res.reachableCount }} device(s) are outside the origin's connected component entirely — no path exists at this BLE range.</span>
          }
        </div>

        <div class="chart">
          @for (count of res.rounds; track $index; let i = $index) {
            <div class="bar-col" [class.selected]="i === selectedRound()" (click)="selectedRoundValue = i">
              <div class="bar" [style.height.%]="(count.length / res.devices.length) * 100"></div>
              <span class="bar-label">{{ i }}</span>
            </div>
          }
        </div>

        <div class="scrub">
          <span class="section-label">Round {{ selectedRound() }} of {{ res.rounds.length - 1 }}</span>
          <input type="range" class="slider" [min]="0" [max]="res.rounds.length - 1" [(ngModel)]="selectedRoundValue">
          <span class="holder-count">{{ res.rounds[selectedRound()].length }} / {{ res.devices.length }} holding</span>
        </div>

        <div class="caption" [class.success]="isBridgeRound(res)">{{ stepCaption(res) }}</div>

        <div class="map-wrap">
          <svg [attr.viewBox]="'0 0 400 400'" class="scatter" preserveAspectRatio="xMidYMid meet">
            <rect x="0" y="0" width="400" height="400" class="scatter-bg"></rect>

            @for (d of res.devices; track $index; let i = $index) {
              @if (d.isOrigin) {
                <!-- continuous spiral ping marks the origin for the whole playback -->
                <circle class="origin-ping" [attr.cx]="px(res, d)" [attr.cy]="py(res, d)"></circle>
              }
            }

            @for (d of res.devices; track $index; let i = $index) {
              @if (d.isBridge) {
                <rect class="dot bridge-dot"
                      [class.holding]="holdsAt(res, i)"
                      [class.success]="holdsAt(res, i) && i === res.firstSuccessBridge"
                      [class.duplicate]="holdsAt(res, i) && i !== res.firstSuccessBridge"
                      [class.success-burst]="justReceivedAt(res, i) && i === res.firstSuccessBridge"
                      [class.duplicate-flash]="justReceivedAt(res, i) && i !== res.firstSuccessBridge"
                      [attr.x]="px(res, d) - 5" [attr.y]="py(res, d) - 5" width="10" height="10"
                      [attr.transform]="'rotate(45 ' + px(res, d) + ' ' + py(res, d) + ')'">
                </rect>
              } @else {
                <circle class="dot"
                        [class.holding]="holdsAt(res, i)"
                        [class.origin]="d.isOrigin"
                        [class.just-received]="justReceivedAt(res, i) && !d.isOrigin"
                        [attr.cx]="px(res, d)" [attr.cy]="py(res, d)"
                        [attr.r]="d.isOrigin ? 5 : 3">
                </circle>
              }
            }
          </svg>

          @if (notifications().length) {
            <div class="phone-mock phone-left">
              <div class="phone-notch"></div>
              <div class="phone-owner">{{ senderName || 'Sender' }}'s phone</div>
              <div class="phone-screen">
                @for (n of notifications(); track n.id) {
                  @if (n.kind === 'sender') {
                    <div class="phone-toast" (click)="dismissNotification(n.id)">
                      <span class="toast-icon">✅</span>
                      <span class="toast-text">{{ n.text }}</span>
                    </div>
                  }
                }
              </div>
              <div class="phone-home-bar"></div>
            </div>
            <div class="phone-mock phone-right">
              <div class="phone-notch"></div>
              <div class="phone-owner">{{ receiverName || 'Receiver' }}'s phone</div>
              <div class="phone-screen">
                @for (n of notifications(); track n.id) {
                  @if (n.kind === 'receiver') {
                    <div class="phone-toast" (click)="dismissNotification(n.id)">
                      <span class="toast-icon">💰</span>
                      <span class="toast-text">{{ n.text }}</span>
                    </div>
                  }
                }
              </div>
              <div class="phone-home-bar"></div>
            </div>
          }
        </div>

        <div class="legend">
          <span class="legend-item"><span class="legend-dot plain"></span>No signal yet</span>
          <span class="legend-item"><span class="legend-dot holding"></span>Holding packet</span>
          <span class="legend-item"><span class="legend-square"></span>Bridge (not yet reached)</span>
          <span class="legend-item"><span class="legend-square success"></span>First bridge — SETTLED</span>
          <span class="legend-item"><span class="legend-square duplicate"></span>Later bridge — DUPLICATE_DROPPED</span>
          <span class="legend-item"><span class="legend-dot origin"></span>Origin</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .panel { padding: 18px 18px 14px; display: flex; flex-direction: column; gap: 14px; }

    .title-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
    .title-row h3 { margin: 0; font-size: 20px; }
    .subtitle { font-size: 13px; color: var(--color-text-soft); }

    .controls { display: flex; flex-wrap: wrap; align-items: end; gap: 10px 14px; }
    .field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--color-text-muted); }
    .field span { display: inline-flex; align-items: center; gap: 4px; }
    .field .input { width: 90px; }
    .run-btn { font-size: 15px; padding: 9px 16px; }

    .stats { display: flex; flex-direction: column; gap: 4px; }
    .stat-line { font-size: 14px; font-family: var(--font-mono); }
    .stat-line.ok { color: var(--color-settled); }
    .stat-line.bad { color: var(--color-rejected); }
    .stat-line.dim { color: var(--color-text-muted); font-size: 12.5px; }

    .chart { display: flex; align-items: flex-end; gap: 2px; height: 90px; overflow-x: auto; padding-bottom: 2px; }
    .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; flex: none; width: 10px; cursor: pointer; }
    .bar { width: 100%; background: var(--color-accent); min-height: 2px; transition: background-color 150ms ease; }
    .bar-col.selected .bar { background: var(--color-text); }
    .bar-label { font-size: 8px; color: var(--color-text-muted); margin-top: 2px; }

    .scrub { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .slider { flex: 1; min-width: 160px; accent-color: var(--color-accent); }
    .holder-count { font-family: var(--font-mono); font-size: 12.5px; color: var(--color-text-soft); }

    .caption {
      font-size: 14px; font-family: var(--font-mono); color: var(--color-text-soft);
      min-height: 20px; padding: 6px 10px; border-left: 2px solid var(--color-divider);
      transition: border-color 200ms ease, color 200ms ease;
    }
    .caption.success { border-left-color: var(--color-settled); color: var(--color-settled); }

    .scatter { width: 100%; max-width: 420px; height: auto; display: block; margin: 0 auto; }
    .scatter-bg { fill: var(--color-bg); stroke: var(--color-divider); stroke-width: 1; }

    .dot { fill: var(--color-text-muted); opacity: 0.45; transition: fill 200ms ease, opacity 200ms ease; }
    .dot.holding { fill: var(--color-accent); opacity: 1; }
    .dot.origin { fill: var(--color-text); opacity: 1; }

    /* one-shot pop when a device first receives the packet this round */
    .dot.just-received { animation: pop 650ms ease-out; }
    @keyframes pop {
      0% { r: 3px; opacity: 0.3; }
      40% { r: 7px; opacity: 1; }
      100% { r: 3px; opacity: 1; }
    }

    /* origin: continuous expanding ping, for the whole time a result is shown */
    .origin-ping {
      fill: none; stroke: var(--color-text); stroke-width: 1.5;
      r: 5px; opacity: 0.7;
      animation: origin-spiral 1.8s ease-out infinite;
    }
    @keyframes origin-spiral {
      0% { r: 5px; opacity: 0.7; }
      100% { r: 22px; opacity: 0; }
    }

    /* bridges render as diamonds (rotated squares) — shape, not just color,
       distinguishes them so it still reads for colorblind viewers. Only the
       FIRST bridge to get the packet turns settled-green (the real
       SETTLED); any other bridge that later gets it shows the duplicate
       color instead — it would be DUPLICATE_DROPPED by the real backend,
       not a second success. */
    .bridge-dot { fill: var(--color-bg); stroke: var(--color-duplicate); stroke-width: 1.5; opacity: 0.9; transition: fill 200ms ease, stroke 200ms ease; }
    .bridge-dot.success { fill: var(--color-settled); stroke: var(--color-settled); opacity: 1; }
    .bridge-dot.duplicate { fill: var(--color-duplicate); stroke: var(--color-duplicate); opacity: 1; }
    .bridge-dot.success-burst { animation: bridge-success 900ms ease-out; }
    .bridge-dot.duplicate-flash { animation: bridge-duplicate 600ms ease-out; }
    @keyframes bridge-success {
      0% { stroke-width: 1.5; }
      30% { stroke-width: 6px; stroke: var(--color-settled); }
      100% { stroke-width: 1.5; }
    }
    @keyframes bridge-duplicate {
      0%, 100% { transform-origin: center; }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }

    .map-wrap { position: relative; min-width: 0; }

    /* Two little phone silhouettes flanking the map — sender's push
       notification lands on the left, receiver's on the right, so the
       "bridge settled" moment visibly ties back to two real people. */
    .phone-mock {
      position: absolute; top: 50%; transform: translateY(-50%);
      width: 148px; height: 300px; background: #0b0d11; border: 3px solid var(--color-divider);
      border-radius: 30px; padding: 16px 10px 14px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      animation: phone-in 350ms ease-out;
      display: flex; flex-direction: column;
    }
    /* Side buttons, like a real handset — power on the right rail, volume
       rocker on the left rail, so the silhouette reads as a phone even with
       no screen content. */
    .phone-mock::before, .phone-mock::after {
      content: ''; position: absolute; background: var(--color-divider); border-radius: 2px;
    }
    .phone-mock::before { width: 3px; height: 34px; right: -3px; top: 70px; }
    .phone-mock::after { width: 3px; height: 50px; left: -3px; top: 60px; }
    .phone-left { left: 4px; }
    .phone-right { right: 4px; }
    .phone-notch {
      flex: none; width: 44px; height: 6px; background: var(--color-divider); border-radius: 3px;
      margin: 0 auto 10px;
    }
    .phone-owner {
      flex: none; font-size: 10px; text-align: center; color: var(--color-text-soft);
      text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 10px;
    }
    .phone-screen { flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow: hidden; }
    .phone-toast {
      flex: none; background: var(--color-surface); border: 1px solid var(--color-settled);
      border-left-width: 3px; border-radius: 6px; padding: 9px 10px; cursor: pointer;
      animation: toast-in 300ms ease-out;
    }
    .phone-right .phone-toast { border-color: var(--color-accent); }
    .phone-toast .toast-icon { font-size: 16px; display: block; margin-bottom: 3px; }
    .phone-toast .toast-text { font-size: 12px; line-height: 1.4; color: var(--color-text); }
    .phone-home-bar {
      flex: none; width: 54px; height: 4px; background: var(--color-divider); border-radius: 2px;
      margin: 10px auto 0;
    }
    @keyframes toast-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes phone-in { from { opacity: 0; transform: translateY(-50%) scale(0.9); } to { opacity: 1; transform: translateY(-50%) scale(1); } }

    @media (max-width: 560px) {
      .phone-mock { position: static; transform: none; width: auto; height: auto; margin-bottom: 8px; animation: none; }
      .phone-mock::before, .phone-mock::after { display: none; }
    }

    .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--color-text-soft); justify-content: center; }
    .legend-item { display: inline-flex; align-items: center; gap: 6px; }
    .legend-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--color-text-muted); opacity: 0.55; }
    .legend-dot.holding { background: var(--color-accent); opacity: 1; }
    .legend-dot.origin { background: var(--color-text); opacity: 1; }
    .legend-square { width: 8px; height: 8px; background: var(--color-bg); border: 1.5px solid var(--color-duplicate); transform: rotate(45deg); }
    .legend-square.success { background: var(--color-settled); border-color: var(--color-settled); }
    .legend-square.duplicate { background: var(--color-duplicate); border-color: var(--color-duplicate); }
  `]
})
export class GossipScaleLabComponent implements OnDestroy {
  // Defaults land comfortably above the random-geometric-graph percolation
  // threshold (~5 expected neighbors/device) so the first run clearly
  // succeeds — push area up or range down from here to see it fail instead.
  deviceCount = 80;
  areaSize = 250;
  bleRange = 40;
  fanout = 2;
  bridgeCount = 3;

  // Purely narrative — no real money moves here, this is a standalone
  // spatial simulator, not the real backend. Just gives the abstract
  // "packet reaches a bridge" moment a human story to attach to.
  senderName = 'You';
  receiverName = 'Friend';
  amount = 250;

  result = signal<SimResult | null>(null);
  selectedRound = signal(0);
  playing = signal(false);
  notifications = signal<{ id: string; kind: 'sender' | 'receiver'; text: string }[]>([]);
  private notifiedThisRun = false;

  private playTimer: ReturnType<typeof setTimeout> | null = null;
  // Slower than the real-pipeline animations elsewhere — the whole point of
  // this panel is being able to actually follow each step, not just see a
  // blur of color changes.
  private readonly STEP_MS = 1100;

  get selectedRoundValue(): number {
    return this.selectedRound();
  }
  set selectedRoundValue(v: number) {
    // Dragging the slider (or clicking a bar) manually interrupts playback —
    // scrubbing should always win over the auto-play timer still ticking.
    this.stopPlaying();
    this.selectedRound.set(Number(v));
  }

  ngOnDestroy(): void {
    this.stopPlaying();
  }

  private stopPlaying(): void {
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    this.playing.set(false);
  }

  /** Steps through round 0, 1, 2, ... on a visible delay instead of jumping
   * straight to the final state — the whole point is watching it spread. */
  private playFrom(round: number, lastRound: number): void {
    this.selectedRound.set(round);

    const res = this.result();
    if (res && !this.notifiedThisRun && round === res.reachedBridgeRound) {
      this.notifiedThisRun = true;
      this.fireNotifications();
    }

    if (round >= lastRound) {
      this.playing.set(false);
      this.playTimer = null;
      return;
    }
    this.playTimer = setTimeout(() => this.playFrom(round + 1, lastRound), this.STEP_MS);
  }

  /** Simulates the real UPI "payment successful" push notification both
   * sides get the moment the FIRST bridge settles it — ties the abstract
   * "packet reached a bridge" moment to the actual sender/receiver story.
   * Deliberately does NOT auto-schedule anything after this that could
   * throw — a thrown error here would otherwise silently stop playFrom's
   * setTimeout chain from ever scheduling its next round. */
  private fireNotifications(): void {
    // [(ngModel)] on a number input can still hand back a string in some
    // browsers/edge cases — coerce explicitly so .toFixed never throws.
    const amt = (Number(this.amount) || 0).toFixed(2);
    const sender = this.senderName || 'Sender';
    const receiver = this.receiverName || 'Receiver';
    const toSender = {
      id: `s-${Date.now()}`,
      kind: 'sender' as const,
      text: `₹${amt} sent to ${receiver} — payment successful`
    };
    const toReceiver = {
      id: `r-${Date.now()}`,
      kind: 'receiver' as const,
      text: `You received ₹${amt} from ${sender}`
    };
    // Persist until the next run (cleared there) rather than auto-dismiss —
    // playback can run for many more seconds after this fires, so a timed
    // fade risks vanishing before anyone actually looks at it.
    this.notifications.update((list) => [...list, toSender, toReceiver]);
  }

  dismissNotification(id: string): void {
    this.notifications.update((list) => list.filter((n) => n.id !== id));
  }

  run(): void {
    this.stopPlaying();
    this.notifiedThisRun = false;
    this.notifications.set([]);
    const res = runGossipSimulation(
      Math.max(5, Math.min(300, this.deviceCount)),
      Math.max(50, Math.min(2000, this.areaSize)),
      Math.max(5, Math.min(200, this.bleRange)),
      Math.max(1, Math.min(5, this.fanout)),
      Math.max(1, Math.min(this.deviceCount, this.bridgeCount))
    );
    this.result.set(res);
    this.playing.set(true);
    // Once the first bridge settles it, the payment is DONE — in the real
    // pipeline that packet gets purged off every device at that instant
    // (MeshSimulatorService.purgePacket). Auto-play stops at that round
    // instead of continuing to spread a resolved packet across the rest of
    // the mesh; the slider still goes further if you want to manually
    // explore what full saturation would have looked like.
    const autoplayEnd = res.reachedBridgeRound ?? res.rounds.length - 1;
    this.playFrom(0, autoplayEnd);
  }

  px(res: SimResult, d: SimDevice): number {
    return (d.x / res.areaSize) * 400;
  }
  py(res: SimResult, d: SimDevice): number {
    return (d.y / res.areaSize) * 400;
  }

  holdsAt(res: SimResult, deviceIndex: number): boolean {
    const r = res.firstHolderRound[deviceIndex];
    return r !== null && r <= this.selectedRound();
  }

  /** True only for the exact round a device first received the packet —
   * drives the one-shot pop/burst animations, not a persistent state. */
  justReceivedAt(res: SimResult, deviceIndex: number): boolean {
    return res.firstHolderRound[deviceIndex] === this.selectedRound();
  }

  isBridgeRound(res: SimResult): boolean {
    return res.reachedBridgeRound === this.selectedRound();
  }

  /** Plain-language narration of exactly what happened this round — the
   * "make every step obvious" requirement. */
  stepCaption(res: SimResult): string {
    const r = this.selectedRound();
    if (r === 0) {
      return 'Round 0: the packet exists on the origin device only — nobody else has it yet.';
    }
    const prevHolders = new Set(res.rounds[r - 1]);
    const newcomers = res.rounds[r].filter((i) => !prevHolders.has(i));
    if (newcomers.length === 0) {
      return `Round ${r}: no new devices reached this round — gossip has exhausted every device it can reach from here.`;
    }
    const newBridges = newcomers.filter((i) => res.devices[i].isBridge);
    if (newBridges.includes(res.firstSuccessBridge as number)) {
      return `Round ${r}: a bridge reached the bank — ₹${this.amount.toFixed(2)} from ${this.senderName} to ${this.receiverName} just SETTLED.`;
    }
    if (newBridges.length > 0) {
      return `Round ${r}: another bridge also received this packet — too late, the real backend would drop this as DUPLICATE_DROPPED (already settled above).`;
    }
    return `Round ${r}: ${newcomers.length} new device(s) received the packet via gossip (${res.rounds[r].length} holding so far).`;
  }
}
