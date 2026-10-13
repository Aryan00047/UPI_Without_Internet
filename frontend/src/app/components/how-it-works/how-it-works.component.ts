import { Component } from '@angular/core';

interface Step {
  n: number;
  title: string;
  detail: string;
}

const STEPS: Step[] = [
  { n: 1, title: 'Compose & inject', detail: 'Pick sender/receiver/amount, optionally a failure mode, then Inject packet. The packet is encrypted + signed and dropped onto phone-alice.' },
  { n: 2, title: 'Run gossip', detail: 'Copies the packet to nearby devices. Run it more than once to let it reach BOTH online bridges (phone-bridge and phone-edge) — that’s what makes a real duplicate-storm possible.' },
  { n: 3, title: 'Flush bridges', detail: 'Every online device uploads what it holds. If two bridges picked up the same packet, you’ll see one SETTLED and the other DUPLICATE_DROPPED for the same hash.' },
  { n: 4, title: 'Watch it settle', detail: 'Pipeline trace, transaction ledger, and account balances update live — no page refresh needed.' }
];

@Component({
  selector: 'app-how-it-works',
  standalone: true,
  template: `
    <div class="blueprint panel">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="section-label how-title">How to test</div>
      <ol class="steps">
        @for (s of steps; track s.n) {
          <li class="step">
            <span class="step-num">{{ s.n }}</span>
            <span class="step-body">
              <strong>{{ s.title }}</strong>
              <span class="step-detail">{{ s.detail }}</span>
            </span>
          </li>
        }
      </ol>
    </div>
  `,
  styles: [`
    .panel { padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
    .how-title { font-size: 15px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
    .step { display: flex; gap: 14px; align-items: flex-start; }
    .step-num {
      flex: none; width: 26px; height: 26px; border-radius: 50%;
      background: var(--color-accent); color: var(--color-bg);
      font-family: var(--font-mono); font-size: 13px; font-weight: 600;
      display: inline-flex; align-items: center; justify-content: center; margin-top: 1px;
    }
    .step-body { display: flex; flex-direction: column; gap: 4px; font-size: 16px; min-width: 0; }
    .step-detail { font-size: 14px; color: var(--color-text-muted); line-height: 1.5; }
  `]
})
export class HowItWorksComponent {
  steps = STEPS;
}
