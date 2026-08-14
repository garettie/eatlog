import assert from 'node:assert/strict';
import test from 'node:test';

import { createRemoteEstimateConsentCoordinator } from './remoteEstimateConsentCoordinator';
import type { RemoteEstimateConsentDecision } from './remoteEstimateConsent';

function coordinator(initial: RemoteEstimateConsentDecision | null = null, options: { failAccept?: boolean } = {}) {
  let stored = initial;
  let presentCount = 0;
  let closeCount = 0;
  let acceptCount = 0;
  let declineCount = 0;
  let acceptErrors = 0;
  const decisions: Array<RemoteEstimateConsentDecision | null> = [];
  const instance = createRemoteEstimateConsentCoordinator({
    getDecision: async () => stored,
    accept: async () => {
      acceptCount += 1;
      if (options.failAccept) throw new Error('write failed');
      stored = 'accepted';
    },
    decline: async () => {
      declineCount += 1;
      stored = 'declined';
    },
    onDecision: (decision) => decisions.push(decision),
    onPresent: () => { presentCount += 1; },
    onClose: () => { closeCount += 1; },
    onAcceptError: () => { acceptErrors += 1; },
  });
  return {
    instance,
    counts: () => ({ presentCount, closeCount, acceptCount, declineCount, acceptErrors }),
    decisions,
    stored: () => stored,
  };
}

test('accepted state resolves without presenting', async () => {
  const state = coordinator('accepted');
  assert.equal(await state.instance.requestConsent(), true);
  assert.equal(await state.instance.requestConsent(), true);
  await state.instance.refresh();
  assert.equal(await state.instance.requestConsent(), true);
  assert.deepEqual(state.counts(), {
    presentCount: 0,
    closeCount: 0,
    acceptCount: 0,
    declineCount: 0,
    acceptErrors: 0,
  });
});

test('two simultaneous requests share one pending decision', async () => {
  const state = coordinator('declined');
  const first = state.instance.requestConsent();
  const second = state.instance.requestConsent();
  assert.equal(first, second);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(state.counts().presentCount, 1);

  await state.instance.decline();
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(state.counts().closeCount, 1);
});

test('acceptance resolves all waiting callers exactly once', async () => {
  const state = coordinator('declined');
  const first = state.instance.requestConsent();
  const second = state.instance.requestConsent();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(await state.instance.accept(), true);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(state.counts(), {
    presentCount: 1,
    closeCount: 1,
    acceptCount: 1,
    declineCount: 0,
    acceptErrors: 0,
  });
  assert.equal(await state.instance.requestConsent(), true);
});

test('decline resolves false and closes without accepting', async () => {
  const state = coordinator(null);
  const request = state.instance.requestConsent();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await state.instance.decline();
  assert.equal(await request, false);
  assert.equal(state.counts().acceptCount, 0);
  assert.equal(state.stored(), 'declined');
});

test('dismissal resolves false', async () => {
  const state = coordinator('declined');
  const request = state.instance.requestConsent();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await state.instance.dismiss();
  assert.equal(await request, false);
  assert.equal(state.counts().declineCount, 1);
});

test('acceptance persistence failure never resolves a caller as true', async () => {
  const state = coordinator('declined', { failAccept: true });
  const request = state.instance.requestConsent();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(await state.instance.accept(), false);
  assert.equal(state.counts().acceptErrors, 1);
  assert.equal(state.instance.isPresented(), true);
  await state.instance.dismiss();
  assert.equal(await request, false);
});

test('a stored decline can present again after a later feature tap', async () => {
  const state = coordinator('declined');
  const first = state.instance.requestConsent();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await state.instance.decline();
  assert.equal(await first, false);

  const second = state.instance.requestConsent();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(state.counts().presentCount, 2);
  await state.instance.decline();
  assert.equal(await second, false);
});

test('refreshing a stored decline does not present anything at startup', async () => {
  const state = coordinator('declined');
  await state.instance.refresh();
  assert.equal(state.counts().presentCount, 0);
  assert.deepEqual(state.decisions, ['declined']);
});
