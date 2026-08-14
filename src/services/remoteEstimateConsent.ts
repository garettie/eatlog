export const REMOTE_ESTIMATE_CONSENT_VERSION = 1;
const REMOTE_ESTIMATE_CONSENT_FILE_NAME = 'remote-estimate-consent-v1.json';

export type RemoteEstimateConsentDecision = 'accepted' | 'declined';

interface RemoteEstimateConsentRecord {
  version: number;
  decision: RemoteEstimateConsentDecision;
}

export interface RemoteEstimateConsentStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

function parseDecision(value: string | null): RemoteEstimateConsentDecision | null {
  if (value === null) return null;
  try {
    const record = JSON.parse(value) as Partial<RemoteEstimateConsentRecord>;
    if (record.version !== REMOTE_ESTIMATE_CONSENT_VERSION) return null;
    if (record.decision !== 'accepted' && record.decision !== 'declined') return null;
    return record.decision;
  } catch {
    return null;
  }
}

export function createRemoteEstimateConsent(storage: RemoteEstimateConsentStorage) {
  let decisionPromise: Promise<RemoteEstimateConsentDecision | null> | null = null;

  function getDecision(): Promise<RemoteEstimateConsentDecision | null> {
    if (!decisionPromise) {
      const pendingRead = storage.read()
        .then(parseDecision)
        .catch(() => {
          if (decisionPromise === pendingRead) decisionPromise = null;
          return null;
        });
      decisionPromise = pendingRead;
    }
    return decisionPromise;
  }

  async function isAccepted(): Promise<boolean> {
    return (await getDecision()) === 'accepted';
  }

  async function accept(): Promise<void> {
    try {
      await storage.write(JSON.stringify({
        version: REMOTE_ESTIMATE_CONSENT_VERSION,
        decision: 'accepted',
      } satisfies RemoteEstimateConsentRecord));
      decisionPromise = Promise.resolve('accepted');
    } catch (error) {
      // A failed acceptance must never leave an in-memory decision that can
      // authorize a request which was not persisted.
      decisionPromise = Promise.resolve('declined');
      throw error;
    }
  }

  async function decline(): Promise<void> {
    try {
      await storage.write(JSON.stringify({
        version: REMOTE_ESTIMATE_CONSENT_VERSION,
        decision: 'declined',
      } satisfies RemoteEstimateConsentRecord));
      decisionPromise = Promise.resolve('declined');
    } catch (error) {
      // Continue fail-closed even when the device cannot persist the decline.
      decisionPromise = Promise.resolve('declined');
      throw error;
    }
  }

  async function clear(): Promise<void> {
    await storage.remove();
    decisionPromise = Promise.resolve(null);
  }

  return { getDecision, isAccepted, accept, decline, clear };
}

let defaultConsentPromise: Promise<ReturnType<typeof createRemoteEstimateConsent>> | null = null;

async function getDefaultConsent() {
  if (!defaultConsentPromise) {
    defaultConsentPromise = import('expo-file-system').then(({ File, Paths }) => {
      const file = new File(Paths.document, REMOTE_ESTIMATE_CONSENT_FILE_NAME);
      return createRemoteEstimateConsent({
        read: () => file.exists ? file.text() : Promise.resolve(null),
        write: async (value) => { file.write(value); },
        remove: async () => { if (file.exists) file.delete(); },
      });
    }).catch((error) => {
      defaultConsentPromise = null;
      throw error;
    });
  }
  return defaultConsentPromise;
}

export async function getRemoteEstimateConsentDecision(): Promise<RemoteEstimateConsentDecision | null> {
  try {
    return await (await getDefaultConsent()).getDecision();
  } catch {
    return null;
  }
}

export async function hasRemoteEstimateConsent(): Promise<boolean> {
  try {
    return await (await getDefaultConsent()).isAccepted();
  } catch {
    return false;
  }
}

export async function acceptRemoteEstimateConsent(): Promise<void> {
  await (await getDefaultConsent()).accept();
}

export async function declineRemoteEstimateConsent(): Promise<void> {
  await (await getDefaultConsent()).decline();
}

export async function clearRemoteEstimateConsent(): Promise<void> {
  await (await getDefaultConsent()).clear();
}
