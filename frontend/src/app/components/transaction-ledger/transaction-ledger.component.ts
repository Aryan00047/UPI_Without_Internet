import { Component, Input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Transaction, TransactionStatus } from '../../models/mesh.models';

@Component({
  selector: 'app-transaction-ledger',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="blueprint panel">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="head">
        <span class="section-label">Transaction ledger</span>
        <span class="legend">
          <span class="settled">SETTLED</span>
          <span class="rejected">REJECTED</span>
          <span class="duplicate">DUPLICATE_DROPPED</span>
          <span class="invalid">INVALID</span>
        </span>
      </div>
      <div class="mesh-scroll table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>id</th><th>sender &rarr; receiver</th><th class="right">amount</th>
              <th>status</th><th>bridge</th><th class="right">hops</th><th>settledAt</th>
            </tr>
          </thead>
          <tbody>
            @for (r of transactions; track r.id) {
              <tr class="mono-row">
                <td class="nowrap">{{ r.id }}</td>
                <td class="nowrap">{{ r.senderVpa }} &rarr; {{ r.receiverVpa }}</td>
                <td class="right nowrap">&#8377;{{ r.amount.toFixed(2) }}</td>
                <td class="nowrap"><span class="status-badge" [class]="statusClass(r.status)">{{ r.status }}</span></td>
                <td class="nowrap">{{ r.bridgeNodeId }}</td>
                <td class="right">{{ r.hopCount }}</td>
                <td class="nowrap settled-at">{{ r.settledAt | date: 'HH:mm:ss' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .panel { padding: 16px 16px 10px; min-width: 0; }
    .head { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
    .legend { display: flex; gap: 14px; flex-wrap: wrap; margin-left: auto; font-size: 13px; font-weight: 600; letter-spacing: 0.06em; }
    .legend .settled { color: var(--color-settled); }
    .legend .rejected { color: var(--color-rejected); }
    .legend .duplicate { color: var(--color-duplicate); }
    .legend .invalid { color: var(--color-invalid); }
    .table-scroll { overflow: auto; max-height: 340px; }
    .table { min-width: 760px; font-size: 14px; }
    th { position: sticky; top: 0; background: var(--color-bg); }
    .right { text-align: right; }
    .nowrap { white-space: nowrap; }
    .mono-row td { font-family: var(--font-mono); font-size: 12.5px; }
    .mono-row { animation: row-in 260ms ease-out; }
    @keyframes row-in {
      from { opacity: 0; background: color-mix(in oklab, var(--color-accent) 18%, transparent); }
      to { opacity: 1; background: transparent; }
    }
    .status-badge {
      font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; padding: 2px 7px; border: 1px solid;
      background: transparent;
    }
    .status-badge.settled { color: var(--color-settled); border-color: var(--color-settled); background: color-mix(in oklab, var(--color-settled) 14%, transparent); }
    .status-badge.rejected { color: var(--color-rejected); border-color: var(--color-rejected); background: color-mix(in oklab, var(--color-rejected) 14%, transparent); }
    .settled-at { color: var(--color-text-soft); }
  `]
})
export class TransactionLedgerComponent {
  @Input() transactions: Transaction[] = [];

  statusClass(status: TransactionStatus): string {
    return status === 'SETTLED' ? 'settled' : 'rejected';
  }
}
