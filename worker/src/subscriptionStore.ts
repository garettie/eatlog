import type {
  CachedAccess,
  AiAccessKind,
  ExecutionClaim,
  ExecutionOutcome,
  QuotaDecision,
  RefundReason,
  SubscriptionStore,
  Usage,
} from './subscriptions';

interface NamespaceEnv { ACCESS_STATE: DurableObjectNamespace }

/**
 * A quota round trip is a call to one local Durable Object. Past a few seconds it is not going
 * to answer, and every stage of a request shares one budget, so an unbounded state call here
 * would spend the time the estimate itself needs.
 */
const STATE_CALL_TIMEOUT_MS = 3000;

export class DurableSubscriptionStore implements SubscriptionStore {
  private readonly stub: DurableObjectStub;
  constructor(env: NamespaceEnv) { this.stub = env.ACCESS_STATE.get(env.ACCESS_STATE.idFromName('entitlement-quota-v1')); }
  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STATE_CALL_TIMEOUT_MS);
    try {
      const response = await this.stub.fetch(`https://access.internal${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) throw new Error('Subscription state unavailable.');
      return await response.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }
  getCached(customerKey: string, now: number, stale = false): Promise<CachedAccess | null> { return this.call('/cache/get', { customerKey, now, stale }); }
  putCached(customerKey: string, value: CachedAccess): Promise<void> { return this.call('/cache/put', { customerKey, ...value }); }
  async recordWebhook(eventId: string, eventTimestamp: number, customerKeys: string[]): Promise<'accepted' | 'duplicate' | 'stale'> { return (await this.call<{ result: 'accepted' | 'duplicate' | 'stale' }>('/webhook', { eventId, eventTimestamp, customerKeys })).result; }
  reserve(subject: string, access: AiAccessKind, operation: string, requestId: string, now: number): Promise<QuotaDecision> { return this.call('/quota/reserve', { subject, access, operation, requestId, now }); }
  finalize(subject: string, requestId: string): Promise<void> { return this.call('/quota/finalize', { subject, requestId }); }
  refund(subject: string, requestId: string, reason: RefundReason): Promise<void> { return this.call('/quota/refund', { subject, requestId, reason }); }
  usage(subject: string, access: AiAccessKind, now: number): Promise<Usage> { return this.call('/quota/usage', { subject, access, now }); }
  claimExecution(subject: string, requestId: string, fingerprint: string, operation: string, now: number): Promise<ExecutionClaim> { return this.call('/execution/claim', { subject, requestId, fingerprint, operation, now }); }
  async completeExecution(subject: string, requestId: string, token: string, outcome: ExecutionOutcome, result: string | null, now: number): Promise<void> { await this.call('/execution/complete', { subject, requestId, token, outcome, result, now }); }
}
