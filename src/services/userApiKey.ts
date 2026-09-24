import type { PaidAccessDecision } from './billing.types';

/**
 * The user's own Google AI Studio key, and the Manok consent that was given when it was saved.
 *
 * The key lives only in the platform credential store (Keystore-backed on Android, Keychain on
 * iOS). The consent record beside it is an ordinary app file holding no secret: which route the
 * user chose and whether Itik was already active when they chose it. The two are deliberately
 * kept in different places, because they outlive an uninstall differently. iOS can keep a
 * Keychain item across a reinstall; the app file never survives one. A key found without its
 * consent record therefore belongs to an earlier install and is erased, not used.
 */

/** Who funds an estimate: Eatlog AI through the hosted service, or My key straight to Google. */
export type AiRoute = 'eatlog-ai' | 'my-key';

const MANOK_CONSENT_VERSION = 1;
const MANOK_RECORD_FILE_NAME = 'manok-key-v1.json';
const SECURE_KEY_NAME = 'eatlog.googleAiStudioKey';

interface ManokKeyRecord {
  version: typeof MANOK_CONSENT_VERSION;
  consent: 'accepted';
  route: AiRoute;
  /** Whether Itik was active the last time it was checked, so gaining it can be told apart. */
  itikSeen: boolean;
}

export interface SecureKeyStorage {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

export interface KeyRecordStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

export interface UserKeyState {
  loaded: boolean;
  /** A key and its Manok consent are saved. */
  hasKey: boolean;
  /** `AIza…1234`, or null when the key is saved but could not be read back. */
  keyHint: string | null;
  /** The saved choice. Only meaningful with a key; without one every request is Eatlog AI. */
  route: AiRoute;
  itikSeen: boolean;
}

const EMPTY_STATE: UserKeyState = { loaded: true, hasKey: false, keyHint: null, route: 'eatlog-ai', itikSeen: false };

/**
 * Only the shape of an AI Studio key: one unbroken run of URL-safe characters. It turns away a
 * pasted page link, a sentence, or half a key before anything is sent, without guessing at a
 * prefix Google could change.
 */
const KEY_SHAPE = /^[A-Za-z0-9._-]{30,200}$/;

export function normalizeApiKeyInput(value: string): string | null {
  const trimmed = value.trim();
  return KEY_SHAPE.test(trimmed) ? trimmed : null;
}

/** The only form in which a saved key is ever shown: never revealed, never copyable. */
export function apiKeyHint(key: string): string {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function parseRecord(value: string | null): ManokKeyRecord | null {
  if (value === null) return null;
  try {
    const record = JSON.parse(value) as Partial<ManokKeyRecord>;
    if (record.version !== MANOK_CONSENT_VERSION || record.consent !== 'accepted') return null;
    return {
      version: MANOK_CONSENT_VERSION,
      consent: 'accepted',
      route: record.route === 'my-key' ? 'my-key' : 'eatlog-ai',
      itikSeen: record.itikSeen === true,
    };
  } catch {
    return null;
  }
}

/**
 * Where an AI attempt should go, decided before anything is sent.
 *
 * - `my-key`: the saved key is the chosen route. Entitlement is not consulted, so Manok never
 *   waits on RevenueCat.
 * - `eatlog-ai`: the hosted route. A plan that could not be verified also lands here; the
 *   service is the one to decide, and a paying user is never turned away by a failed check.
 * - `itik-ended`: the user chose Eatlog AI, still has a key, and Itik is gone. Moving them to
 *   their own key takes a tap of theirs, never a silent switch.
 * - `setup`: no key and no Itik. Nothing is sent; AI setup is offered instead.
 */
export type AiGate = 'my-key' | 'eatlog-ai' | 'itik-ended' | 'setup';

export function decideAiGate(state: Pick<UserKeyState, 'hasKey' | 'route'>, paid: PaidAccessDecision): AiGate {
  if (state.hasKey && state.route === 'my-key') return 'my-key';
  if (paid !== 'free') return 'eatlog-ai';
  return state.hasKey ? 'itik-ended' : 'setup';
}

export function createUserApiKeyStore(secure: SecureKeyStorage, records: KeyRecordStorage) {
  let state: UserKeyState = { ...EMPTY_STATE, loaded: false };
  let loadPromise: Promise<UserKeyState> | null = null;
  const listeners = new Set<(next: UserKeyState) => void>();

  function publish(next: UserKeyState): void {
    state = next;
    for (const listener of listeners) listener(state);
  }

  function recordOf(current: UserKeyState): ManokKeyRecord {
    return { version: MANOK_CONSENT_VERSION, consent: 'accepted', route: current.route, itikSeen: current.itikSeen };
  }

  async function load(): Promise<UserKeyState> {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      let record: ManokKeyRecord | null;
      try {
        record = parseRecord(await records.read());
      } catch {
        // Not knowing is not the same as no consent: erasing a key over a failed read would
        // destroy something the user saved. Report no key for now and read again next time.
        loadPromise = null;
        publish(EMPTY_STATE);
        return state;
      }
      if (!record) {
        // No consent on this install. A Keychain item left by an earlier install does not count,
        // and is erased quietly rather than surfaced to someone who never saved it here.
        await secure.remove().catch(() => undefined);
        publish(EMPTY_STATE);
        return state;
      }
      let key: string | null;
      try {
        key = await secure.get();
      } catch {
        // Consent exists but the credential store would not answer. The key is still the user's
        // choice; estimates report it as unusable and offer Replace key.
        publish({ loaded: true, hasKey: true, keyHint: null, route: record.route, itikSeen: record.itikSeen });
        return state;
      }
      if (!key) {
        // Consent without a key, as after an Android restore that never carries the credential.
        await records.remove().catch(() => undefined);
        publish(EMPTY_STATE);
        return state;
      }
      publish({ loaded: true, hasKey: true, keyHint: apiKeyHint(key), route: record.route, itikSeen: record.itikSeen });
      return state;
    })();
    return loadPromise;
  }

  async function getKey(): Promise<string | null> {
    await load();
    if (!state.hasKey) return null;
    return secure.get();
  }

  /**
   * Saving is the Manok consent. The credential is written first and the record second; if the
   * record cannot be written, the key is taken back out so it never sits there unconsented.
   * Saving while Itik keeps Eatlog AI as the route: switching to the key is the user's call.
   */
  async function save(key: string, itik: boolean): Promise<void> {
    await load();
    await secure.set(key);
    const next: UserKeyState = { loaded: true, hasKey: true, keyHint: apiKeyHint(key), route: itik ? 'eatlog-ai' : 'my-key', itikSeen: itik };
    try {
      await records.write(JSON.stringify(recordOf(next)));
    } catch (error) {
      await secure.remove().catch(() => undefined);
      throw error;
    }
    publish(next);
  }

  /** Consent already exists, so only the credential changes, and the route stays as it was. */
  async function replace(key: string): Promise<void> {
    await load();
    if (!state.hasKey) throw new Error('No saved key to replace.');
    await secure.set(key);
    publish({ ...state, keyHint: apiKeyHint(key) });
  }

  /**
   * Erasing the credential is the removal. If the store refuses, this throws and the key and
   * its consent stay saved and in use: the app never claims a removal that did not happen.
   */
  async function remove(): Promise<void> {
    await load();
    await secure.remove();
    // The key is gone. A record left behind by a failed delete is consent without a key, which
    // the next launch clears.
    await records.remove().catch(() => undefined);
    publish(EMPTY_STATE);
  }

  async function setRoute(route: AiRoute): Promise<void> {
    await load();
    if (!state.hasKey || state.route === route) return;
    const next = { ...state, route };
    await records.write(JSON.stringify(recordOf(next)));
    publish(next);
  }

  /**
   * Gaining Itik moves a saved key's route to Eatlog AI; the key stays for the user to pick
   * again. Losing Itik changes nothing about the route — the next attempt asks instead.
   */
  async function observeItik(itik: boolean): Promise<void> {
    await load();
    if (!state.hasKey || state.itikSeen === itik) return;
    const next: UserKeyState = itik ? { ...state, route: 'eatlog-ai', itikSeen: true } : { ...state, itikSeen: false };
    publish(next);
    // A lost write repeats the same switch at the next launch, which lands in the same place.
    await records.write(JSON.stringify(recordOf(next))).catch(() => undefined);
  }

  return {
    load,
    getKey,
    save,
    replace,
    remove,
    setRoute,
    observeItik,
    getState: (): UserKeyState => state,
    /** The route a request starting now uses. Read synchronously by the estimate client. */
    currentRoute: (): AiRoute => (state.hasKey && state.route === 'my-key' ? 'my-key' : 'eatlog-ai'),
    subscribe(listener: (next: UserKeyState) => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/**
 * The native modules load on first use, so an install whose binary predates the credential store
 * reports it as unavailable instead of failing to start.
 */
function deviceSecureStorage(): SecureKeyStorage {
  const module = () => import('expo-secure-store');
  return {
    get: async () => (await module()).getItemAsync(SECURE_KEY_NAME),
    set: async (value) => {
      const SecureStore = await module();
      await SecureStore.setItemAsync(SECURE_KEY_NAME, value, {
        // Never migrates to another device through an encrypted iPhone backup.
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    },
    remove: async () => (await module()).deleteItemAsync(SECURE_KEY_NAME),
  };
}

function deviceRecordStorage(): KeyRecordStorage {
  const file = async () => {
    const { File, Paths } = await import('expo-file-system');
    return new File(Paths.document, MANOK_RECORD_FILE_NAME);
  };
  return {
    read: async () => { const record = await file(); return record.exists ? record.text() : null; },
    write: async (value) => { (await file()).write(value); },
    remove: async () => { const record = await file(); if (record.exists) record.delete(); },
  };
}

export const userApiKeyStore = createUserApiKeyStore(deviceSecureStorage(), deviceRecordStorage());

export type Tier = 'itik' | 'manok' | 'pugo';

/** Tier is never stored: Itik from the entitlement, Manok from a saved key, Pugo otherwise. */
export function tierOf(itik: boolean, hasKey: boolean): Tier {
  if (itik) return 'itik';
  return hasKey ? 'manok' : 'pugo';
}
