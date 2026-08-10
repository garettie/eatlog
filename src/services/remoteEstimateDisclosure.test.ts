import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REMOTE_ESTIMATE_DISCLOSURE_VERSION,
  createRemoteEstimateDisclosure,
  requestRemoteEstimateDisclosure,
  type RemoteEstimateDisclosureStorage,
} from './remoteEstimateDisclosure';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  let writes = 0;
  const storage: RemoteEstimateDisclosureStorage = {
    read: async () => value,
    write: async (next) => { value = next; writes += 1; },
    remove: async () => { value = null; },
  };
  return { storage, value: () => value, writes: () => writes };
}

test('affirmative disclosure persists its material version and is reused', async () => {
  const memory = memoryStorage();
  const disclosure = createRemoteEstimateDisclosure(memory.storage);
  let confirmations = 0;

  assert.equal(await requestRemoteEstimateDisclosure(disclosure, async () => {
    confirmations += 1;
    return true;
  }), true);
  assert.deepEqual(JSON.parse(memory.value()!), {
    version: REMOTE_ESTIMATE_DISCLOSURE_VERSION,
    accepted: true,
  });
  assert.equal(memory.writes(), 1);

  assert.equal(await requestRemoteEstimateDisclosure(disclosure, async () => {
    confirmations += 1;
    return true;
  }), true);
  assert.equal(confirmations, 1);
  assert.equal(memory.writes(), 1);
});

test('declining disclosure performs no persistence and can be asked again', async () => {
  const memory = memoryStorage();
  const disclosure = createRemoteEstimateDisclosure(memory.storage);
  assert.equal(await requestRemoteEstimateDisclosure(disclosure, async () => false), false);
  assert.equal(memory.value(), null);
  assert.equal(memory.writes(), 0);
  assert.equal(await disclosure.isAccepted(), false);
});

test('declining the gate performs no transmission and keeps selected content unchanged', async () => {
  const selected = { text: 'rice bowl', imageBase64: 'synthetic-image' };
  const memory = memoryStorage();
  const disclosure = createRemoteEstimateDisclosure(memory.storage);
  let transmissions = 0;

  if (await requestRemoteEstimateDisclosure(disclosure, async () => false)) {
    transmissions += 1;
  }

  assert.equal(transmissions, 0);
  assert.deepEqual(selected, { text: 'rice bowl', imageBase64: 'synthetic-image' });
  assert.equal(memory.value(), null);
});

test('corrupt or materially older disclosure state is not accepted', async () => {
  for (const stored of [
    '{broken',
    JSON.stringify({ version: REMOTE_ESTIMATE_DISCLOSURE_VERSION - 1, accepted: true }),
    JSON.stringify({ version: REMOTE_ESTIMATE_DISCLOSURE_VERSION, accepted: false }),
  ]) {
    const disclosure = createRemoteEstimateDisclosure(memoryStorage(stored).storage);
    assert.equal(await disclosure.isAccepted(), false);
  }
});

test('storage failures prevent transmission instead of silently accepting', async () => {
  const disclosure = createRemoteEstimateDisclosure({
    read: async () => { throw new Error('read failed'); },
    write: async () => { throw new Error('write failed'); },
    remove: async () => {},
  });
  await assert.rejects(() => requestRemoteEstimateDisclosure(disclosure, async () => true), /read failed/);

  const writeFailure = createRemoteEstimateDisclosure({
    read: async () => null,
    write: async () => { throw new Error('write failed'); },
    remove: async () => {},
  });
  await assert.rejects(() => requestRemoteEstimateDisclosure(writeFailure, async () => true), /write failed/);
});
