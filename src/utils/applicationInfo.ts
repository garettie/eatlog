interface ApplicationInfo {
  applicationId: string | null;
  appVersion: string;
  appBuild: string;
}

let cached: ApplicationInfo | null = null;

export function getApplicationInfo(): ApplicationInfo {
  if (cached) return cached;
  try {
    const application = require('expo-application') as typeof import('expo-application');
    cached = {
      applicationId: application.applicationId,
      appVersion: application.nativeApplicationVersion ?? 'unknown',
      appBuild: application.nativeBuildVersion ?? 'unknown',
    };
  } catch {
    // Native dependencies can be newer than an installed development client.
    // Ownership screens will still load and explain that a rebuild is required.
    cached = { applicationId: null, appVersion: 'unknown', appBuild: 'unknown' };
  }
  return cached;
}
