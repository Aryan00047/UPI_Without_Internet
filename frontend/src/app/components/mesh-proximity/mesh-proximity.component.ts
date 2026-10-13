import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { InfoTipComponent } from '../info-tip/info-tip.component';
import { MeshStateService } from '../../state/mesh-state.service';
import { IngestOutcome, MeshDevice } from '../../models/mesh.models';

interface Point { x: number; y: number; }

/** Exact hexagon layout from the approved Claude Design canvas
 * (UPI Mesh Console.dc.html, Component.POS) — ported 1:1. The backend's
 * device ids (phone-alice/bob/carol/dave/bridge/edge, one per demo account
 * plus two account-less relay phones) now match the mockup's own fake
 * device set exactly, so no remapping is needed. */
const POSITIONS: Record<string, Point> = {
  'phone-alice': { x: 166, y: 103 },
  'phone-dave': { x: 230, y: 66 },
  'phone-bridge': { x: 294, y: 103 },
  'phone-edge': { x: 294, y: 177 },
  'phone-carol': { x: 230, y: 214 },
  'phone-bob': { x: 166, y: 177 }
};
const BANK: Point = { x: 640, y: 62 };
const ZONE = { cx: 230, cy: 140, r: 120 };
const VIEW = { x: 0, y: -20, w: 760, h: 300 };

const OUTCOME_VAR: Record<IngestOutcome, string> = {
  SETTLED: 'var(--color-settled)',
  REJECTED: 'var(--color-rejected)',
  DUPLICATE_DROPPED: 'var(--color-duplicate)',
  INVALID: 'var(--color-invalid)'
};

interface Pulse {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
  durationMs: number;
}

interface FloatingTag {
  id: string;
  x: number; y: number;
  text: string;
  color: string;
}

interface PulsingNode {
  deviceId: string;
  until: number;
}

@Component({
  selector: 'app-mesh-proximity',
  standalone: true,
  imports: [InfoTipComponent],
  template: `
    <div class="blueprint panel">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>

      <div class="title-row">
        <h3>Mesh proximity</h3>
        <span class="subtitle">Gossip stays inside the zone. Only a phone with signal reaches the bank.</span>
        <span class="hint">positions illustrative <app-info-tip text="Illustrative layout, not a real map — there's no GPS data. phone-alice/bob/carol/dave are each demo account's own phone; phone-bridge and phone-edge aren't tied to any account — they're just whoever happens to have signal and can relay for everyone else. Click a node to toggle its signal."></app-info-tip>, click a node to toggle signal</span>
      </div>

      <div class="legend">
        <span class="legend-item"><span class="legend-dot online"></span>Has signal, linked to bank</span>
        <span class="legend-item"><span class="legend-dot offline"></span>No signal, relay only</span>
        <span class="legend-item"><span class="legend-text">n</span>Packets held</span>
        <span class="legend-item"><span class="legend-ring"></span>Holds tracked packet</span>
      </div>

      <div class="scene-wrap">
        <svg [attr.viewBox]="viewBoxStr" class="scene" preserveAspectRatio="xMidYMid meet"
             role="img" aria-label="Mesh devices inside a Bluetooth range zone, with online devices linked to the bank">
          <text class="zone-label" [attr.x]="zone.cx" y="-2" text-anchor="middle">BLUETOOTH / WALKING RANGE</text>
          <circle class="zone" [attr.cx]="zone.cx" [attr.cy]="zone.cy" [attr.r]="zone.r"></circle>

          <!-- link lines: always rendered, opacity animated by online state -->
          @for (d of devicesInScene(); track d.deviceId) {
            <line class="link" [attr.x1]="pos(d.deviceId).x" [attr.y1]="pos(d.deviceId).y"
                  [attr.x2]="bank.x" [attr.y2]="bank.y" [style.opacity]="d.hasInternet ? 0.5 : 0"></line>
          }

          <!-- bank node -->
          <g [attr.transform]="'translate(' + bank.x + ',' + bank.y + ')'">
            <rect x="-26" y="-26" width="52" height="52" class="bank-rect"></rect>
            <g transform="scale(1.3) translate(-12,-12)" class="bank-icon">
              <polygon points="12 2 20 7 4 7"></polygon>
              <line x1="6" x2="6" y1="18" y2="11"></line>
              <line x1="10" x2="10" y1="18" y2="11"></line>
              <line x1="14" x2="14" y1="18" y2="11"></line>
              <line x1="18" x2="18" y1="18" y2="11"></line>
              <line x1="3" x2="21" y1="22" y2="22"></line>
            </g>
            <text y="46" text-anchor="middle" class="bank-label">BANK / BACKEND</text>
          </g>

          <!-- device nodes -->
          @for (d of devicesInScene(); track d.deviceId) {
            <g class="device-node" (click)="toggle(d.deviceId)" role="button" tabindex="0"
               [attr.aria-label]="d.deviceId + ', ' + (d.hasInternet ? 'has signal' : 'no signal') + ', ' + d.packetCount + ' packets. Activate to toggle signal.'">
              @if (holdsTracked(d)) {
                <circle class="tracked-ring" [attr.cx]="pos(d.deviceId).x" [attr.cy]="pos(d.deviceId).y" r="16"></circle>
              }
              <circle class="pulse-ring" [attr.cx]="pos(d.deviceId).x" [attr.cy]="pos(d.deviceId).y" r="11"
                      [class.firing]="isPulsing(d.deviceId)"></circle>
              <circle class="node-dot" [class.online]="d.hasInternet" [attr.cx]="pos(d.deviceId).x" [attr.cy]="pos(d.deviceId).y" r="11"></circle>
            </g>
          }

          <!-- traveling pulses: gossip hops and flush uploads -->
          @for (p of pulses(); track p.id) {
            <circle class="pulse-dot" r="4"
                    [style.--x1.px]="p.x1" [style.--y1.px]="p.y1"
                    [style.--x2.px]="p.x2" [style.--y2.px]="p.y2"
                    [style.--dot-color]="p.color"
                    [style.animation-duration.ms]="p.durationMs"></circle>
          }
        </svg>

        <!-- HTML overlay labels: container-query sizing scales smoothly with
             actual rendered width, so these never overlap or overflow the
             way fixed SVG <text> font sizes would at narrower widths. -->
        @for (d of devicesInScene(); track d.deviceId) {
          <div class="overlay-item" [style.left.%]="pctX(d.deviceId)" [style.top.%]="pctY(d.deviceId)">
            <span class="node-count" [class.online]="d.hasInternet">{{ d.packetCount }}</span>
          </div>
          <div class="overlay-item" [style.left.%]="pctX(d.deviceId)" [style.top.%]="pctYLabel(d.deviceId)">
            <span class="node-id">{{ d.deviceId }}</span>
          </div>
        }
        @for (t of tags(); track t.id) {
          <div class="overlay-item tag" [style.left.%]="(t.x / view.w) * 100" [style.top.%]="((t.y + 20 - view.y) / view.h) * 100" [style.color]="t.color" [style.border-color]="t.color">
            {{ t.text }}
          </div>
        }
      </div>

      <div class="refusals">
        <div class="refusals-head">
          <span class="section-label">Duplicate refusals</span>
          <span class="refusals-sub">A device or the bank that already holds a packet refuses the copy.</span>
        </div>
        <div class="refusals-list mesh-scroll">
          @if (refusals().length === 0) {
            <div class="refusals-empty">None yet.</div>
          }
          @for (r of refusals(); track r.key) {
            <div class="refusal-row">
              <span class="r-time">{{ r.time }}</span>
              <span class="r-pkt">{{ r.packetId }}</span>
              <span class="r-path">{{ r.from }} &rarr; {{ r.to }}</span>
              <span class="r-badge">REFUSED</span>
              <span class="r-why">{{ r.why }}</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .panel { padding: 18px 18px 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; max-width: 100%; }

    .title-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; }
    .title-row h3 { margin: 0; font-size: 20px; }
    .subtitle { font-size: 13px; color: var(--color-text-soft); }
    .hint { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-text-muted); }

    .legend { display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 13px; color: #cfd1d4; }
    .legend-item { display: inline-flex; align-items: center; gap: 7px; }
    .legend-dot { width: 11px; height: 11px; border-radius: 50%; flex: none; }
    .legend-dot.online { background: var(--color-accent); border: 1px solid var(--color-accent); }
    .legend-dot.offline { background: transparent; border: 1.5px dashed var(--color-text-muted); }
    .legend-text { font-family: var(--font-mono); font-size: 12px; color: var(--color-text); }
    .legend-ring { width: 13px; height: 13px; border-radius: 50%; flex: none; border: 1.5px solid var(--color-text); }

    .scene-wrap { position: relative; container-type: inline-size; min-width: 0; max-width: 100%; }
    .scene { width: 100%; max-width: 100%; height: auto; display: block; overflow: visible; }

    .zone-label { font-family: var(--font-heading); font-size: 13px; font-weight: 600; letter-spacing: 0.1em; fill: var(--color-text-muted); }
    .zone { fill: none; stroke: var(--color-divider); stroke-width: 1.2; stroke-dasharray: 6 6; }

    .link { stroke: var(--color-accent); stroke-width: 1.2; stroke-dasharray: 4 5; transition: opacity 200ms ease; }

    .bank-rect { fill: var(--color-bg); stroke: var(--color-text); stroke-width: 1.2; }
    .bank-icon { fill: none; stroke: var(--color-text); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .bank-label { font-family: var(--font-heading); font-size: 14px; font-weight: 600; letter-spacing: 0.1em; fill: var(--color-text); }

    .device-node { cursor: pointer; outline: none; }
    .device-node:focus-visible .node-dot { stroke: var(--color-text); stroke-width: 2.5; }

    .node-dot { fill: var(--color-bg); stroke: var(--color-text-muted); stroke-width: 1.5; stroke-dasharray: 3 3; transition: fill 200ms ease, stroke 200ms ease; }
    .node-dot.online { fill: var(--color-accent); stroke: var(--color-accent); stroke-dasharray: none; }

    .tracked-ring { fill: none; stroke: var(--color-text); stroke-opacity: 1; animation: meshBlink 0.9s ease-in-out infinite; }
    @keyframes meshBlink { 0%, 100% { stroke-opacity: 1; stroke-width: 2.5; } 50% { stroke-opacity: 0.1; stroke-width: 1; } }

    .pulse-ring { fill: none; stroke: var(--color-accent); stroke-width: 1.5; opacity: 0; r: 11; pointer-events: none; }
    .pulse-ring.firing { animation: ring-pulse 450ms ease-out; }
    @keyframes ring-pulse { 0% { r: 8; opacity: 0.9; } 100% { r: 24; opacity: 0; } }

    .pulse-dot {
      fill: var(--dot-color);
      cx: var(--x1); cy: var(--y1);
      animation-name: travel; animation-timing-function: ease-in-out; animation-fill-mode: forwards;
    }
    @keyframes travel { from { cx: var(--x1); cy: var(--y1); opacity: 1; } to { cx: var(--x2); cy: var(--y2); opacity: 1; } }

    .overlay-item { position: absolute; transform: translate(-50%, -50%); pointer-events: none; }
    .node-count { font-family: var(--font-mono); font-size: clamp(8px, 1.45cqw, 11px); font-weight: 600; line-height: 1; color: var(--color-text); }
    .node-count.online { color: var(--color-bg); }
    .node-id { font-family: var(--font-mono); font-size: clamp(8px, 1.45cqw, 11px); line-height: 1; color: #cfd1d4; white-space: nowrap; }
    .tag {
      font-family: var(--font-mono); font-size: clamp(8px, 1.45cqw, 11px); font-weight: 600; line-height: 1;
      white-space: nowrap; padding: 2px 5px; background: var(--color-bg); border: 1px solid; border-radius: 1px;
      animation: tag-fade 1.5s ease-out forwards;
    }
    @keyframes tag-fade { 0%, 70% { opacity: 1; } 100% { opacity: 0; } }

    .refusals { border-top: 1px solid var(--color-divider); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
    .refusals-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .refusals-sub { font-size: 14px; color: var(--color-text-soft); }
    .refusals-list { display: flex; flex-direction: column; gap: 3px; max-height: 150px; overflow-y: auto; }
    .refusals-empty { font-size: 13px; color: var(--color-text-muted); padding: 4px 0; }
    .refusal-row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; font-family: var(--font-mono); font-size: 12px; }
    .r-time { color: #7c7f85; }
    .r-pkt { color: var(--color-text); font-weight: 600; }
    .r-path { color: #cfd1d4; }
    .r-badge {
      font-size: 11px; font-weight: 600; padding: 1px 6px; border: 1px solid var(--color-duplicate);
      color: var(--color-duplicate); background: color-mix(in oklab, var(--color-duplicate) 14%, transparent);
    }
    .r-why { color: #a3a6ab; }
  `]
})
export class MeshProximityComponent implements OnInit, OnDestroy {
  zone = ZONE;
  bank = BANK;
  view = VIEW;
  viewBoxStr = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`;

  pulses = signal<Pulse[]>([]);
  tags = signal<FloatingTag[]>([]);
  private pulsingNodes = signal<PulsingNode[]>([]);
  private sub: { unsubscribe(): void } | null = null;

  constructor(private state: MeshStateService) {}

  refusals = () => this.state.duplicateRefusals();

  ngOnInit(): void {
    this.sub = this.state.proximityEvents.subscribe((ev) => {
      if (ev.type === 'inject') {
        this.pulseNode(ev.deviceId);
        this.addTag(ev.deviceId, 'SEND', 'var(--color-text)');
      } else if (ev.type === 'gossip') {
        this.animateGossip(Math.min(3, Math.max(1, Math.round(ev.transfers / 2))));
      } else if (ev.type === 'hop') {
        this.animateHop(ev.from, ev.to);
      } else if (ev.type === 'flush') {
        this.animateFlush(ev.deviceId, ev.outcome);
        this.addTag(ev.deviceId, ev.outcome.replace('_', ' '), OUTCOME_VAR[ev.outcome]);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  devicesInScene(): MeshDevice[] {
    return this.state.devices().filter((d) => POSITIONS[d.deviceId]);
  }

  pos(deviceId: string): Point {
    return POSITIONS[deviceId] ?? { x: 0, y: 0 };
  }

  pctX(deviceId: string): number {
    return (this.pos(deviceId).x / VIEW.w) * 100;
  }

  pctY(deviceId: string): number {
    return ((this.pos(deviceId).y - VIEW.y) / VIEW.h) * 100;
  }

  pctYLabel(deviceId: string): number {
    return ((this.pos(deviceId).y - VIEW.y + 28) / VIEW.h) * 100;
  }

  toggle(deviceId: string): void {
    this.state.toggleDeviceInternet(deviceId);
  }

  holdsTracked(d: MeshDevice): boolean {
    const tracked = this.state.trackedPacketId();
    return !!tracked && d.packetIds.includes(tracked);
  }

  isPulsing(deviceId: string): boolean {
    const now = Date.now();
    return this.pulsingNodes().some((p) => p.deviceId === deviceId && p.until > now);
  }

  private pulseNode(deviceId: string): void {
    if (!POSITIONS[deviceId]) return;
    this.pulsingNodes.update((list) => [...list, { deviceId, until: Date.now() + 500 }]);
    setTimeout(() => {
      this.pulsingNodes.update((list) => list.filter((p) => p.deviceId !== deviceId));
    }, 550);
  }

  private addTag(deviceId: string, text: string, color: string): void {
    const p = POSITIONS[deviceId];
    if (!p) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.tags.update((list) => [...list, { id, x: p.x, y: p.y - 26, text, color }]);
    setTimeout(() => {
      this.tags.update((list) => list.filter((t) => t.id !== id));
    }, 1550);
  }

  private animateGossip(count: number): void {
    const ids = Object.keys(POSITIONS);
    for (let i = 0; i < count; i++) {
      const a = ids[Math.floor(Math.random() * ids.length)];
      let b = ids[Math.floor(Math.random() * ids.length)];
      let guard = 0;
      while (b === a && guard++ < 5) b = ids[Math.floor(Math.random() * ids.length)];
      if (a === b) continue;
      this.addPulse(this.pos(a), this.pos(b), 'var(--color-accent)', 420);
    }
  }

  /** One real gossip hop (diffed from actual before/after device holdings,
   * not a random illustrative pair): pulse + SEND tag at the source, a dot
   * traveling to the destination, then a pulse + RECEIVED tag there —
   * mirrors the approved design's hop() sequencing (ring, then line+dot
   * after a short delay, then arrival feedback). */
  private animateHop(from: string, to: string): void {
    if (!POSITIONS[from] || !POSITIONS[to]) return;
    this.pulseNode(from);
    this.addTag(from, 'SEND', 'var(--color-text)');
    setTimeout(() => this.addPulse(this.pos(from), this.pos(to), 'var(--color-text)', 700), 400);
    setTimeout(() => {
      this.pulseNode(to);
      this.addTag(to, 'RECEIVED', 'var(--color-accent)');
    }, 1100);
  }

  private animateFlush(deviceId: string, outcome: IngestOutcome): void {
    if (!POSITIONS[deviceId]) return;
    this.addPulse(this.pos(deviceId), this.bank, OUTCOME_VAR[outcome], 500);
  }

  private addPulse(from: Point, to: Point, color: string, durationMs: number): void {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.pulses.update((list) => [...list, { id, x1: from.x, y1: from.y, x2: to.x, y2: to.y, color, durationMs }]);
    setTimeout(() => {
      this.pulses.update((list) => list.filter((p) => p.id !== id));
    }, durationMs + 50);
  }
}
