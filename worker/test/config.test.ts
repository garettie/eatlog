import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface WorkerConfig {
  name: string;
  main: string;
  compatibility_date: string;
  compatibility_flags?: string[];
  workers_dev?: boolean;
  vars?: Record<string, string>;
  secrets?: { required?: string[] };
  durable_objects?: { bindings?: Array<{ name: string; class_name: string }> };
  migrations?: Array<{ tag: string; new_sqlite_classes?: string[] }>;
  observability?: unknown;
  ratelimits?: Array<{
    name: string;
    namespace_id: string;
    simple: { limit: number; period: number };
  }>;
  limits?: unknown;
}

/**
 * Wrangler reads `.jsonc`, so these files may carry comments that `JSON.parse` refuses. Only
 * whole-line comments are stripped: a `//` inside a value belongs to the value, and removing it
 * would silently rewrite the configuration this test exists to check.
 */
const readConfig = (filename: string): WorkerConfig => {
  const source = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  return JSON.parse(source) as WorkerConfig;
};

const staging = readConfig('wrangler.subscription-staging.jsonc');
const production = readConfig('wrangler.subscription-production.jsonc');

const requiredSubscriptionSecrets = [
  'AI_GRANT_SIGNING_KEY',
  'GEMINI_API_KEY',
  'QUOTA_IDENTITY_SALT',
  'RATE_LIMIT_SALT',
  'REVENUECAT_SECRET_API_KEY',
  'REVENUECAT_WEBHOOK_AUTH',
  'USDA_API_KEY',
];

test('production subscriptions use an isolated Worker and state namespace', () => {
  assert.equal(production.name, 'eatlog-food-subscription-production');
  assert.equal(production.main, 'src/worker.ts');
  assert.equal(production.compatibility_date, '2026-08-24');
  assert.deepEqual(production.compatibility_flags, ['nodejs_compat']);
  assert.equal(production.workers_dev, true);
  assert.deepEqual(Object.keys(production.vars ?? {}).sort(), [
    'GEMINI_PRICING',
    'REVENUECAT_ENTITLEMENT_ID',
    'SUBSCRIPTIONS_ENABLED',
  ]);
  assert.equal(production.vars?.SUBSCRIPTIONS_ENABLED, 'true');
  assert.equal(production.vars?.REVENUECAT_ENTITLEMENT_ID, 'eatlog_paid');
  // Priced per model, so an unpriced model reports unknown cost rather than free.
  const pricing = JSON.parse(production.vars?.GEMINI_PRICING ?? '{}') as Record<string, unknown>;
  assert.equal(typeof pricing.dated, 'string');
  for (const model of ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']) {
    assert.deepEqual(Object.keys(pricing[model] as object).sort(), ['cached', 'input', 'output']);
  }
  assert.deepEqual(production.durable_objects?.bindings, [
    { name: 'ACCESS_STATE', class_name: 'EntitlementQuotaState' },
    { name: 'GEMINI_RELAY', class_name: 'GeminiRelay' },
  ]);
  assert.deepEqual(production.migrations, [
    { tag: 'subscription-production-state-v1', new_sqlite_classes: ['EntitlementQuotaState'] },
    { tag: 'subscription-production-gemini-relay-v1', new_sqlite_classes: ['GeminiRelay'] },
  ]);
  assert.equal(production.limits, undefined);

  assert.notEqual(production.name, staging.name);
  assert.equal(staging.name, 'eatlog-food-subscription-staging');
  assert.equal(staging.main, 'src/worker.ts');
});

test('production subscriptions declare the complete secret and observability contracts', () => {
  assert.deepEqual([...(production.secrets?.required ?? [])].sort(), requiredSubscriptionSecrets);
  assert.deepEqual(production.observability, staging.observability);
});

test('production rate limit bindings preserve limits with unique namespaces', () => {
  const expected = [
    ['USDA_INSTALL_LIMITER', '61001', 30],
    ['USDA_IP_LIMITER', '61002', 300],
    ['USDA_EMERGENCY_LIMITER', '61003', 1000],
    ['GEMINI_INSTALL_LIMITER', '62001', 5],
    ['GEMINI_IP_LIMITER', '62002', 30],
    ['GEMINI_EMERGENCY_LIMITER', '62003', 100],
  ];
  assert.deepEqual(
    production.ratelimits?.map(({ name, namespace_id, simple }) => [
      name,
      namespace_id,
      simple.limit,
      simple.period,
    ]),
    expected.map(([name, namespaceId, limit]) => [name, namespaceId, limit, 60]),
  );

  const existingNamespaceIds = new Set(
    (staging.ratelimits ?? []).map(({ namespace_id }) => namespace_id),
  );
  for (const { namespace_id } of production.ratelimits ?? []) {
    assert.equal(existingNamespaceIds.has(namespace_id), false);
  }
});
