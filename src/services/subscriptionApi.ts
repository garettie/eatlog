import { hasPaidFeatures, type EatlogAccess, type EatlogUsage } from './billing.types';

export type AiAuthorizationFailure = 'paid-access-required' | 'entitlement-unavailable';

interface AiGrant {
  token: string;
  expiresAt: string;
}

interface WorkerAccessRefreshResponse {
  access: EatlogAccess;
  grant?: AiGrant;
  usage?: EatlogUsage;
}

interface AccessRefreshResult {
  usage: EatlogUsage;
}

interface SubscriptionApiOptions {
  workerUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

let activeAccess: EatlogAccess | null = null;
let activeGrant: AiGrant | null = null;

function isAccess(value: unknown): value is EatlogAccess {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.checkedAt === 'string'
    && ['pugo', 'manok-trial', 'manok', 'itik', 'complimentary'].includes(String(record.kind));
}

function isGrant(value: unknown): value is AiGrant {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.token === 'string'
    && record.token.length > 20
    && typeof record.expiresAt === 'string'
    && Number.isFinite(new Date(record.expiresAt).getTime());
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isUsage(value: unknown): value is EatlogUsage {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.kind === 'none') return true;
  if (record.kind === 'trial') {
    return isCount(record.initialRemaining24Hours)
      && isCount(record.initialRemainingTrial)
      && isCount(record.clarificationRemaining24Hours)
      && isCount(record.clarificationRemainingTrial)
      && isNullableDate(record.nextInitialEligibleAt)
      && isNullableDate(record.nextClarificationEligibleAt);
  }
  return record.kind === 'paid'
    && isCount(record.remaining24Hours)
    && isCount(record.remaining30Days)
    && isNullableDate(record.nextEligibleAt);
}

export function setLocalAccessForAi(access: EatlogAccess | null): void {
  activeAccess = access;
  if (access === null || access.kind === 'pugo') activeGrant = null;
}

export function clearAiGrant(): void {
  activeGrant = null;
}

export function getAiAuthorization(now = Date.now()):
  | { ok: true; grant: string }
  | { ok: false; kind: AiAuthorizationFailure } {
  if (activeAccess === null) return { ok: false, kind: 'entitlement-unavailable' };
  if (activeAccess.kind === 'pugo') {
    return {
      ok: false,
      kind: activeAccess.reason === 'unavailable' || activeAccess.reason === 'malformed'
        ? 'entitlement-unavailable'
        : 'paid-access-required',
    };
  }
  if (!hasPaidFeatures(activeAccess, new Date(now))) {
    return { ok: false, kind: 'entitlement-unavailable' };
  }
  if (!activeGrant || new Date(activeGrant.expiresAt).getTime() <= now) {
    return { ok: false, kind: 'entitlement-unavailable' };
  }
  return { ok: true, grant: activeGrant.token };
}

export function createSubscriptionApi(options: SubscriptionApiOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  async function refresh(installId: string): Promise<AccessRefreshResult> {
    if (!options.workerUrl) throw new Error('Subscription service unavailable.');
    const response = await fetchImpl(`${options.workerUrl}/v1/access/refresh`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Eatlog-Install-ID': installId,
      },
      body: '{}',
    });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json')) {
      throw new Error('Subscription service unavailable.');
    }
    const value = await response.json() as Partial<WorkerAccessRefreshResponse>;
    if (!isAccess(value.access)) throw new Error('Subscription service unavailable.');
    activeGrant = value.access.kind !== 'pugo'
      && isGrant(value.grant)
      && new Date(value.grant.expiresAt).getTime() > now()
      ? value.grant
      : null;
    return { usage: isUsage(value.usage) ? value.usage : { kind: 'none' } };
  }

  async function usage(): Promise<EatlogUsage> {
    const authorization = getAiAuthorization(now());
    if (!authorization.ok) return { kind: 'none' };
    const response = await fetchImpl(`${options.workerUrl}/v1/usage`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${authorization.grant}` },
    });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json')) {
      throw new Error('Usage unavailable.');
    }
    return await response.json() as EatlogUsage;
  }

  return { refresh, usage };
}
