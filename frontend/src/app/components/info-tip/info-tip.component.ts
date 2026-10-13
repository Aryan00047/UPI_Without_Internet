import { Component, Input } from '@angular/core';

/** Small (i) icon with a custom, theme-matched tooltip bubble — used next to
 * labels/terms that aren't self-explanatory (pipeline stage names, header
 * stats, mesh action buttons, etc). Pure CSS hover/focus popover rather than
 * the native `title` attribute, which renders as the browser's unstyleable
 * yellow/black tooltip and clashes with the dark theme. */
@Component({
  selector: 'app-info-tip',
  standalone: true,
  template: `
    <span class="info-tip-wrap">
      <span class="info-tip" tabindex="0" role="button" [attr.aria-label]="text">i</span>
      <span class="info-tip-bubble" [class.align-start]="align === 'start'" [class.align-end]="align === 'end'" role="tooltip">{{ text }}</span>
    </span>
  `,
  styles: [`
    .info-tip-wrap { position: relative; display: inline-flex; }
    .info-tip {
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; flex: none;
      border: 1px solid var(--color-text-muted); border-radius: 50%;
      font-family: var(--font-mono); font-size: 10px; font-style: italic; font-weight: 600;
      color: var(--color-text-muted); cursor: help; user-select: none;
    }
    .info-tip:hover, .info-tip:focus-visible {
      border-color: var(--color-accent); color: var(--color-accent);
    }

    .info-tip-bubble {
      /* Opens BELOW the icon, not above — most info-tips sit near the top
         of a panel (headers, section labels, first controls row), and an
         upward-opening bubble routinely got clipped by the top of the page.
         Below always has the rest of the page to grow into. */
      position: absolute; left: 50%; top: calc(100% + 8px); transform: translateX(-50%) translateY(-2px);
      width: max-content; max-width: 240px;
      background: var(--color-surface); color: var(--color-text);
      border: 1px solid var(--color-divider); border-radius: var(--radius-md);
      padding: 7px 10px; font-family: var(--font-body); font-size: 12px; font-weight: 400; line-height: 1.4;
      text-transform: none; letter-spacing: normal;
      opacity: 0; visibility: hidden; pointer-events: none;
      transition: opacity 140ms ease, transform 140ms ease;
      z-index: 50;
    }
    /* Centering under the icon pushes the bubble off-page for anything near
       a left/right edge (e.g. the header's leftmost/rightmost stat) — these
       let a caller anchor the bubble to one side of the icon instead. */
    .info-tip-bubble.align-start { left: 0; transform: translateX(0) translateY(-2px); }
    .info-tip-bubble.align-end { left: auto; right: 0; transform: translateX(0) translateY(-2px); }
    /* small flat arrow, no shadow — stays consistent with the blueprint/flat aesthetic, now pointing up at the icon */
    .info-tip-bubble::after {
      content: ''; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
      width: 8px; height: 8px; background: var(--color-surface);
      border-left: 1px solid var(--color-divider); border-top: 1px solid var(--color-divider);
      transform: translateX(-50%) rotate(45deg) translateY(4px);
    }
    .info-tip-bubble.align-start::after { left: 7px; transform: rotate(45deg) translateY(4px); }
    .info-tip-bubble.align-end::after { left: auto; right: 7px; transform: rotate(45deg) translateY(4px); }

    .info-tip-wrap:hover .info-tip-bubble,
    .info-tip:focus-visible + .info-tip-bubble {
      opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0);
    }
    .info-tip-wrap:hover .info-tip-bubble.align-start,
    .info-tip:focus-visible + .info-tip-bubble.align-start,
    .info-tip-wrap:hover .info-tip-bubble.align-end,
    .info-tip:focus-visible + .info-tip-bubble.align-end {
      transform: translateX(0) translateY(0);
    }
  `]
})
export class InfoTipComponent {
  @Input({ required: true }) text!: string;
  /** 'center' (default) under the icon, or 'start'/'end' to anchor the
   * bubble's left/right edge to the icon instead — use near a page/panel
   * edge where centering would clip the bubble off-screen. */
  @Input() align: 'center' | 'start' | 'end' = 'center';
}
