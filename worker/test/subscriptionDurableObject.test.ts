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
    await store.refund(who, 'never-reserved');

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
    await store.refund(finished, 'completed');
    const afterRefund = await store.usage(finished, 'manok', NOW);
    assert.equal(afterRefund.kind === 'paid' && afterRefund.remaining24Hours, 29);

    const refunded = subject('stale-finalize');
    await store.reserve(refunded, 'manok', 'describe', 'failed', NOW);
    await store.refund(refunded, 'failed');
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
      await store.refund(who, `failed-${index}`);
    }

    const blocked = await store.reserve(who, 'manok', 'describe', 'failed-5', NOW + 5);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.code, 'REFUND_DAILY_LIMIT');
    // None of it touched the visible allowance.
    const usage = await store.usage(who, 'manok', NOW + 5);
    assert.equal(usage.kind === 'paid' && usage.remaining24Hours, 30);
  });

  // Confirmed divergence (service review, finding 2). The memory store appends an event per
  // attempt and blocks the sixth; the Durable Object's quota_events primary key is
  // (subject, request_id), so `INSERT OR REPLACE` overwrites the row and the same failed ID
  // can be retried without limit. The memory expectation below is the one the rest of the
  // suite has always asserted, so only the deployed store is marked as outstanding work.
  const repeatedFailureOptions = label === 'durable object'
    ? { todo: 'Task 4 — separate provider recovery from abuse limits' }
    : {};
  test(`${label}: retrying one failed request ID counts each attempt toward the refund ceiling`, repeatedFailureOptions, async () => {
    const store = make();
    const who = subject('repeated-failure');

    for (let index = 0; index < 5; index += 1) {
      const decision = await store.reserve(who, 'manok', 'describe', 'one-failing-id', NOW + index);
      assert.equal(decision.allowed, true);
      await store.refund(who, 'one-failing-id');
    }

    const sixth = await store.reserve(who, 'manok', 'describe', 'one-failing-id', NOW + 5);
    assert.equal(sixth.allowed, false);
    assert.equal(sixth.code, 'REFUND_DAILY_LIMIT');
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
