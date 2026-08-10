export const INSTALLATION_TOKEN_FILE_NAME = 'installation-identity-v1';
export const INSTALLATION_TOKEN_BYTE_LENGTH = 16;

export interface InstallationIdentityStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

interface InstallationIdentityOptions {
  storage: InstallationIdentityStorage;
  randomBytes(byteCount: number): Promise<Uint8Array>;
}

export class InstallationIdentityUnavailableError extends Error {
  constructor() {
    super('Installation identity is unavailable.');
    this.name = 'InstallationIdentityUnavailableError';
  }
}

export function isInstallationToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createInstallationIdentity(options: InstallationIdentityOptions) {
  let tokenPromise: Promise<string> | null = null;

  async function loadOrCreate(): Promise<string> {
    const stored = await options.storage.read();
    if (isInstallationToken(stored)) return stored;

    const bytes = await options.randomBytes(INSTALLATION_TOKEN_BYTE_LENGTH);
    if (bytes.length !== INSTALLATION_TOKEN_BYTE_LENGTH) {
      throw new InstallationIdentityUnavailableError();
    }
    const token = encodeHex(bytes);
    await options.storage.write(token);
    return token;
  }

  function getToken(): Promise<string> {
    if (!tokenPromise) {
      tokenPromise = loadOrCreate().catch(() => {
        tokenPromise = null;
        throw new InstallationIdentityUnavailableError();
      });
    }
    return tokenPromise;
  }

  return { getToken };
}

let defaultIdentityPromise: Promise<ReturnType<typeof createInstallationIdentity>> | null = null;

async function getDefaultIdentity() {
  if (!defaultIdentityPromise) {
    defaultIdentityPromise = Promise.all([
      import('expo-file-system'),
      import('expo-crypto'),
    ]).then(([{ File, Paths }, Crypto]) => {
      const file = new File(Paths.document, INSTALLATION_TOKEN_FILE_NAME);
      return createInstallationIdentity({
        storage: {
          read: () => file.exists ? file.text() : Promise.resolve(null),
          write: async (value) => { file.write(value); },
        },
        randomBytes: (byteCount) => Crypto.getRandomBytesAsync(byteCount),
      });
    }).catch((error) => {
      defaultIdentityPromise = null;
      throw error;
    });
  }
  return defaultIdentityPromise;
}

export async function getInstallationToken(): Promise<string> {
  try {
    return await (await getDefaultIdentity()).getToken();
  } catch {
    throw new InstallationIdentityUnavailableError();
  }
}
