import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Miniflare } from 'miniflare';

import type { ExecutionClaim, ExecutionOutcome, QuotaDecision, RefundReason, SubscriptionStore, Usage } from '../../src/subscriptions.js';

/**
 * The smallest harness that runs the real `EntitlementQuotaState` — its real SQL, its real
 * SQLite storage, and the real Workers runtime — rather than a second implementation of the
 * same statements. Copying production SQL into a mock and asserting against the copy would
 * prove nothing about the deployed object, which is exactly the gap the service review found.
 *
 * Wrangler bundles the class offline (`--dry-run`) and Miniflare boots the bundle on the
 * `workerd` binary both are already installed with, so no new dependency and no network or
 * account access is involved.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const workerRoot = join(here, '..', '..');
const config = join(here, 'wrangler.durable-object-test.jsonc');

/**
 * The installed `workerd` refuses a compatibility date newer than it knows, and it is older
 * than the deployed staging date. Nothing this harness exercises is date-gated, but the gap is
 * real: it is the reason a runtime behaviour proven here is still worth confirming on staging.
 */
export const HARNESS_COMPATIBILITY_DATE = '2026-08-08';

let bundle: Promise<string> | null = null;

function bundleDurableObject(): Promise<string> {
  bundle ??= (async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'eatlog-do-bundle-'));
    const result = spawnSync(
      'npx',
      ['wrangler', 'deploy', '--dry-run', '--outdir', outDir, '--config', config],
      { cwd: workerRoot, encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(`Durable Object bundle failed:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    }
    return outDir;
  })();
  return bundle;
}

export interface QuotaRuntime {
  /** A `SubscriptionStore` view of the running Durable Object, for assertions shared with the memory store. */
  readonly store: SubscriptionStore;
  /** Tears the runtime down and brings it back on the same storage, as a Durable Object restart does. */
  restart(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Each runtime gets its own empty storage directory, so one test can never read a row another
 * test — or an earlier run of the same test — left behind.
 */
export async function startQuotaRuntime(): Promise<QuotaRuntime> {
  const scriptDir = await bundleDurableObject();
  const persistPath = mkdtempSync(join(tmpdir(), 'eatlog-do-state-'));
  const options = {
    modules: true,
    scriptPath: join(scriptDir, 'durableObjectEntry.js'),
    modulesRoot: scriptDir,
    compatibilityDate: HARNESS_COMPATIBILITY_DATE,
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: { ACCESS_STATE: { className: 'EntitlementQuotaState', useSQLite: true } },
    resourcePersistencePath: persistPath,
  } as const;

  let runtime = new Miniflare(options);

  async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await runtime.dispatchFetch(`https://durable-object.test${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Durable Object returned ${response.status} for ${path}.`);
    return await response.json() as T;
  }

  const store: SubscriptionStore = {
    getCached: (customerKey, now, stale = false) => call('/cache/get', { customerKey, now, stale }),
    putCached: (customerKey, value) => call('/cache/put', { customerKey, ...value }),
    async recordWebhook(eventId, eventTimestamp, customerKeys) {
      return (await call<{ result: 'accepted' | 'duplicate' | 'stale' }>('/webhook', { eventId, eventTimestamp, customerKeys })).result;
    },
    reserve: (subject, requestId, now): Promise<QuotaDecision> =>
      call('/quota/reserve', { subject, requestId, now }),
    finalize: (subject, requestId) => call<void>('/quota/finalize', { subject, requestId }),
    refund: (subject, requestId, reason: RefundReason) => call<void>('/quota/refund', { subject, requestId, reason }),
    usage: (subject, now): Promise<Usage> => call('/quota/usage', { subject, now }),
    claimExecution: (subject, requestId, fingerprint, operation, now): Promise<ExecutionClaim> =>
      call('/execution/claim', { subject, requestId, fingerprint, operation, now }),
    async completeExecution(subject, requestId, token, outcome: ExecutionOutcome, result, now) {
      await call('/execution/complete', { subject, requestId, token, outcome, result, now });
    },
  };

  return {
    store,
    async restart() {
      await runtime.dispose();
      runtime = new Miniflare(options);
    },
    async dispose() {
      await runtime.dispose();
      rmSync(persistPath, { recursive: true, force: true });
    },
  };
}
