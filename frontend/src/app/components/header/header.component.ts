import { Component, EventEmitter, Input, Output } from '@angular/core';
import { InfoTipComponent } from '../info-tip/info-tip.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [InfoTipComponent],
  template: `
    <header class="header">
      <div class="title-block">
        <span class="title">UPI MESH</span>
        <span class="subtitle">Offline payment gossip, bridge ingest and settlement</span>
        <button class="help-btn" type="button" (click)="openHelp.emit()">How to test</button>
      </div>
      <div class="stats">
        <div class="stat">
          <span class="stat-label">Nodes online <app-info-tip align="start" text="Simulated devices currently treated as having internet — these are the ones a 'Flush' uploads from."></app-info-tip></span>
          <span class="stat-value">{{ nodesOnline }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Packets in mesh <app-info-tip text="Total packet copies currently held across all devices, including duplicate copies spread by gossip — not the number of distinct payments."></app-info-tip></span>
          <span class="stat-value">{{ packetsInMesh }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Settled <app-info-tip align="end" text="Count of transactions that passed every pipeline stage and actually moved money. Rejected/duplicate/invalid attempts are not counted here."></app-info-tip></span>
          <span class="stat-value">{{ settled }}</span>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .header {
      display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px 32px;
      padding-bottom: 14px; margin-bottom: 26px; border-bottom: 1px solid var(--color-divider);
    }
    .title-block { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-right: auto; }
    .title { font-family: var(--font-heading); font-size: 28px; font-weight: 600; letter-spacing: 0.06em; line-height: 1; }
    .subtitle { font-size: 16px; color: var(--color-text-muted); }
    .help-btn {
      font-family: var(--font-heading); font-weight: 600; font-size: 13px; letter-spacing: 0.04em;
      background: transparent; color: var(--color-accent); border: 1px solid var(--color-accent);
      border-radius: var(--radius-md); padding: 5px 12px; cursor: pointer;
    }
    .help-btn:hover { background: color-mix(in oklab, var(--color-accent) 12%, transparent); }
    .stats { display: flex; gap: 28px; flex-wrap: wrap; }
    .stat { display: flex; flex-direction: column; gap: 2px; }
    .stat-label { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); }
    .stat-value { font-family: var(--font-mono); font-size: 20px; font-weight: 500; }
  `]
})
export class HeaderComponent {
  @Input() nodesOnline = '0/0';
  @Input() packetsInMesh = 0;
  @Input() settled = 0;
  @Output() openHelp = new EventEmitter<void>();
}
