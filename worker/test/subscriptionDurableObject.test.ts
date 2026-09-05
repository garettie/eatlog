import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { MemorySubscriptionStore, type SubscriptionStore } from '../src/subscriptions.js';
import { startQuotaRuntime, type QuotaRuntime } from './support/durableObjectHarness.js';

/**
 * Milestone 1 of the food-estimation plan: exercise the deployed quota implementation, not the
 * memory substitute the rest of the suite uses. Every case here runs against both stores,
 * because the two disagreeing is itself a finding — the tests that pass everywhere describe
 * behaviour the service actually relies on, and the one marked `todo` records a confirmed
 * divergence that task 4 has to resolve.
 */

const NOW = 1_700_000_000_000;

let runtime: QuotaRuntime;

before(async () => { runtime = await startQuotaRuntime(); });
after(async () => { await runtime?.dispose(); });

function stores(): Array<[string, () => SubscriptionStore]> {
  return [
    ['durable object', () => runtime.store],
    ['memory store', () => new MemorySubscriptionStore()],
  ];
}

/** Distinct per case so one store's rows can never be read by another case in the same object. */
let subjects = 0;
function subject(label: string): string {
  subjects += 1;
  return `subject-${label}-${subjects}`;
}

for (const [label, make] of stores()) {
  test(`${label}: concurrent requests sharing one ID reserve one charge and report the rest as duplicates`, async () => {
    const store = make();
    const who = subject('concurrent');

    const decisions = await Promise.all(Array.from({ length: 10 }, () => (
      store.reserve(who, 'manok', 'describe', 'one-logical-action', NOW)
    )));

    assert.equal(decisions.every((decision) => decision.allowed), true);
    assert.equal(decisions.filter((decision) => decision.duplicate).length, 9);
    const usage = await store.usage(who, 'manok', NOW);
    assert.equal(usage.kind === 'paid' && usage.remaining24Hours, 29);
  });

  test(`${label}: finalizing or refunding an unknown request never invents a charge`, async () => {
    const store = make();
    const who = subject('bookkeeping');

    await store.finalize(who, 'never-reserved');
    await store.refund(who, 'never-reserved', 'unrecognized');

    const usage = await store.usage(who, 'manok', NOW);
    assert.equal(usage.kind === 'paid' && usage.remaining24Hours, 30);
  });

  test(`${label}: a refund arriving after a finalize cannot undo the completed charge`, async () => {
    const store = make();
    const finished = subject('stale-refund');
    await store.reserve(finished, 'manok', 'describe', 'completed', NOW);
    await store.finalize(finished, 'completed');
    // The late refund of a request that already succeeded is the stale-completion case: an
    // execution that lost its response and was retried must not hand back a charge the user
    // did get a result for.
    await store.refund(finished, 'completed', 'unrecognized');
    const afterRefund = await store.usage(finished, 'manok', NOW);
    assert.equal(afterRefund.kind === 'paid' && afterRefund.remaining24Hours, 29);

    const refunded = subject('stale-finalize');
    await store.reserve(refunded, 'manok', 'describe', 'failed', NOW);
    await store.refund(refunded, 'failed', 'unrecognized');
    // And the mirror image: a finalize that arrives after the failure was already refunded
    // must not re-charge it.
    await store.finalize(refunded, 'failed');
    const afterFinalize = await store.usage(refunded, 'manok', NOW);
    assert.equal(afterFinalize.kind === 'paid' && afterFinalize.remaining24Hours, 30);
  });

  test(`${label}: five distinct failed requests reach the refund ceiling`, async () => {
    const store = make();
    const who = subject('distinct-failures');

    for (let index = 0; index < 5; index += 1) {
      const decision = await store.reserve(who, 'manok', 'describe', `failed-${index}`, NOW + index);
      assert.equal(decision.allowed, true);
      await store.refund(who, `failed-${index}`, 'unrecognized');
    }

    const blocked = await store.reserve(who, 'manok', 'describe', 'failed-5', NOW + 5);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.code, 'REFUND_DAILY_LIMIT');
    // None of it touched the visible allowance.
    const usage = await store.usage(who, 'manok', NOW + 5);
    assert.equal(usage.kind === 'paid' && usage.remaining24Hours, 30);
  });

  test(`${label}: retrying one failed request ID is one submission, not five`, async () => {
    const store = make();
    const who = subject('repeated-failure');

    // The Durable Object keys quota_events on (subject, request_id), so a retried identifier
    // replaces its own row. The memory store used to append instead, which is why an abuse
    // ceiling could be reached in tests and never in production. Both now agree, and the rule
    // they agree on is the defensible one: resubmitting the same rejected photo is one piece
    // of unrecognizable content, however many times the request is retried.
    for (let index = 0; index < 6; index += 1) {
      const decision = await store.reserve(who, 'manok', 'describe', 'one-failing-id', NOW + index);
      assert.equal(decision.allowed, true);
      await store.refund(who, 'one-failing-id', 'unrecognized');
    }

    // Five different rejected submissions still reach the ceiling.
    for (let index = 0; index < 4; index += 1) {
      const decision = await store.reserve(who, 'manok', 'describe', `also-rejected-${index}`, NOW + 10 + index);
      assert.equal(decision.allowed, true);
      await store.refund(who, `also-rejected-${index}`, 'unrecognized');
    }
    const blocked = await store.reserve(who, 'manok', 'describe', 'one-too-many', NOW + 20);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.code, 'REFUND_DAILY_LIMIT');
  });

  test(`${label}: a provider failure is refunded without counting toward the content ceiling`, async () => {
    const store = make();
    const who = subject('outage');

    // Ten of the provider's own failures in a row.
    for (let index = 0; index < 10; index += 1) {
      const decision = await store.reserve(who, 'manok', 'describe', `outage-${index}`, NOW + index);
      assert.equal(decision.allowed, true);
      await store.refund(who, `outage-${index}`, 'service-failure');
    }

    // The provider recovers and the customer is not locked out of their own day.
    const recovered = await store.reserve(who, 'manok', 'describe', 'after-recovery', NOW + 20);
    assert.equal(recovered.allowed, true);
    const usage = await store.usage(who, 'manok', NOW + 20);
    assert.equal(usage.kind === 'paid' && usage.remaining24Hours, 29);
  });

  test(`${label}: a refund recorded before the cause was known counts toward nothing`, async () => {
    const store = make();
    const who = subject('legacy-refund');

    // `refunded` is what the old code wrote for every refund, outage and rejection alike. Those
    // rows keep their history but must not be read as abuse, or a past outage would still be
    // holding a customer out today.
    for (let index = 0; index < 6; index += 1) {
      await store.reserve(who, 'manok', 'describe', `legacy-${index}`, NOW + index);
      await store.refund(who, `legacy-${index}`, 'refunded' as never);
    }

    const allowed = await store.reserve(who, 'manok', 'describe', 'after-legacy', NOW + 20);
    assert.equal(allowed.allowed, true);
  });

  test(`${label}: reaching the content ceiling says when it lifts`, async () => {
    const store = make();
    const who = subject('reset-time');

    for (let index = 0; index < 5; index += 1) {
      await store.reserve(who, 'manok', 'describe', `rejected-${index}`, NOW + index);
      await store.refund(who, `rejected-${index}`, 'unrecognized');
    }

    const blocked = await store.reserve(who, 'manok', 'describe', 'blocked', NOW + 10);
    assert.equal(blocked.code, 'REFUND_DAILY_LIMIT');
    // Without this the app can only say "try again later" and mean nothing by it.
    assert.equal(blocked.nextEligibleAt, new Date(NOW + 24 * 60 * 60 * 1000).toISOString());
  });
}

test('durable object: a reservation and its charge survive a restart of the object', async () => {
  const who = subject('restart');
  const reserved = await runtime.store.reserve(who, 'manok', 'describe', 'survives-restart', NOW);
  assert.equal(reserved.duplicate, false);

  await runtime.restart();

  // The retry that follows a lost response must find its own reservation, not pay twice.
  const retried = await runtime.store.reserve(who, 'manok', 'describe', 'survives-restart', NOW);
  assert.equal(retried.allowed, true);
  assert.equal(retried.duplicate, true);
  const usage = await runtime.store.usage(who, 'manok', NOW);
  assert.equal(usage.kind === 'paid' && usage.remaining24Hours, 29);
});

test('durable object: the access cache and webhook ledger survive a restart', async () => {
  const customerKey = `customer-${subject('cache')}`;
  // The webhook ledger prunes against the runtime's own clock rather than the caller's `now`,
  // so this case has to use a wall-clock timestamp: a synthetic one is always older than the
  // thirty-day retention and would be discarded the moment it was written.
  const eventTime = Date.now();
  await runtime.store.putCached(customerKey, {
    access: {
      kind: 'manok',
      checkedAt: new Date(eventTime).toISOString(),
      expiresAt: new Date(eventTime + 86_400_000).toISOString(),
      willRenew: true,
      productId: 'eatlog_manok',
      billingState: 'active',
    },
    subjectIdentity: 'stable-identity',
    validUntil: eventTime + 600_000,
    provisional: false,
  });
  assert.equal(await runtime.store.recordWebhook('event-restart-1', eventTime, [customerKey]), 'accepted');

  await runtime.restart();

  // The webhook expired the cache rather than deleting it, so the row is still readable as an
  // outage fallback while a fresh read has to re-verify.
  assert.equal(await runtime.store.getCached(customerKey, eventTime, false), null);
  const stale = await runtime.store.getCached(customerKey, eventTime, true);
  assert.equal(stale?.subjectIdentity, 'stable-identity');
  // A redelivered webhook is still recognised as one already handled.
  assert.equal(await runtime.store.recordWebhook('event-restart-1', eventTime, [customerKey]), 'duplicate');
});
