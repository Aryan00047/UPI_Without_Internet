import { Component, Input } from '@angular/core';
import { ActivityLogEntry } from '../../models/mesh.models';

@Component({
  selector: 'app-activity-log',
  standalone: true,
  template: `
    <div class="blueprint panel">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="section-label title">Activity log</div>
      <div class="mesh-scroll log">
        @for (l of entries; track $index) {
          <div class="row">
            <span class="time">{{ l.time }}</span>
            <span class="message">{{ l.message }}</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .panel { padding: 16px; min-width: 0; display: flex; flex-direction: column; }
    .title { margin-bottom: 8px; }
    .log {
      font-family: var(--font-mono); font-size: 12px; line-height: 1.55; color: #a3a6ab;
      max-height: 230px; overflow: auto; display: flex; flex-direction: column; gap: 2px;
    }
    .row { display: flex; gap: 10px; }
    .time { color: #7c7f85; flex: none; }
    .message { overflow-wrap: anywhere; }
  `]
})
export class ActivityLogComponent {
  @Input() entries: ActivityLogEntry[] = [];
}
