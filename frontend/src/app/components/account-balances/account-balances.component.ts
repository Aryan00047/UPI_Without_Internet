import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Account } from '../../models/mesh.models';

@Component({
  selector: 'app-account-balances',
  standalone: true,
  template: `
    <div class="blueprint panel">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="section-label title">Account balances</div>
      <div class="mesh-scroll table-scroll">
        <table class="table">
          <thead>
            <tr><th>vpa</th><th>holderName</th><th class="right">balance</th></tr>
          </thead>
          <tbody>
            @for (a of accounts; track a.vpa) {
              <tr>
                <td class="nowrap vpa-cell">
                  <span class="vpa-wrap">
                    {{ a.vpa }}
                    <span class="key-badge" [class.has-key]="!!a.publicKeyBase64">{{ a.publicKeyBase64 ? 'KEY' : 'NO KEY' }}</span>
                  </span>
                </td>
                <td class="holder">{{ a.holderName }}</td>
                <td class="right nowrap balance" [class.flash]="changedVpas.has(a.vpa)">&#8377;{{ a.balance.toFixed(2) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .panel { padding: 16px 16px 10px; min-width: 0; }
    .title { margin-bottom: 8px; }
    .table-scroll { overflow: auto; }
    .table { min-width: 380px; }
    .right { text-align: right; }
    .nowrap { white-space: nowrap; }
    .vpa-cell { font-family: var(--font-mono); font-size: 12.5px; }
    .vpa-wrap { display: inline-flex; align-items: center; gap: 8px; }
    .key-badge {
      font-family: var(--font-heading); font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
      padding: 0 5px; border: 1px dashed var(--color-divider-faint); color: var(--color-text-muted);
    }
    .key-badge.has-key { border: 1px solid var(--color-accent); color: var(--color-accent); }
    .holder { font-size: 15px; }
    .balance { font-family: var(--font-mono); font-size: 13px; transition: color 200ms ease; }
    .balance.flash { animation: balance-flash 1100ms ease; }
    @keyframes balance-flash {
      0% { color: var(--color-settled); background: color-mix(in oklab, var(--color-settled) 20%, transparent); }
      100% { color: var(--color-text); background: transparent; }
    }
  `]
})
export class AccountBalancesComponent implements OnChanges {
  @Input() accounts: Account[] = [];

  changedVpas = new Set<string>();
  private previousBalances = new Map<string, number>();
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['accounts']) return;
    const changed = new Set<string>();
    for (const a of this.accounts) {
      const prev = this.previousBalances.get(a.vpa);
      if (prev !== undefined && prev !== a.balance) {
        changed.add(a.vpa);
      }
      this.previousBalances.set(a.vpa, a.balance);
    }
    if (changed.size > 0) {
      this.changedVpas = changed;
      if (this.flashTimer) clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => (this.changedVpas = new Set()), 1100);
    }
  }
}
