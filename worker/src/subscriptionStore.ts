import type {
  CachedAccess,
  PaidAccessKind,
  QuotaDecision,
  SubscriptionStore,
  Usage,
} from './subscriptions';

interface NamespaceEnv { ACCESS_STATE: DurableObjectNamespace }

export class DurableSubscriptionStore implements SubscriptionStore {
  private readonly stub: DurableObjectStub;
  constructor(env: NamespaceEnv) { this.stub = env.ACCESS_STATE.get(env.ACCESS_STATE.idFromName('entitlement-quota-v1')); }
  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.stub.fetch(`https://access.internal${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('Subscription state unavailable.');
    return await response.json() as T;
  }
  getCached(customerKey: string, now: number, stale = false): Promise<CachedAccess | null> { return this.call('/cache/get', { customerKey, now, stale }); }
  putCached(customerKey: string, value: CachedAccess): Promise<void> { return this.call('/cache/put', { customerKey, ...value }); }
  async recordWebhook(eventId: string, eventTimestamp: number, customerKeys: string[]): Promise<'accepted' | 'duplicate' | 'stale'> { return (await this.call<{ result: 'accepted' | 'duplicate' | 'stale' }>('/webhook', { eventId, eventTimestamp, customerKeys })).result; }
  reserve(subject: string, access: PaidAccessKind, operation: string, requestId: string, now: number): Promise<QuotaDecision> { return this.call('/quota/reserve', { subject, access, operation, requestId, now }); }
  finalize(subject: string, requestId: string): Promise<void> { return this.call('/quota/finalize', { subject, requestId }); }
  refund(subject: string, requestId: string): Promise<void> { return this.call('/quota/refund', { subject, requestId }); }
  usage(subject: string, access: PaidAccessKind, now: number): Promise<Usage> { return this.call('/quota/usage', { subject, access, now }); }
}
