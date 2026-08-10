import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInstallationIdentity,
  INSTALLATION_TOKEN_BYTE_LENGTH,
  InstallationIdentityUnavailableError,
  isInstallationToken,
} from './installIdentity';

function bytes(seed: number): Uint8Array {
  return Uint8Array.from({ length: INSTALLATION_TOKEN_BYTE_LENGTH }, (_, index) => (seed + index) % 256);
}

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    storage: {
      read: async () => value,
      write: async (next: string) => { value = next; },
    },
    value: () => value,
  };
}

test('creates and persists a secure-token-shaped installation identity', async () => {
  const memory = memoryStorage();
  const identity = createInstallationIdentity({
    storage: memory.storage,
    randomBytes: async (byteCount) => {
      assert.equal(byteCount, 16);
      return bytes(0);
    },
  });

  const token = await identity.getToken();
  assert.equal(token, '000102030405060708090a0b0c0d0e0f');
  assert.equal(memory.value(), token);
  assert.equal(isInstallationToken(token), true);
});

test('concurrent first access shares one read, generation, and write', async () => {
  let reads = 0;
  let generations = 0;
  let writes = 0;
  let stored: string | null = null;
  const identity = createInstallationIdentity({
    storage: {
      read: async () => { reads += 1; await Promise.resolve(); return stored; },
      write: async (value) => { writes += 1; stored = value; },
    },
    randomBytes: async () => { generations += 1; return bytes(16); },
  });

  const first = identity.getToken();
  const second = identity.getToken();
  assert.equal(first, second);
  const [firstToken, secondToken] = await Promise.all([first, second]);
  assert.equal(firstToken, secondToken);
  assert.deepEqual({ reads, generations, writes }, { reads: 1, generations: 1, writes: 1 });
});

test('a new service instance reuses the persisted identity', async () => {
  const token = '0123456789abcdef0123456789abcdef';
  const memory = memoryStorage(token);
  const identity = createInstallationIdentity({
    storage: memory.storage,
    randomBytes: async () => { throw new Error('must not generate'); },
  });

  assert.equal(await identity.getToken(), token);
  assert.equal(await identity.getToken(), token);
});

test('missing or corrupt persisted values are regenerated', async () => {
  for (const initial of [null, '', 'ABCDEF', 'not-a-token', 'a'.repeat(31), 'a'.repeat(33)]) {
    const memory = memoryStorage(initial);
    const identity = createInstallationIdentity({
      storage: memory.storage,
      randomBytes: async () => bytes(32),
    });
    const token = await identity.getToken();
    assert.equal(token, '202122232425262728292a2b2c2d2e2f');
    assert.equal(memory.value(), token);
  }
});

test('storage failure is sanitized and a later call can retry', async () => {
  const rawToken = 'f'.repeat(32);
  let shouldFail = true;
  let stored: string | null = null;
  const identity = createInstallationIdentity({
    storage: {
      read: async () => stored,
      write: async (value) => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error(`could not persist ${rawToken}`);
        }
        stored = value;
      },
    },
    randomBytes: async () => bytes(48),
  });

  await assert.rejects(identity.getToken(), (error: unknown) => {
    assert.equal(error instanceof InstallationIdentityUnavailableError, true);
    assert.equal(String(error).includes(rawToken), false);
    return true;
  });
  assert.equal(await identity.getToken(), '303132333435363738393a3b3c3d3e3f');
});

test('invalid random output fails without logging or exposing generated data', async () => {
  const originalError = console.error;
  const originalWarn = console.warn;
  const logs: unknown[] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  console.warn = (...args: unknown[]) => { logs.push(args); };
  try {
    const identity = createInstallationIdentity({
      storage: memoryStorage().storage,
      randomBytes: async () => Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
    });
    await assert.rejects(identity.getToken(), /Installation identity is unavailable/);
    assert.deepEqual(logs, []);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});
