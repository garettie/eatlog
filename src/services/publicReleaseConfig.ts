const SUPPORT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function normalizeSupportEmail(value: string | undefined): string | null {
  const email = value?.trim() ?? '';
  if (!email || email.length > 254 || !SUPPORT_EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function normalizePublicHttpsUrl(value: string | undefined): string | null {
  const candidate = value?.trim() ?? '';
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isRevenueCatTestStoreKey(value: string | undefined): boolean {
  return (value?.trim() ?? '').startsWith('test_');
}

export function revenueCatApiKeyForBuild(value: string | undefined, testStoreAllowed: boolean): string {
  const key = value?.trim() ?? '';
  return isRevenueCatTestStoreKey(key) && !testStoreAllowed ? '' : key;
}

export function buildOpenFoodFactsUserAgent(appVersion: string, supportEmail: string | null): string | null {
  if (!VERSION_PATTERN.test(appVersion) || !supportEmail) return null;
  return `Eatlog/${appVersion} (${supportEmail})`;
}
