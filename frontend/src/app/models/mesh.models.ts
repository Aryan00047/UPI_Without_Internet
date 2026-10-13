export interface MeshDevice {
  deviceId: string;
  hasInternet: boolean;
  packetCount: number;
  maxCapacity: number;
  droppedForCapacity: number;
  packetIds: string[];
}

export interface Account {
  vpa: string;
  holderName: string;
  balance: number;
  publicKeyBase64: string | null;
}

export type TransactionStatus = 'SETTLED' | 'REJECTED';

export interface Transaction {
  id: number;
  senderVpa: string;
  receiverVpa: string;
  amount: number;
  status: TransactionStatus;
  bridgeNodeId: string;
  hopCount: number;
  settledAt: string;
}

export type IngestOutcome = 'SETTLED' | 'DUPLICATE_DROPPED' | 'INVALID' | 'REJECTED';

export type IngestReason =
  | 'duplicate'
  | 'decryption_failed'
  | 'unknown_sender_key'
  | 'invalid_signature'
  | 'stale_packet'
  | 'future_dated'
  | 'insufficient_funds'
  | null;

export interface IngestResult {
  outcome: IngestOutcome;
  packetHash: string;
  reason: IngestReason;
  transactionId: number | null;
}

export interface FlushResultEntry {
  bridgeNode: string;
  packetId: string;
  outcome: IngestOutcome;
  reason: string;
  transactionId: number;
}

export interface FlushResponse {
  uploadsAttempted: number;
  results: FlushResultEntry[];
}

export interface GossipResponse {
  transfers: number;
  droppedForCapacity: number;
  deviceCounts: Record<string, number>;
}

export interface MeshStateResponse {
  devices: MeshDevice[];
  idempotencyCacheSize: number;
}

export type DemoFlaw = 'corrupt' | 'stale' | 'future' | 'unknown_sender' | 'bad_signature' | null;

export interface DemoSendRequest {
  senderVpa: string;
  receiverVpa: string;
  amount: number;
  pin: string;
  ttl?: number;
  startDevice?: string;
  flaw?: DemoFlaw;
}

export interface DemoSendResponse {
  packetId: string;
  ciphertextPreview: string;
  ttl: number;
  injectedAt: string;
}

/** One entry in the pipeline trace panel — derived from a FlushResultEntry.
 * 'pending'/'checking' are transient, used only during the staged reveal
 * animation before a stage settles into its final passed/failed/not-reached state. */
export type StageStatus = 'passed' | 'failed' | 'not-reached' | 'pending' | 'checking';

export interface PipelineStage {
  name: 'Idempotency' | 'Decrypt' | 'Signature' | 'Freshness' | 'Settle';
  status: StageStatus;
}

export interface PipelineTraceEntry {
  key: string;
  hash: string;
  bridgeNode: string;
  time: string;
  outcome: IngestOutcome;
  reason: string;
  stages: PipelineStage[];
}

export interface ActivityLogEntry {
  time: string;
  message: string;
}
