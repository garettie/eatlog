import { hasItik, type EatlogAccess, type EatlogUsage } from './billing.types';

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
  timeoutMs?: number;
}

export interface PaidAccessStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

const PAID_ACCESS_FILE_NAME = 'paid-access-v1';

let activeAccess: EatlogAccess | null = null;
let activeGrant: AiGrant | null = null;
let accessStore: PaidAccessStore | null = null;

function isAccess(value: unknown): value is EatlogAccess {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.checkedAt === 'string'
    && ['none', 'subscription', 'purchase', 'complimentary'].includes(String(record.kind));
}

function isResolvedNone(access: EatlogAccess): boolean {
  return access.kind === 'none'
    && access.reason !== 'unavailable'
    && access.reason !== 'malformed';
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
  return record.kind === 'paid'
    && isCount(record.remaining24Hours)
    && isCount(record.remaining30Days)
    && isNullableDate(record.nextEligibleAt);
}

export function setPaidAccessStore(store: PaidAccessStore | null): void {
  accessStore = store;
}

export function documentPaidAccessStore(): PaidAccessStore {
  const open = async () => {
    const { File, Paths } = await import('expo-file-system');
    return new File(Paths.document, PAID_ACCESS_FILE_NAME);
  };
  return {
    read: async () => {
      const file = await open();
      return file.exists ? await file.text() : null;
    },
    write: async (value) => { (await open()).write(value); },
  };
}

function persistPaidAccess(): void {
  const store = accessStore;
  if (!store || activeAccess === null) return;
  // A transient failure is not an answer, so it never overwrites a stored one. A resolved
  // "no entitlement" is: persisting it lets a cold start open on an honest state instead of a
  // spinner, and it is the least-privileged state so restoring it can only narrow access.
  if (activeAccess.kind === 'none' && !isResolvedNone(activeAccess)) return;
  void store.write(JSON.stringify({ access: activeAccess })).catch(() => {});
}

function isRestorable(access: EatlogAccess, now: number): boolean {
  return access.kind === 'none' ? isResolvedNone(access) : hasItik(access, new Date(now));
}

export async function restorePaidAccess(now = Date.now()): Promise<EatlogAccess | null> {
  const store = accessStore;
  if (!store || activeAccess !== null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse((await store.read()) ?? 'null');
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const snapshot = parsed as Record<string, unknown>;
  if (!isAccess(snapshot.access) || !isRestorable(snapshot.access, now)) return null;
  activeAccess = snapshot.access;
  return snapshot.access;
}

export function setLocalAccessForAi(access: EatlogAccess | null): void {
  const previous = activeAccess;
  activeAccess = access;
  if (access === null
    || access.kind === 'none' && !isResolvedNone(access)
    || previous?.kind !== access.kind) {
    activeGrant = null;
  }
  persistPaidAccess();
}

export function clearAiGrant(): void {
  activeGrant = null;
  persistPaidAccess();
}

export function acceptAiGrant(token: string, expiresAt: string, now = Date.now()): boolean {
  const grant = { token, expiresAt };
  if (!isGrant(grant) || new Date(expiresAt).getTime() <= now) return false;
  activeGrant = grant;
  persistPaidAccess();
  return true;
}

export function getAiAuthorization(now = Date.now()):
  | { ok: true; grant: string }
  | { ok: false; kind: AiAuthorizationFailure } {
  if (activeAccess === null) return { ok: false, kind: 'entitlement-unavailable' };
  if (activeAccess.kind === 'none' && !isResolvedNone(activeAccess)) {
    return { ok: false, kind: 'entitlement-unavailable' };
  }
  if (activeAccess.kind !== 'none' && !hasItik(activeAccess, new Date(now))) {
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
  const timeoutMs = options.timeoutMs ?? 15000;

  async function refresh(installId: string, force = false): Promise<AccessRefreshResult> {
    if (!options.workerUrl) throw new Error('Subscription service unavailable.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${options.workerUrl}/v1/access/refresh`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Eatlog-Install-ID': installId,
        },
        body: JSON.stringify(force ? { force: true } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Subscription service unavailable.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json')) {
      throw new Error('Subscription service unavailable.');
    }
    const value = await response.json() as Partial<WorkerAccessRefreshResponse>;
    if (!isAccess(value.access)) throw new Error('Subscription service unavailable.');
    // Hosted AI is Itik only, so a grant beside "no entitlement" authorizes nothing.
    const offered = value.access.kind !== 'none'
      && isGrant(value.grant)
      && new Date(value.grant.expiresAt).getTime() > now()
      ? value.grant
      : null;
    // The Worker's view of RevenueCat can lag the device's, as when a purchase has not reached
    // it yet. A "no entitlement" answer must not take Itik from a device whose own store record
    // still holds it: keep a grant that is still valid, and otherwise hold none, so the app
    // reports the estimate as unavailable rather than turning away someone who paid.
    if (value.access.kind === 'none'
      && activeAccess !== null
      && activeAccess.kind !== 'none'
      && hasItik(activeAccess, new Date(now()))) {
      if (activeGrant !== null && new Date(activeGrant.expiresAt).getTime() <= now()) activeGrant = null;
      persistPaidAccess();
      return { usage: { kind: 'none' } };
    }
    activeGrant = offered;
    persistPaidAccess();
    return { usage: isUsage(value.usage) ? value.usage : { kind: 'none' } };
  }

  async function usage(): Promise<EatlogUsage> {
    const authorization = getAiAuthorization(now());
    if (!authorization.ok) return { kind: 'none' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${options.workerUrl}/v1/usage`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${authorization.grant}` },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Usage unavailable.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json')) {
      throw new Error('Usage unavailable.');
    }
    return await response.json() as EatlogUsage;
  }

  return { refresh, usage };
}
