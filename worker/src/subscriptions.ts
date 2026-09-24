export const AI_GRANT_AUDIENCE = 'eatlog-ai';
export const AI_GRANT_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ENTITLEMENT_CACHE_TTL_MS = 60 * 60 * 1000;
const PAID_DAILY_LIMIT = 30;
// A refunded reservation still cost a real Gemini call. Left uncapped, a device that keeps
// submitting unrecognizable input can refund its way past the visible daily allowance while
// this Worker keeps paying for every attempt. This limit is enforced on top of the normal
// paid allowance.
//
// It counts submissions the provider answered and found no food in — the behaviour worth
// discouraging. A provider outage is not that: five of Google's own 503s used to exhaust this
// ceiling and then refuse the next request for the rest of the day, turning a short outage into
// a much longer one for the customer.
const REFUND_DAILY_LIMIT = 5;
const PAID_30_DAY_LIMIT = 250;

/**
 * What one provider attempt is known to have consumed. Every field is separately unknown: a
 * provider that reports no usage, or reports it in a shape this Worker does not recognise, must
 * produce `null` rather than a zero that would quietly understate a bill.
 */
export interface AiTokenUsage {
  /** Prompt tokens actually charged as input, with any cached portion already removed. */
  inputTokens: number | null;
  /** Cached prompt tokens, priced separately so they are never counted as input as well. */
  cachedInputTokens: number | null;
  candidateTokens: number | null;
  thoughtTokens: number | null;
}

/** Per-million rates for one model. Absent rates make cost unknown, never free. */
export interface AiModelRates {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
}

function sumKnown(values: Array<number | null>): number | null {
  return values.some((value) => value === null) ? null : values.reduce((total, value) => total! + value!, 0);
}

export function aggregateAiUsage(usage: AiTokenUsage, rates: AiModelRates | null) {
  const outputTokens = sumKnown([usage.candidateTokens, usage.thoughtTokens]);
  const totalTokens = sumKnown([usage.inputTokens, usage.cachedInputTokens, outputTokens]);
  const priced = rates !== null
    && usage.inputTokens !== null
    && usage.cachedInputTokens !== null
    && outputTokens !== null;
  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    candidateTokens: usage.candidateTokens,
    thoughtTokens: usage.thoughtTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: priced
      ? ((usage.inputTokens! * rates!.inputUsdPerMillion)
        + (usage.cachedInputTokens! * rates!.cachedInputUsdPerMillion)
        + (outputTokens! * rates!.outputUsdPerMillion)) / 1_000_000
      : null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const THIRTY_DAYS_MS = 30 * DAY_MS;
/**
 * Every active `eatlog_paid` entitlement is Itik. The kind records how it was obtained, read from
 * the shape of RevenueCat's record rather than from product identifiers, so a new Itik product
 * or cadence needs no Worker change.
 */
export type AiAccessKind = 'purchase' | 'subscription' | 'complimentary';
export type WorkerAccess =
  | { kind: 'none'; checkedAt: string; reason?: 'none' | 'malformed' | 'expired' | 'revoked' }
  | { kind: 'subscription'; checkedAt: string; expiresAt: string; willRenew: boolean; productId: string; billingState: 'active' | 'grace'; trial: boolean }
  | { kind: 'purchase'; checkedAt: string; productId: string; purchasedAt: string | null }
  | { kind: 'complimentary'; checkedAt: string; expiresAt: string | null };

export type Usage =
  | { kind: 'none' }
  | { kind: 'paid'; remaining24Hours: number; remaining30Days: number; nextEligibleAt: string | null };

export interface VerifiedRevenueCatAccess {
  access: WorkerAccess;
  subjectIdentity: string | null;
}

export interface CachedAccess extends VerifiedRevenueCatAccess {
  validUntil: number;
}

export interface GrantClaims {
  aud: typeof AI_GRANT_AUDIENCE;
  sub: string;
  access: AiAccessKind;
  iat: number;
  exp: number;
}

export interface QuotaDecision {
  allowed: boolean;
  duplicate: boolean;
  code?: 'FAIR_USE_DAILY_LIMIT' | 'FAIR_USE_30_DAY_LIMIT' | 'REFUND_DAILY_LIMIT';
  nextEligibleAt?: string;
  usage: Usage;
}

export interface SubscriptionStore {
  getCached(customerKey: string, now: number, stale?: boolean): Promise<CachedAccess | null>;
  putCached(customerKey: string, value: CachedAccess): Promise<void>;
  recordWebhook(eventId: string, eventTimestamp: number, customerKeys: string[]): Promise<'accepted' | 'duplicate' | 'stale'>;
  reserve(subject: string, requestId: string, now: number): Promise<QuotaDecision>;
  finalize(subject: string, requestId: string): Promise<void>;
  refund(subject: string, requestId: string, reason: RefundReason): Promise<void>;
  usage(subject: string, now: number): Promise<Usage>;
  /** Claims the single provider execution for one logical action. See `ExecutionLedger`. */
  claimExecution(subject: string, requestId: string, fingerprint: string, operation: string, now: number): Promise<ExecutionClaim>;
  /** Reports how a claimed execution ended, holding its result briefly for duplicate retries. */
  completeExecution(subject: string, requestId: string, token: string, outcome: ExecutionOutcome, result: string | null, now: number): Promise<void>;
}

/**
 * `refunded` is the historical class, written before the cause of a refund was recorded. Those
 * rows stay in history but count toward nothing: their cause is unknown, and treating an old
 * outage as abuse is exactly the lockout this split exists to end.
 */
export type QuotaOperationClass =
  | 'paid'
  | 'refunded'
  | 'unrecognized'
  | 'service-failure';

export type RefundReason = 'unrecognized' | 'service-failure';

export interface QuotaEvent {
  operationClass: QuotaOperationClass;
  timestamp: number;
  requestId: string;
}

/** Only a generation the user got something out of spends the visible allowance. */
function spendsAllowance(event: QuotaEvent): boolean {
  return event.operationClass === 'paid';
}

function remaining(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

function nextAt(events: QuotaEvent[], windowStart: number): string | null {
  const oldest = events.filter((event) => event.timestamp > windowStart).sort((a, b) => a.timestamp - b.timestamp)[0];
  return oldest ? new Date(oldest.timestamp + DAY_MS).toISOString() : null;
}

export function quotaUsage(events: QuotaEvent[], now: number): Usage {
  const daily = events.filter((event) => spendsAllowance(event) && event.timestamp > now - DAY_MS);
  const monthly = events.filter((event) => spendsAllowance(event) && event.timestamp > now - THIRTY_DAYS_MS);
  return {
    kind: 'paid',
    remaining24Hours: remaining(PAID_DAILY_LIMIT, daily.length),
    remaining30Days: remaining(PAID_30_DAY_LIMIT, monthly.length),
    nextEligibleAt: daily.length >= PAID_DAILY_LIMIT ? nextAt(daily, now - DAY_MS) : null,
  };
}

export function decideQuota(events: QuotaEvent[], now: number): QuotaDecision {
  const usage = quotaUsage(events, now);
  // Only generations the provider completed and found no food in. Provider timeouts, outages,
  // and malformed replies are our problem to absorb, not the customer's to be locked out over.
  const rejectedToday = events.filter((event) => event.operationClass === 'unrecognized' && event.timestamp > now - DAY_MS);
  if (rejectedToday.length >= REFUND_DAILY_LIMIT) {
    const nextEligibleAt = nextAt(rejectedToday, now - DAY_MS);
    return { allowed: false, duplicate: false, code: 'REFUND_DAILY_LIMIT', ...(nextEligibleAt ? { nextEligibleAt } : {}), usage };
  }
  if (usage.kind === 'paid') {
    if (usage.remaining30Days === 0) return { allowed: false, duplicate: false, code: 'FAIR_USE_30_DAY_LIMIT', usage };
    if (usage.remaining24Hours === 0) return { allowed: false, duplicate: false, code: 'FAIR_USE_DAILY_LIMIT', ...(usage.nextEligibleAt ? { nextEligibleAt: usage.nextEligibleAt } : {}), usage };
  }
  return { allowed: true, duplicate: false, usage };
}

export class MemorySubscriptionStore implements SubscriptionStore {
  private readonly cache = new Map<string, CachedAccess>();
  private readonly events = new Map<string, QuotaEvent[]>();
  private readonly requests = new Map<string, { state: 'reserved' | 'finalized' | 'refunded'; createdAt: number }>();
  private readonly webhookIds = new Set<string>();
  private readonly webhookTimestamps = new Map<string, number>();
  private readonly webhookEventTimestamps = new Map<string, number>();
  private readonly executions = new ExecutionLedger();
  private queue = Promise.resolve();

  private synchronized<T>(task: () => T | Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async getCached(customerKey: string, now: number, stale = false): Promise<CachedAccess | null> {
    const cached = this.cache.get(customerKey) ?? null;
    if (!cached || (!stale && cached.validUntil <= now) || accessExpired(cached.access, now)) return null;
    return cached;
  }

  async putCached(customerKey: string, value: CachedAccess): Promise<void> {
    this.cache.set(customerKey, value);
  }

  recordWebhook(eventId: string, eventTimestamp: number, customerKeys: string[]): Promise<'accepted' | 'duplicate' | 'stale'> {
    return this.synchronized(() => {
      for (const [id, timestamp] of this.webhookEventTimestamps) {
        if (timestamp <= eventTimestamp - THIRTY_DAYS_MS) {
          this.webhookEventTimestamps.delete(id);
          this.webhookIds.delete(id);
        }
      }
      if (this.webhookIds.has(eventId)) return 'duplicate';
      if (customerKeys.some((key) => eventTimestamp < (this.webhookTimestamps.get(key) ?? 0))) return 'stale';
      this.webhookIds.add(eventId);
      this.webhookEventTimestamps.set(eventId, eventTimestamp);
      for (const key of customerKeys) {
        this.webhookTimestamps.set(key, eventTimestamp);
        // Expire rather than delete. The next request still re-verifies against RevenueCat,
        // but the last known access stays readable as an outage fallback, so a routine
        // renewal event cannot strand a paying customer without access.
        const cached = this.cache.get(key);
        if (cached) this.cache.set(key, { ...cached, validUntil: 0 });
      }
      return 'accepted';
    });
  }

  reserve(subject: string, requestId: string, now: number): Promise<QuotaDecision> {
    return this.synchronized(() => {
      const requestKey = `${subject}:${requestId}`;
      for (const [key, request] of this.requests) {
        if (request.createdAt <= now - THIRTY_DAYS_MS) this.requests.delete(key);
      }
      const prior = this.requests.get(requestKey);
      if ((prior?.state === 'reserved' || prior?.state === 'finalized')
        && prior.createdAt > now - DUPLICATE_WINDOW_MS) {
        return { allowed: true, duplicate: true, usage: quotaUsage(this.events.get(subject) ?? [], now) };
      }
      const events = (this.events.get(subject) ?? []).filter((event) => event.timestamp > now - THIRTY_DAYS_MS);
      const decision = decideQuota(events, now);
      if (!decision.allowed) return decision;
      // One row per request ID, replaced rather than appended, matching the Durable Object's
      // (subject, request_id) primary key. The two stores disagreeing on this is what let a
      // behaviour pass here and behave differently in production.
      const next = [
        ...events.filter((event) => event.requestId !== requestId),
        { operationClass: 'paid' as const, timestamp: now, requestId },
      ];
      this.events.set(subject, next);
      this.requests.set(requestKey, { state: 'reserved', createdAt: now });
      return { ...decision, usage: quotaUsage(next, now) };
    });
  }

  async finalize(subject: string, requestId: string): Promise<void> {
    const key = `${subject}:${requestId}`;
    const request = this.requests.get(key);
    if (request?.state === 'reserved') this.requests.set(key, { ...request, state: 'finalized' });
  }

  async refund(subject: string, requestId: string, reason: RefundReason): Promise<void> {
    const key = `${subject}:${requestId}`;
    const request = this.requests.get(key);
    if (request?.state !== 'reserved') return;
    this.events.set(subject, (this.events.get(subject) ?? []).map((event) => (
      event.requestId === requestId ? { ...event, operationClass: reason } : event
    )));
    this.requests.set(key, { ...request, state: 'refunded' });
  }

  async usage(subject: string, now: number): Promise<Usage> {
    return quotaUsage(this.events.get(subject) ?? [], now);
  }

  claimExecution(subject: string, requestId: string, fingerprint: string, operation: string, now: number): Promise<ExecutionClaim> {
    return this.synchronized(() => this.executions.claim(subject, requestId, fingerprint, operation, now));
  }

  completeExecution(subject: string, requestId: string, token: string, outcome: ExecutionOutcome, result: string | null, now: number): Promise<void> {
    return this.synchronized(() => this.executions.complete(subject, requestId, token, outcome, result, now));
  }
}

function base64UrlEncode(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export async function signAiGrant(claims: GrantClaims, secret: string): Promise<string> {
  const payload = base64UrlEncode(JSON.stringify(claims));
  return `${payload}.${base64UrlEncode(await hmac(payload, secret))}`;
}

function isAiAccessKind(value: unknown): value is AiAccessKind {
  return value === 'purchase' || value === 'subscription' || value === 'complimentary';
}

export async function verifyAiGrant(token: string, secret: string, now: number): Promise<GrantClaims | null> {
  const [payload, encodedSignature, extra] = token.split('.');
  if (!payload || !encodedSignature || extra) return null;
  let supplied: Uint8Array;
  try { supplied = base64UrlDecode(encodedSignature); } catch { return null; }
  const expected = await hmac(payload, secret);
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?(left: ArrayBufferView, right: ArrayBufferView): boolean;
  };
  if (supplied.byteLength !== expected.byteLength) return null;
  let signaturesMatch: boolean;
  if (subtle.timingSafeEqual) {
    signaturesMatch = subtle.timingSafeEqual(supplied, expected);
  } else {
    let difference = 0;
    for (let index = 0; index < supplied.length; index += 1) difference |= supplied[index] ^ expected[index];
    signaturesMatch = difference === 0;
  }
  if (!signaturesMatch) return null;
  let claims: unknown;
  try { claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))); } catch { return null; }
  if (!claims || typeof claims !== 'object') return null;
  const value = claims as Record<string, unknown>;
  if (value.aud !== AI_GRANT_AUDIENCE
    || typeof value.sub !== 'string'
    || !isAiAccessKind(value.access)
    || typeof value.iat !== 'number'
    || typeof value.exp !== 'number'
    || value.exp <= now
    || value.iat > now + 60_000
    || value.exp - value.iat > AI_GRANT_MAX_TTL_MS) return null;
  return {
    aud: AI_GRANT_AUDIENCE,
    sub: value.sub,
    access: value.access,
    iat: value.iat,
    exp: value.exp,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function dateValue(value: unknown): string | null {
  const candidate = stringValue(value);
  if (!candidate) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizeRevenueCatSubscriber(value: unknown, now: number): VerifiedRevenueCatAccess {
  const checkedAt = new Date(now).toISOString();
  const none = (reason: 'none' | 'malformed' | 'expired'): VerifiedRevenueCatAccess => (
    { access: { kind: 'none', checkedAt, reason }, subjectIdentity: null }
  );
  if (!value || typeof value !== 'object') return none('malformed');
  const subscriber = (value as Record<string, unknown>).subscriber;
  if (!subscriber || typeof subscriber !== 'object') return none('malformed');
  const record = subscriber as Record<string, unknown>;
  const entitlements = record.entitlements;
  const entitlement = entitlements && typeof entitlements === 'object'
    ? (entitlements as Record<string, unknown>).eatlog_paid
    : null;
  if (!entitlement || typeof entitlement !== 'object') return none('none');
  const paid = entitlement as Record<string, unknown>;
  const productId = stringValue(paid.product_identifier);
  const expiresAt = paid.expires_date == null ? null : dateValue(paid.expires_date);
  if (!productId || (paid.expires_date != null && !expiresAt)) return none('malformed');
  if (expiresAt && Date.parse(expiresAt) <= now) return none('expired');
  const originalAppUserId = stringValue(record.original_app_user_id);
  const subscriptions = record.subscriptions && typeof record.subscriptions === 'object' ? record.subscriptions as Record<string, unknown> : {};
  const nonSubscriptions = record.non_subscriptions && typeof record.non_subscriptions === 'object' ? record.non_subscriptions as Record<string, unknown> : {};
  const subscription = subscriptions[productId] && typeof subscriptions[productId] === 'object'
    ? subscriptions[productId] as Record<string, unknown>
    : {};

  // The `itik:` and `manok:` prefixes below predate the tier rename. They are hashed into the
  // quota subject, so changing them would reset every paid allowance on deploy.
  const transactions = Array.isArray(nonSubscriptions[productId])
    ? nonSubscriptions[productId] as Array<Record<string, unknown>>
    : [];
  if (transactions.length > 0) {
    const transaction = transactions.at(-1) ?? {};
    const transactionId = stringValue(transaction.store_transaction_id) ?? stringValue(transaction.id);
    if (!transactionId || expiresAt !== null) return none('malformed');
    return {
      access: { kind: 'purchase', checkedAt, productId, purchasedAt: dateValue(transaction.purchase_date) },
      subjectIdentity: `itik:${transactionId}`,
    };
  }

  const store = (stringValue(subscription.store) ?? stringValue(paid.store))?.toLowerCase();
  if (store === 'promotional') {
    if (!originalAppUserId) return none('malformed');
    return {
      access: { kind: 'complimentary', checkedAt, expiresAt },
      subjectIdentity: `complimentary:${originalAppUserId}:eatlog_paid`,
    };
  }

  if (!expiresAt) return none('malformed');
  const originalPurchaseDate = dateValue(subscription.original_purchase_date);
  const subscriptionIdentity = stringValue(subscription.original_transaction_id)
    ?? (originalAppUserId && originalPurchaseDate
      ? `${originalAppUserId}:${productId}:${originalPurchaseDate}`
      : null);
  if (!subscriptionIdentity) return none('malformed');
  const periodType = stringValue(subscription.period_type)?.toLowerCase();
  if (periodType !== 'trial' && periodType !== 'normal' && periodType !== 'intro') return none('malformed');
  return {
    access: {
      kind: 'subscription',
      checkedAt,
      expiresAt,
      willRenew: subscription.unsubscribe_detected_at == null,
      productId,
      billingState: subscription.billing_issues_detected_at == null ? 'active' : 'grace',
      trial: periodType === 'trial',
    },
    subjectIdentity: `manok:${subscriptionIdentity}`,
  };
}

/**
 * Reads a cached row written before the tier rename in the current shape. The last verified
 * access is the outage fallback, so a row this Worker can no longer read would turn a
 * RevenueCat outage into a denial for someone who paid. Null means the row says nothing usable.
 */
export function currentCachedAccess(cached: CachedAccess | null): CachedAccess | null {
  if (!cached) return null;
  const access = cached.access as unknown as Record<string, unknown>;
  const checkedAt = String(access.checkedAt);
  let upgraded: WorkerAccess | null;
  switch (access.kind) {
    case 'pugo':
      // A Pugo row confirmed that no purchase existed. Rows that only stood in for an outage
      // were marked provisional, and the store never returns those.
      upgraded = { kind: 'none', checkedAt };
      break;
    case 'manok':
    case 'manok-trial':
      upgraded = typeof access.expiresAt === 'string' ? {
        kind: 'subscription',
        checkedAt,
        expiresAt: access.expiresAt,
        willRenew: access.willRenew === true,
        productId: String(access.productId),
        billingState: access.billingState === 'grace' ? 'grace' : 'active',
        trial: access.kind === 'manok-trial',
      } : null;
      break;
    case 'itik':
      upgraded = {
        kind: 'purchase',
        checkedAt,
        productId: String(access.productId),
        purchasedAt: typeof access.purchasedAt === 'string' ? access.purchasedAt : null,
      };
      break;
    default:
      return cached;
  }
  return upgraded ? { ...cached, access: upgraded } : null;
}

export function accessExpiresAt(access: WorkerAccess): number | null {
  if (access.kind === 'none' || access.kind === 'purchase' || access.expiresAt == null) return null;
  const expiry = Date.parse(access.expiresAt);
  return Number.isFinite(expiry) ? expiry : null;
}

export function accessExpired(access: WorkerAccess, now: number): boolean {
  const expiry = accessExpiresAt(access);
  return expiry !== null && expiry <= now;
}

export async function hashQuotaIdentity(identity: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${identity}`));
  return base64UrlEncode(new Uint8Array(digest));
}

/*
 * Task 5 of the food-estimation plan: one intentional action gets one provider execution.
 *
 * The quota ledger above answers "what may this subject spend"; this one answers "who is
 * allowed to call Gemini right now, and does an answer already exist". They are deliberately
 * separate — a duplicate transport retry must not be charged twice *and* must not generate
 * twice, and those are two different guarantees.
 *
 * Everything here is memory-only and short-lived. Nothing derived from food text, an image, or
 * a result is ever written to durable storage, which is what the privacy policy commits to.
 */

/** How long one execution may hold its claim before another attempt is allowed to take over. */
/**
 * How long one request identifier keeps deduplicating. A transport retry arrives within
 * seconds; an identifier presented days later is a new submission, whatever produced it.
 *
 * This matters most for clients that still derive the identifier from the payload: without a
 * bound, logging the same meal again next week would present an identifier the service still
 * had on file and generate free of the allowance. It matches the execution replay window, past
 * which the service has forgotten the action anyway.
 */
export const DUPLICATE_WINDOW_MS = 120_000;

export const EXECUTION_LEASE_MS = 30_000;
/** How long a completed action stays replayable, and how long its record survives at all. */
export const EXECUTION_TTL_MS = 120_000;
/** Two, so an explicit retryable failure gets a second chance and a loop cannot get a third. */
export const MAX_EXECUTIONS_PER_ACTION = 2;
export const MAX_REPLAY_BYTES = 64 * 1024;
export const MAX_REPLAY_TOTAL_BYTES = 4 * 1024 * 1024;

export type ExecutionClaim =
  /** This caller owns the execution and must run the provider, then report the outcome. */
  | { state: 'claimed'; token: string }
  /** The action already completed and its result is still held; no provider call is needed. */
  | { state: 'replay'; result: string }
  /** Another live execution owns this action. Wait for it rather than starting a second one. */
  | { state: 'pending' }
  /** The identifier is already bound to different content or a different operation. */
  | { state: 'conflict' }
  /** No further execution is permitted for this action; the client needs a new one. */
  | { state: 'exhausted' };

export type ExecutionOutcome = 'succeeded' | 'failed-retryable' | 'failed-terminal';

interface ExecutionRecord {
  fingerprint: string;
  operation: string;
  attempts: number;
  touchedAt: number;
  lease: { token: string; expiresAt: number } | null;
  outcome: ExecutionOutcome | null;
  result: string | null;
  resultBytes: number;
}

/**
 * Shared by the memory store and the Durable Object so the two cannot drift apart. The review
 * that produced this plan found a rule that held in tests and not in production precisely
 * because each store implemented it separately.
 */
export class ExecutionLedger {
  private readonly records = new Map<string, ExecutionRecord>();
  private replayBytes = 0;

  claim(subject: string, requestId: string, fingerprint: string, operation: string, now: number): ExecutionClaim {
    this.prune(now);
    const key = `${subject}:${requestId}`;
    const record = this.records.get(key);
    if (!record) {
      const token = crypto.randomUUID();
      this.records.set(key, {
        fingerprint,
        operation,
        attempts: 1,
        touchedAt: now,
        lease: { token, expiresAt: now + EXECUTION_LEASE_MS },
        outcome: null,
        result: null,
        resultBytes: 0,
      });
      return { state: 'claimed', token };
    }
    // A reused identifier carrying different content is not a retry, and a paid Redo must not
    // be able to collect the result of an earlier estimate.
    if (record.fingerprint !== fingerprint || record.operation !== operation) return { state: 'conflict' };
    record.touchedAt = now;
    if (record.result !== null) return { state: 'replay', result: record.result };
    if (record.lease !== null && record.lease.expiresAt > now) return { state: 'pending' };
    // A completed action whose result is gone must not silently pay for a second generation.
    if (record.outcome === 'succeeded' || record.outcome === 'failed-terminal') return { state: 'exhausted' };
    if (record.attempts >= MAX_EXECUTIONS_PER_ACTION) return { state: 'exhausted' };
    const token = crypto.randomUUID();
    record.attempts += 1;
    record.lease = { token, expiresAt: now + EXECUTION_LEASE_MS };
    record.outcome = null;
    return { state: 'claimed', token };
  }

  complete(
    subject: string,
    requestId: string,
    token: string,
    outcome: ExecutionOutcome,
    result: string | null,
    now: number,
  ): void {
    const record = this.records.get(`${subject}:${requestId}`);
    // A completion from an execution that already lost its lease belongs to a replaced attempt.
    if (!record || record.lease?.token !== token) return;
    record.lease = null;
    record.outcome = outcome;
    record.touchedAt = now;
    if (outcome === 'succeeded' && result !== null) this.remember(record, result, now);
  }

  private remember(record: ExecutionRecord, result: string, now: number): void {
    const bytes = new TextEncoder().encode(result).length;
    if (bytes > MAX_REPLAY_BYTES) return;
    for (const [key, candidate] of [...this.records].sort((a, b) => a[1].touchedAt - b[1].touchedAt)) {
      if (this.replayBytes + bytes <= MAX_REPLAY_TOTAL_BYTES) break;
      if (candidate === record || candidate.result === null) continue;
      this.forget(candidate);
      if (candidate.touchedAt <= now - EXECUTION_TTL_MS) this.records.delete(key);
    }
    if (this.replayBytes + bytes > MAX_REPLAY_TOTAL_BYTES) return;
    record.result = result;
    record.resultBytes = bytes;
    this.replayBytes += bytes;
  }

  private forget(record: ExecutionRecord): void {
    this.replayBytes -= record.resultBytes;
    record.result = null;
    record.resultBytes = 0;
  }

  private prune(now: number): void {
    for (const [key, record] of this.records) {
      if (record.touchedAt > now - EXECUTION_TTL_MS) continue;
      this.forget(record);
      this.records.delete(key);
    }
  }
}
