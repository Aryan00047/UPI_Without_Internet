import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Account,
  DemoSendRequest,
  DemoSendResponse,
  FlushResponse,
  GossipResponse,
  MeshStateResponse,
  Transaction
} from '../models/mesh.models';

/** Thin HttpClient wrapper — one method per existing ApiController endpoint. */
@Injectable({ providedIn: 'root' })
export class MeshApiService {
  private readonly base = '/api';
  // Polled GETs must never be served from a stale browser/proxy cache.
  private readonly noCache = new HttpHeaders({ 'Cache-Control': 'no-cache' });

  constructor(private http: HttpClient) {}

  getMeshState(): Observable<MeshStateResponse> {
    return this.http.get<MeshStateResponse>(`${this.base}/mesh/state`, { headers: this.noCache });
  }

  getAccounts(): Observable<Account[]> {
    return this.http.get<Account[]>(`${this.base}/accounts`, { headers: this.noCache });
  }

  getTransactions(): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(`${this.base}/transactions`, { headers: this.noCache });
  }

  sendDemoPacket(req: DemoSendRequest): Observable<DemoSendResponse> {
    return this.http.post<DemoSendResponse>(`${this.base}/demo/send`, req);
  }

  gossip(): Observable<GossipResponse> {
    return this.http.post<GossipResponse>(`${this.base}/mesh/gossip`, {});
  }

  flush(): Observable<FlushResponse> {
    return this.http.post<FlushResponse>(`${this.base}/mesh/flush`, {});
  }

  reset(): Observable<void> {
    return this.http.post<void>(`${this.base}/mesh/reset`, {});
  }

  toggleInternet(deviceId: string): Observable<{ deviceId: string; hasInternet: boolean }> {
    return this.http.post<{ deviceId: string; hasInternet: boolean }>(
      `${this.base}/mesh/devices/${encodeURIComponent(deviceId)}/toggle-internet`, {}
    );
  }
}
