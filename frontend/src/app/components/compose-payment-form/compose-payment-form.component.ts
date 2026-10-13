import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../icon/icon.component';
import { Account, DemoSendRequest } from '../../models/mesh.models';

@Component({
  selector: 'app-compose-payment-form',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="blueprint panel">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="section-label">Compose payment</div>
      <div class="grid-2">
        <div class="field">
          <label for="f-sender">Sender VPA</label>
          <select id="f-sender" class="input" [(ngModel)]="sender">
            @for (a of accounts; track a.vpa) {
              <option [value]="a.vpa">{{ a.vpa }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="f-receiver">Receiver VPA</label>
          <select id="f-receiver" class="input" [(ngModel)]="receiver">
            @for (a of accounts; track a.vpa) {
              <option [value]="a.vpa">{{ a.vpa }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="f-amount">Amount (INR)</label>
          <input id="f-amount" class="input" type="number" min="1" step="any" [(ngModel)]="amount">
        </div>
        <div class="field">
          <label for="f-pin">PIN</label>
          <input id="f-pin" class="input" type="text" maxlength="6" autocomplete="off" [(ngModel)]="pin">
        </div>
      </div>
      <div class="field">
        <label for="f-failure">Simulate failure (optional)</label>
        <select id="f-failure" class="input" [(ngModel)]="failureMode">
          <option value="none">None &mdash; normal payment</option>
          <option value="insufficient_funds">Insufficient funds &rarr; REJECTED</option>
          <option value="duplicate">Duplicate delivery &rarr; DUPLICATE_DROPPED</option>
          <option value="corrupt">Corrupted ciphertext &rarr; INVALID (decryption_failed)</option>
          <option value="unknown_sender">Unregistered sender &rarr; INVALID (unknown_sender_key)</option>
          <option value="bad_signature">Forged signature &rarr; INVALID (invalid_signature)</option>
          <option value="stale">Stale packet (2 days old) &rarr; INVALID (stale_packet)</option>
          <option value="future">Future-dated &rarr; INVALID (future_dated)</option>
        </select>
        @if (failureMode === 'duplicate') {
          <p class="hint">Inject once, then run Gossip + Flush twice without resetting &mdash; the second flush of the same packet is the duplicate.</p>
        }
      </div>
      @if (error) {
        <div class="error" role="alert">
          <app-icon name="alert-triangle" [size]="16"></app-icon>
          <span>{{ error }}</span>
        </div>
      }
      <button class="btn btn-primary btn-block" (click)="submit()">
        <app-icon name="send" [size]="18"></app-icon>
        Inject packet
      </button>
    </div>
  `,
  styles: [`
    .panel { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .btn-block { font-size: 17px; padding: 9px 14px; }
    .error { display: flex; gap: 8px; align-items: center; font-size: 15px; color: var(--color-text); }
    .field label { font-size: 14px; }
    .hint { font-size: 12px; color: var(--color-text-muted); margin: 4px 0 0; }
  `]
})
export class ComposePaymentFormComponent {
  @Input() accounts: Account[] = [];
  @Output() inject = new EventEmitter<DemoSendRequest>();

  sender = 'alice@demo';
  receiver = 'bob@demo';
  amount = 250;
  pin = '1234';
  error = '';
  failureMode = 'none';

  submit(): void {
    if (this.sender === this.receiver) {
      this.error = 'Sender and receiver must differ.';
      return;
    }
    if (!(this.amount > 0)) {
      this.error = 'Enter an amount above zero.';
      return;
    }
    if (!this.pin) {
      this.error = 'PIN is required.';
      return;
    }
    this.error = '';

    // insufficient_funds/duplicate aren't packet flaws — they're reached
    // through ordinary use (a too-large amount, or flushing the same
    // packet twice), so they don't set the backend `flaw` field.
    const realFlaws = ['corrupt', 'unknown_sender', 'bad_signature', 'stale', 'future'];
    const amount = this.failureMode === 'insufficient_funds' ? this.amount + 1_000_000 : this.amount;
    const flaw = realFlaws.includes(this.failureMode) ? (this.failureMode as DemoSendRequest['flaw']) : null;

    // Backend devices are named phone-<account> for each demo account
    // (phone-alice, phone-bob, phone-carol, phone-dave), so the packet
    // actually lands on the sender's own phone instead of always phone-alice.
    this.inject.emit({
      senderVpa: this.sender,
      receiverVpa: this.receiver,
      amount,
      pin: this.pin,
      ttl: 5,
      flaw,
      startDevice: 'phone-' + this.sender.split('@')[0]
    });
  }
}
