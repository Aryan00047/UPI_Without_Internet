import { Component, Input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';
import { InfoTipComponent } from '../info-tip/info-tip.component';
import { IngestOutcome, PipelineStage, PipelineTraceEntry } from '../../models/mesh.models';

const OUTCOME_CLASS: Record<IngestOutcome, string> = {
  SETTLED: 'settled',
  REJECTED: 'rejected',
  DUPLICATE_DROPPED: 'duplicate',
  INVALID: 'invalid'
};

const STAGE_EXPLAIN: Record<PipelineStage['name'], string> = {
  Idempotency: 'Has this exact packet (by ciphertext hash) already been ingested before? If so it’s a duplicate — e.g. two bridges delivering the same gossip copy — and gets dropped here before anything else runs.',
  Decrypt: 'Server decrypts the ciphertext with its own private key. A corrupted or tampered packet fails the AES-GCM auth tag check here.',
  Signature: 'Verifies the sender’s signature on the decrypted payload against their registered public key — proves who really sent it, not just that it decrypted.',
  Freshness: 'Rejects packets signed too long ago (replay protection) or dated in the future (clock-skew abuse).',
  Settle: 'Debits the sender and credits the receiver. Fails here if the sender’s balance is too low — the only failure that happens after everything else checked out.'
};

@Component({
  selector: 'app-pipeline-trace',
  standalone: true,
  imports: [IconComponent, InfoTipComponent],
  template: `
    <div class="blueprint panel">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="title-row">
        <h2>Pipeline trace</h2>
        <span class="stage-order">Idempotency &rarr; Decrypt &rarr; Signature &rarr; Freshness &rarr; Settle</span>
        <span class="count">last {{ trace.length }} attempts, newest first</span>
      </div>
      <p class="sub-explain">
        Each row is one bridge device uploading one packet. Gossip can copy the SAME packet to
        more than one online bridge before either flushes — when that happens you'll see the same
        hash appear twice with different <span class="mono">via phone-&hellip;</span> values: one
        SETTLED, the rest DUPLICATE_DROPPED at the Idempotency stage.
      </p>
      <div class="legend">
        <span class="legend-item"><span class="legend-icon pass"><app-icon name="check" [size]="13" [strokeWidth]="2.5"></app-icon></span>Passed</span>
        <span class="legend-item"><span class="legend-icon fail"><app-icon name="x" [size]="13" [strokeWidth]="2.5"></app-icon></span>Failed here, reason shown, color = outcome</span>
        <span class="legend-item"><span class="legend-icon nr"><app-icon name="minus" [size]="13" [strokeWidth]="2"></app-icon></span>Not reached</span>
      </div>

      <div class="entries mesh-scroll">
        @if (trace.length === 0) {
          <div class="empty-state">No ingest attempts yet. Use "Flush bridges to backend" to push packets from online nodes through the pipeline.</div>
        }
        @for (t of trace; track t.key) {
          <div class="entry">
            <div class="entry-head">
              <span class="hash">{{ t.hash }}</span>
              <span class="via">via <span class="bridge">{{ t.bridgeNode }}</span></span>
              <span class="time">{{ t.time }}</span>
              <span class="outcome-wrap">
                @if (t.reason) {
                  <span class="reason" [class]="outcomeClass(t.outcome)">{{ t.reason }}</span>
                }
                <span class="outcome-badge" [class]="outcomeClass(t.outcome)">{{ t.outcome }}</span>
              </span>
            </div>
            <div class="stages">
              @for (s of t.stages; track s.name) {
                <div class="stage" [class]="s.status">
                  <div class="stage-head">
                    <span class="stage-icon" [class]="s.status">
                      @if (showIcon(s.status)) {
                        <app-icon [name]="stageIcon(s.status)" [size]="15" [strokeWidth]="2.5"></app-icon>
                      }
                    </span>
                    <span class="stage-name">{{ s.name }}</span>
                    <app-info-tip [text]="stageExplain(s.name)"></app-info-tip>
                  </div>
                  <span class="stage-label">{{ stageLabel(s.status) }}</span>
                  @if (s.status === 'failed' && t.reason) {
                    <span class="stage-reason">{{ t.reason }}</span>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .panel { padding: 18px 18px 14px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .title-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 18px; }
    .title-row h2 { margin: 0; font-size: 30px; letter-spacing: 0.01em; }
    .stage-order { font-size: 17px; color: var(--color-text-soft); }
    .count { margin-left: auto; font-family: var(--font-mono); font-size: 12px; color: var(--color-text-muted); }
    .sub-explain { margin: -6px 0 0; font-size: 13px; color: var(--color-text-muted); max-width: 90ch; }
    .sub-explain .mono { font-family: var(--font-mono); color: var(--color-text-soft); }

    .legend { display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 15px; color: #cfd1d4; }
    .legend-item { display: inline-flex; align-items: center; gap: 7px; }
    .legend-icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; }
    .legend-icon.pass { background: var(--color-settled); color: var(--color-bg); }
    .legend-icon.fail { background: var(--color-rejected); color: var(--color-bg); }
    .legend-icon.nr { border: 1px dashed var(--color-divider-faint); color: var(--color-text-dim); }

    .entries { display: flex; flex-direction: column; gap: 12px; max-height: 800px; overflow-y: auto; padding: 2px 6px 2px 0; }
    .empty-state { padding: 28px 0; font-size: 17px; color: var(--color-text-muted); }

    .entry {
      border: 1px solid var(--color-divider); padding: 12px; display: flex; flex-direction: column; gap: 10px;
      animation: entry-in 260ms ease-out;
    }
    @keyframes entry-in {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .entry-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; }
    .hash { font-family: var(--font-mono); font-size: 15px; font-weight: 600; }
    .via { font-size: 15px; color: var(--color-text-soft); }
    .bridge { font-family: var(--font-mono); font-size: 13px; color: var(--color-text); }
    .time { font-family: var(--font-mono); font-size: 12.5px; color: var(--color-text-muted); }
    .outcome-wrap { margin-left: auto; display: inline-flex; align-items: center; gap: 10px; }
    .reason { font-family: var(--font-mono); font-size: 12.5px; }
    .outcome-badge { font-size: 14px; font-weight: 600; letter-spacing: 0.08em; padding: 3px 10px; border: 1px solid; }

    .settled { background: color-mix(in oklab, var(--color-settled) 16%, transparent); color: var(--color-settled); border-color: var(--color-settled); }
    .rejected { background: color-mix(in oklab, var(--color-rejected) 16%, transparent); color: var(--color-rejected); border-color: var(--color-rejected); }
    .duplicate { background: color-mix(in oklab, var(--color-duplicate) 16%, transparent); color: var(--color-duplicate); border-color: var(--color-duplicate); }
    .invalid { background: color-mix(in oklab, var(--color-invalid) 16%, transparent); color: var(--color-invalid); border-color: var(--color-invalid); }
    .reason.settled, .reason.rejected, .reason.duplicate, .reason.invalid { background: transparent; border: none; padding: 0; }

    .stages { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 6px; }
    .stage {
      padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; min-width: 0; border: 1px solid transparent;
      transition: background-color 200ms ease, border-color 200ms ease;
    }
    .stage.passed { background: color-mix(in oklab, var(--color-settled) 14%, transparent); border-color: var(--color-settled); }
    .stage.failed { background: var(--color-rejected); border-color: var(--color-rejected); }
    .stage.not-reached { background: transparent; border: 1px dashed var(--color-divider-faint); }
    .stage.pending { background: transparent; border: 1px dotted var(--color-divider-faint); }
    .stage.checking { background: color-mix(in oklab, var(--color-accent) 12%, transparent); border-color: var(--color-accent); }
    .stage-head { display: flex; align-items: center; gap: 8px; }
    .stage-icon {
      width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center;
      transition: background-color 200ms ease, border-color 200ms ease;
    }
    .stage-icon.passed { background: var(--color-settled); color: var(--color-bg); }
    .stage-icon.failed { background: var(--color-bg); color: var(--color-rejected); }
    .stage-icon.not-reached { color: var(--color-text-dim); border: 1px dashed var(--color-divider-faint); }
    .stage-icon.pending { border: 1px dotted var(--color-divider-faint); }
    .stage-icon.checking { border: 1px solid var(--color-accent); animation: pulse 900ms ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
    .stage-name { font-size: 17px; font-weight: 600; line-height: 1.1; }
    .stage.passed .stage-name { color: var(--color-text); }
    .stage.failed .stage-name { color: var(--color-bg); }
    .stage.not-reached .stage-name,
    .stage.pending .stage-name { color: var(--color-text-dim); }
    .stage.checking .stage-name { color: var(--color-text); }
    .stage-label { font-size: 12px; font-weight: 600; letter-spacing: 0.1em; }
    .stage.passed .stage-label { color: var(--color-settled); }
    .stage.failed .stage-label { color: var(--color-bg); }
    .stage.not-reached .stage-label,
    .stage.pending .stage-label { color: var(--color-text-dim); }
    .stage.checking .stage-label { color: var(--color-accent); }
    .stage-reason { font-family: var(--font-mono); font-size: 12px; font-weight: 600; line-height: 1.25; color: var(--color-bg); overflow-wrap: anywhere; }
  `]
})
export class PipelineTraceComponent {
  @Input() trace: PipelineTraceEntry[] = [];

  outcomeClass(outcome: IngestOutcome): string {
    return OUTCOME_CLASS[outcome];
  }

  stageExplain(name: PipelineStage['name']): string {
    return STAGE_EXPLAIN[name];
  }

  showIcon(status: PipelineStage['status']): boolean {
    return status === 'passed' || status === 'failed' || status === 'not-reached';
  }

  stageIcon(status: PipelineStage['status']): IconName {
    return status === 'passed' ? 'check' : status === 'failed' ? 'x' : 'minus';
  }

  stageLabel(status: PipelineStage['status']): string {
    switch (status) {
      case 'passed': return 'PASSED';
      case 'failed': return 'FAILED';
      case 'not-reached': return 'NOT REACHED';
      case 'checking': return 'CHECKING';
      default: return 'PENDING';
    }
  }
}
