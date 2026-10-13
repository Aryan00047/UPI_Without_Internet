import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { InfoTipComponent } from '../info-tip/info-tip.component';
import { MeshDevice } from '../../models/mesh.models';

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [IconComponent, InfoTipComponent],
  template: `
    <div class="list-header">
      <span class="section-label">Mesh devices <app-info-tip text="Online = this device currently has internet and can Flush to the backend. Click a device's status badge to toggle it, simulating walking into/out of signal."></app-info-tip></span>
      <span class="count">{{ devices.length }} nodes</span>
    </div>
    <div class="grid">
      @for (d of devices; track d.deviceId) {
        <div class="blueprint device-card">
          <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
          <div class="row">
            <span class="dot" [class.online]="d.hasInternet"></span>
            <span class="device-id">{{ d.deviceId }}</span>
            <button type="button" class="status-tag" [class.online]="d.hasInternet"
                    (click)="toggleInternet.emit(d.deviceId)"
                    [title]="'Click to simulate ' + (d.hasInternet ? 'losing' : 'gaining') + ' signal'">
              {{ d.hasInternet ? 'ONLINE' : 'OFFLINE' }}
            </button>
          </div>
          <div class="row">
            <div class="capacity-bar">
              <div class="fill" [class.full]="d.packetCount >= d.maxCapacity"
                   [style.width.%]="capacityPct(d)"></div>
            </div>
            <span class="load">{{ d.packetCount }}/{{ d.maxCapacity }}</span>
          </div>
          @if (d.droppedForCapacity > 0) {
            <div class="dropped-warning">
              <app-icon name="alert-triangle" [size]="16"></app-icon>
              <span>{{ d.droppedForCapacity }} dropped, at capacity</span>
            </div>
          }
          <div class="chips">
            @for (id of d.packetIds.slice(0, 8); track id) {
              <span class="chip">{{ id }}</span>
            }
            @if (d.packetIds.length > 8) {
              <span class="chip">+{{ d.packetIds.length - 8 }}</span>
            }
            @if (d.packetIds.length === 0) {
              <span class="empty">No packets held</span>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .list-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
    .count { font-family: var(--font-mono); font-size: 12px; color: var(--color-text-muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 12px; }
    .device-card { padding: 12px; display: flex; flex-direction: column; gap: 9px; min-width: 0; }
    .row { display: flex; align-items: center; gap: 8px; }
    .dot { width: 10px; height: 10px; flex: none; border: 1px dashed var(--color-text-muted); background: transparent; }
    .dot.online { background: var(--color-accent); border: 1px solid var(--color-accent); }
    .device-id { font-family: var(--font-mono); font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
    .status-tag {
      appearance: none; font-family: inherit; cursor: pointer;
      margin-left: auto; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; padding: 2px 7px;
      background: transparent; color: var(--color-text-muted); border: 1px dashed var(--color-divider-faint);
      transition: background-color 150ms ease, border-color 150ms ease;
    }
    .status-tag:hover { border-color: var(--color-text); }
    .status-tag.online { background: var(--color-accent); color: var(--color-bg); border: 1px solid var(--color-accent); }
    .status-tag.online:hover { background: var(--color-accent-700, var(--color-accent)); }
    .capacity-bar { flex: 1; height: 8px; border: 1px solid var(--color-divider-faint); }
    .capacity-bar .fill { height: 100%; background: var(--color-accent); transition: width 400ms ease, background-color 200ms ease; }
    .capacity-bar .fill.full { background: var(--color-text); }
    .chip { animation: chip-in 220ms ease-out; }
    @keyframes chip-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
    .load { font-family: var(--font-mono); font-size: 13px; }
    .dropped-warning {
      display: flex; align-items: center; gap: 8px; padding: 4px 8px;
      background: var(--color-text); color: var(--color-bg); font-size: 15px; font-weight: 600;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; min-height: 22px; }
    .chip {
      font-family: var(--font-mono); font-size: 11.5px; padding: 1px 6px;
      border: 1px solid var(--color-divider-soft); color: #cfd1d4;
    }
    .empty { font-size: 14px; color: var(--color-text-dim); }
  `]
})
export class DeviceListComponent {
  @Input() devices: MeshDevice[] = [];
  @Output() toggleInternet = new EventEmitter<string>();

  capacityPct(d: MeshDevice): number {
    if (d.maxCapacity <= 0) return 0;
    return Math.min(100, (d.packetCount / d.maxCapacity) * 100);
  }
}
