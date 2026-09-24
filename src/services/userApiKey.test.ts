import assert from 'node:assert/strict';
import test from 'node:test';

import {
  apiKeyHint,
  createUserApiKeyStore,
  decideAiGate,
  normalizeApiKeyInput,
  type KeyRecordStorage,
  type SecureKeyStorage,
} from './userApiKey';

const KEY = 'AIzaSyD-synthetic-key-000000000000001234';
const NEW_KEY = 'AIzaSyD-synthetic-key-000000000000005678';

function memorySecure(initial: string | null = null) {
  let value = initial;
  const faults = { get: false, set: false, remove: false };
  const storage: SecureKeyStorage = {
    async get() { if (faults.get) throw new Error('keystore'); return value; },
    async set(next) { if (faults.set) throw new Error('keystore'); value = next; },
    async remove() { if (faults.remove) throw new Error('keystore'); value = null; },
  };
  return { storage, faults, peek: () => value };
}

function memoryRecords(initial: string | null = null) {
  let value = initial;
  const faults = { read: false, write: false, remove: false };
  const storage: KeyRecordStorage = {
    async read() { if (faults.read) throw new Error('fs'); return value; },
    async write(next) { if (faults.write) throw new Error('fs'); value = next; },
    async remove() { if (faults.remove) throw new Error('fs'); value = null; },
  };
  return { storage, faults, peek: () => (value === null ? null : JSON.parse(value)) };
}

const record = (route: 'eatlog-ai' | 'my-key', itikSeen = false) =>
  JSON.stringify({ version: 1, consent: 'accepted', route, itikSeen });

test('key shape check turns away links and fragments before any network call', () => {
  assert.equal(normalizeApiKeyInput(`  ${KEY}\n`), KEY);
  assert.equal(normalizeApiKeyInput('https://aistudio.google.com/app/apikey'), null);
  assert.equal(normalizeApiKeyInput('AIzaSy D-synthetic-key-000000000000001234'), null);
  assert.equal(normalizeApiKeyInput('AIzaShort'), null);
  assert.equal(normalizeApiKeyInput(''), null);
});

test('a saved key is only ever shown as its first four and last four characters', () => {
  assert.equal(apiKeyHint(KEY), 'AIza…1234');
});

test('a fresh install erases a leftover Keychain key that has no consent record', async () => {
  const secure = memorySecure(KEY);
  const store = createUserApiKeyStore(secure.storage, memoryRecords().storage);
  const state = await store.load();
  assert.equal(state.hasKey, false);
  assert.equal(secure.peek(), null);
  assert.equal(store.currentRoute(), 'eatlog-ai');
});

test('consent without a key, as after an OS restore, is cleared and counts as no key', async () => {
  const records = memoryRecords(record('my-key'));
  const store = createUserApiKeyStore(memorySecure().storage, records.storage);
  assert.equal((await store.load()).hasKey, false);
  assert.equal(records.peek(), null);
});

test('a failed record read never erases the key and is retried', async () => {
  const secure = memorySecure(KEY);
  const records = memoryRecords(record('my-key'));
  records.faults.read = true;
  const store = createUserApiKeyStore(secure.storage, records.storage);
  assert.equal((await store.load()).hasKey, false);
  assert.equal(secure.peek(), KEY);
  records.faults.read = false;
  const state = await store.load();
  assert.equal(state.hasKey, true);
  assert.equal(store.currentRoute(), 'my-key');
});

test('an unreadable credential store keeps the saved choice and surfaces on use', async () => {
  const secure = memorySecure(KEY);
  secure.faults.get = true;
  const store = createUserApiKeyStore(secure.storage, memoryRecords(record('my-key')).storage);
  const state = await store.load();
  assert.equal(state.hasKey, true);
  assert.equal(state.keyHint, null);
  assert.equal(store.currentRoute(), 'my-key');
  await assert.rejects(store.getKey());
});

test('saving a key selects My key with or without Omelette', async () => {
  const pugo = createUserApiKeyStore(memorySecure().storage, memoryRecords().storage);
  await pugo.save(KEY, false);
  assert.equal(pugo.currentRoute(), 'my-key');
  assert.equal(await pugo.getKey(), KEY);

  const secure = memorySecure();
  const records = memoryRecords();
  const itik = createUserApiKeyStore(secure.storage, records.storage);
  await itik.save(KEY, true);
  assert.equal(itik.getState().hasKey, true);
  assert.equal(itik.currentRoute(), 'my-key');
  assert.equal((await createUserApiKeyStore(secure.storage, records.storage).load()).route, 'my-key');
});

test('a key saved after the first load is seen by the next load, as when onboarding saves one', async () => {
  const store = createUserApiKeyStore(memorySecure().storage, memoryRecords().storage);
  assert.equal((await store.load()).hasKey, false);
  await store.save(KEY, false);
  const state = await store.load();
  assert.equal(state.hasKey, true);
  assert.equal(state.route, 'my-key');
  await store.remove();
  assert.equal((await store.load()).hasKey, false);
});

test('a key whose consent cannot be recorded is taken back out', async () => {
  const secure = memorySecure();
  const records = memoryRecords();
  records.faults.write = true;
  const store = createUserApiKeyStore(secure.storage, records.storage);
  await assert.rejects(store.save(KEY, false));
  assert.equal(secure.peek(), null);
  assert.equal(store.getState().hasKey, false);
});

test('replace changes only the credential and keeps the route', async () => {
  const secure = memorySecure(KEY);
  const store = createUserApiKeyStore(secure.storage, memoryRecords(record('my-key')).storage);
  await store.replace(NEW_KEY);
  assert.equal(secure.peek(), NEW_KEY);
  assert.equal(store.getState().keyHint, 'AIza…5678');
  assert.equal(store.currentRoute(), 'my-key');
});

test('a refused erase keeps the key and its consent saved and in use', async () => {
  const secure = memorySecure(KEY);
  const records = memoryRecords(record('my-key'));
  secure.faults.remove = true;
  const store = createUserApiKeyStore(secure.storage, records.storage);
  await store.load();
  await assert.rejects(store.remove());
  assert.equal(secure.peek(), KEY);
  assert.notEqual(records.peek(), null);
  assert.equal(store.currentRoute(), 'my-key');
  secure.faults.remove = false;
  await store.remove();
  assert.equal(secure.peek(), null);
  assert.equal(records.peek(), null);
  assert.equal(store.getState().hasKey, false);
  assert.equal(store.currentRoute(), 'eatlog-ai');
});

test('Omelette access changes preserve the selected AI route across restarts', async () => {
  const records = memoryRecords(record('my-key'));
  const secure = memorySecure(KEY);
  const store = createUserApiKeyStore(secure.storage, records.storage);
  await store.observeItik(true);
  assert.equal(store.currentRoute(), 'my-key');
  assert.deepEqual(records.peek(), { version: 1, consent: 'accepted', route: 'my-key', itikSeen: true });

  await store.setRoute('eatlog-ai');
  await store.observeItik(true);
  assert.equal(store.currentRoute(), 'eatlog-ai');

  await store.observeItik(false);
  assert.equal(store.currentRoute(), 'eatlog-ai');

  await store.observeItik(true);
  assert.equal(store.currentRoute(), 'eatlog-ai');
  assert.equal((await createUserApiKeyStore(secure.storage, records.storage).load()).route, 'eatlog-ai');
});

test('without a key, entitlement changes and route choices store nothing', async () => {
  const records = memoryRecords();
  const store = createUserApiKeyStore(memorySecure().storage, records.storage);
  await store.observeItik(true);
  await store.setRoute('my-key');
  assert.equal(records.peek(), null);
  assert.equal(store.currentRoute(), 'eatlog-ai');
});

test('the gate follows the decided transitions and never switches funding on its own', () => {
  // Manok: the key, without asking RevenueCat.
  assert.equal(decideAiGate({ hasKey: true, route: 'my-key' }, 'free'), 'my-key');
  assert.equal(decideAiGate({ hasKey: true, route: 'my-key' }, 'unavailable'), 'my-key');
  // Itik on Eatlog AI, with or without a key.
  assert.equal(decideAiGate({ hasKey: true, route: 'eatlog-ai' }, 'paid'), 'eatlog-ai');
  assert.equal(decideAiGate({ hasKey: false, route: 'eatlog-ai' }, 'paid'), 'eatlog-ai');
  // A plan that could not be checked is never a denial.
  assert.equal(decideAiGate({ hasKey: false, route: 'eatlog-ai' }, 'unavailable'), 'eatlog-ai');
  // Itik ended while on Eatlog AI with a key: ask, do not switch.
  assert.equal(decideAiGate({ hasKey: true, route: 'eatlog-ai' }, 'free'), 'itik-ended');
  // Pugo: setup, nothing sent.
  assert.equal(decideAiGate({ hasKey: false, route: 'eatlog-ai' }, 'free'), 'setup');
});

test('tier is derived from the entitlement and the saved key', async () => {
  const { tierOf } = await import('./userApiKey');
  assert.equal(tierOf(true, true), 'itik');
  assert.equal(tierOf(true, false), 'itik');
  assert.equal(tierOf(false, true), 'manok');
  assert.equal(tierOf(false, false), 'pugo');
});
