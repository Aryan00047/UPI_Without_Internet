import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { HeaderComponent } from './components/header/header.component';
import { ComposePaymentFormComponent } from './components/compose-payment-form/compose-payment-form.component';
import { MeshActionsComponent } from './components/mesh-actions/mesh-actions.component';
import { DeviceListComponent } from './components/device-list/device-list.component';
import { PipelineTraceComponent } from './components/pipeline-trace/pipeline-trace.component';
import { TransactionLedgerComponent } from './components/transaction-ledger/transaction-ledger.component';
import { AccountBalancesComponent } from './components/account-balances/account-balances.component';
import { ActivityLogComponent } from './components/activity-log/activity-log.component';
import { HowItWorksComponent } from './components/how-it-works/how-it-works.component';
import { MeshProximityComponent } from './components/mesh-proximity/mesh-proximity.component';
import { GossipScaleLabComponent } from './components/gossip-scale-lab/gossip-scale-lab.component';
import { MeshStateService } from './state/mesh-state.service';
import { DemoSendRequest } from './models/mesh.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    HeaderComponent,
    ComposePaymentFormComponent,
    MeshActionsComponent,
    DeviceListComponent,
    PipelineTraceComponent,
    TransactionLedgerComponent,
    AccountBalancesComponent,
    ActivityLogComponent,
    HowItWorksComponent,
    MeshProximityComponent,
    GossipScaleLabComponent
  ],
  template: `
    <div class="root">
      <app-header
        [nodesOnline]="state.nodesOnline()"
        [packetsInMesh]="state.packetsInMesh()"
        [settled]="state.settledCount()"
        (openHelp)="showHelp.set(true)">
      </app-header>

      @if (showHelp()) {
        <div class="dialog-backdrop" (click)="showHelp.set(false)">
          <div class="dialog" (click)="$event.stopPropagation()">
            <app-how-it-works></app-how-it-works>
          </div>
        </div>
      }

      <div class="mesh-grid">
        <section class="controls">
          <app-compose-payment-form [accounts]="state.accounts()" (inject)="onInject($event)"></app-compose-payment-form>
          <app-mesh-actions
            [flushing]="state.flushing()"
            [gossiping]="state.gossiping()"
            [gossipRound]="state.gossipRound()"
            (flush)="state.flushBridges()"
            (gossip)="state.runGossip()"
            (reset)="state.resetMesh()">
          </app-mesh-actions>
        </section>

        <section class="devices">
          <app-device-list [devices]="state.devices()" (toggleInternet)="state.toggleDeviceInternet($event)"></app-device-list>
        </section>

        <section class="main">
          <app-mesh-proximity></app-mesh-proximity>
          <app-gossip-scale-lab></app-gossip-scale-lab>
          <app-pipeline-trace [trace]="state.pipelineTrace()"></app-pipeline-trace>
          <app-transaction-ledger [transactions]="state.transactions()"></app-transaction-ledger>
          <div class="bottom-grid">
            <app-account-balances [accounts]="state.accounts()"></app-account-balances>
            <app-activity-log [entries]="state.activityLog()"></app-activity-log>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .root { padding: 20px 24px 40px; max-width: 1600px; margin: 0 auto; }
    .controls { grid-area: controls; display: flex; flex-direction: column; gap: 20px; min-width: 0; }
    .devices { grid-area: devices; min-width: 0; }
    .main { grid-area: main; display: flex; flex-direction: column; gap: 24px; min-width: 0; }
    .bottom-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 24px; min-width: 0; }
  `]
})
export class AppComponent implements OnInit, OnDestroy {
  showHelp = signal(false);

  constructor(public state: MeshStateService) {}

  ngOnInit(): void {
    this.state.startPolling();
  }

  ngOnDestroy(): void {
    this.state.stopPolling();
  }

  onInject(req: DemoSendRequest): void {
    this.state.injectPacket(req);
  }
}
