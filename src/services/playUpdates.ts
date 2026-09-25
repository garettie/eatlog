import { Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

import { getApplicationInfo } from '../utils/applicationInfo';

interface EatlogPlayUpdatesModule {
  isUpdateAvailableAsync(): Promise<boolean>;
}

// Optional on purpose: builds installed before this module shipped still receive OTA updates,
// and requireNativeModule would crash them on import.
const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<EatlogPlayUpdatesModule>('EatlogPlayUpdates')
  : null;

/**
 * Whether Google Play has a newer build for this install. False wherever Play cannot answer:
 * old builds, sideloaded or forked installs, and phones without Play.
 */
export async function isPlayUpdateAvailable(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isUpdateAvailableAsync();
  } catch {
    return false;
  }
}

/** Opens Eatlog's listing in the Play Store app, or on the web when the app is missing. */
export async function openPlayListing(): Promise<void> {
  const { applicationId } = getApplicationInfo();
  if (!applicationId) return;
  try {
    await Linking.openURL(`market://details?id=${applicationId}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${applicationId}`).catch(() => {});
  }
}
