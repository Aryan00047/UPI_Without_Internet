import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { InfoTipComponent } from '../info-tip/info-tip.component';

@Component({
  selector: 'app-mesh-actions',
  standalone: true,
  imports: [IconComponent, InfoTipComponent],
  template: `
    <div class="blueprint panel">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="section-label">Mesh actions</div>

      <div class="action-row">
        <button class="btn btn-secondary" [disabled]="flushing || gossiping" (click)="gossip.emit()">
          <app-icon name="refresh" [size]="18"></app-icon>
          {{ gossiping ? 'Gossiping... (' + gossipRound + '/3)' : 'Run gossip (3 rounds)' }}
        </button>
        <app-info-tip text="Runs 3 real gossip rounds back to back — devices share held packets with each other each round. 3 rounds is usually enough to spread one packet to both online bridges and set up a duplicate-storm."></app-info-tip>
      </div>

      <div class="action-row">
        <button class="btn btn-primary" [disabled]="flushing || gossiping" (click)="flush.emit()">
          <app-icon name="upload" [size]="18"></app-icon>
          {{ flushing ? 'Flushing...' : 'Flush bridges to backend' }}
        </button>
        <app-info-tip text="Every ONLINE device (phone-bridge, phone-edge) uploads everything it currently holds to the real /api/bridge/ingest pipeline. This is the only action that produces Pipeline trace entries."></app-info-tip>
      </div>

      <div class="action-row reset-row">
        <button class="btn reset-btn" [class.armed]="resetArmed" [disabled]="flushing || gossiping" (click)="onReset()">
          <app-icon name="trash" [size]="16"></app-icon>
          {{ resetArmed ? 'Click again to confirm reset' : 'Reset mesh + cache' }}
        </button>
        <app-info-tip text="Clears every device's held packets AND the server's idempotency cache. Does NOT reset account balances or the transaction ledger — those are permanent, like a real ledger."></app-info-tip>
      </div>
    </div>
  `,
  styles: [`
    .panel { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .action-row { display: flex; align-items: center; gap: 8px; }
    .action-row button { flex: 1; font-size: 15px; padding: 10px 14px; }
    .reset-row { margin-top: 10px; }
    .reset-btn {
      background: transparent; color: var(--color-text-soft); border-style: dashed; border-color: var(--color-divider-faint);
    }
    .reset-btn.armed { background: var(--color-text); color: var(--color-bg); border-style: solid; border-color: var(--color-text); }
  `]
})
export class MeshActionsComponent {
  @Input() flushing = false;
  @Input() gossiping = false;
  @Input() gossipRound = 0;
  @Output() flush = new EventEmitter<void>();
  @Output() gossip = new EventEmitter<void>();
  @Output() reset = new EventEmitter<void>();

  resetArmed = false;
  private armTimer: ReturnType<typeof setTimeout> | null = null;

  onReset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.armTimer = setTimeout(() => (this.resetArmed = false), 3000);
      return;
    }
    if (this.armTimer) clearTimeout(this.armTimer);
    this.resetArmed = false;
    this.reset.emit();
  }
}
