export const REMOTE_ESTIMATE_DISCLOSURE_VERSION = 1;
const DISCLOSURE_FILE_NAME = 'remote-estimate-disclosure.json';

export interface RemoteEstimateDisclosureStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

interface DisclosureRecord {
  version: number;
  accepted: true;
}

export function createRemoteEstimateDisclosure(storage: RemoteEstimateDisclosureStorage) {
  async function isAccepted(): Promise<boolean> {
    const stored = await storage.read();
    if (stored === null) return false;
    try {
      const value = JSON.parse(stored) as Partial<DisclosureRecord>;
      return value.version === REMOTE_ESTIMATE_DISCLOSURE_VERSION && value.accepted === true;
    } catch {
      return false;
    }
  }

  async function accept(): Promise<void> {
    await storage.write(JSON.stringify({
      version: REMOTE_ESTIMATE_DISCLOSURE_VERSION,
      accepted: true,
    } satisfies DisclosureRecord));
  }

  return {
    isAccepted,
    accept,
    clear: () => storage.remove(),
  };
}

export async function requestRemoteEstimateDisclosure(
  disclosure: ReturnType<typeof createRemoteEstimateDisclosure>,
  confirm: () => Promise<boolean>,
): Promise<boolean> {
  if (await disclosure.isAccepted()) return true;
  if (!(await confirm())) return false;
  await disclosure.accept();
  return true;
}

let defaultDisclosurePromise: Promise<ReturnType<typeof createRemoteEstimateDisclosure>> | null = null;

async function getDefaultDisclosure() {
  if (!defaultDisclosurePromise) {
    defaultDisclosurePromise = import('expo-file-system').then(({ File, Paths }) => {
      const file = new File(Paths.document, DISCLOSURE_FILE_NAME);
      return createRemoteEstimateDisclosure({
        read: () => file.exists ? file.text() : Promise.resolve(null),
        write: async (value) => { file.write(value); },
        remove: async () => { if (file.exists) file.delete(); },
      });
    }).catch((error) => {
      defaultDisclosurePromise = null;
      throw error;
    });
  }
  return defaultDisclosurePromise;
}

export async function requestDefaultRemoteEstimateDisclosure(confirm: () => Promise<boolean>): Promise<boolean> {
  return requestRemoteEstimateDisclosure(await getDefaultDisclosure(), confirm);
}

export async function clearRemoteEstimateDisclosure(): Promise<void> {
  const disclosure = await getDefaultDisclosure();
  await disclosure.clear();
}
