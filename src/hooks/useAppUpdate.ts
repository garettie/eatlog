import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

import { isPlayUpdateAvailable, openPlayListing } from '../services/playUpdates';

/**
 * expo-updates checks once at launch, so an update published while the app is open would
 * otherwise stay invisible until the next cold start. Re-check on foreground, throttled, so
 * a user who leaves Eatlog open all day still learns about one.
 */
const FOREGROUND_CHECK_INTERVAL_MS = 300000;

/** `store`: a newer build is on Google Play. `ota`: a downloaded bundle runs on the next reload. */
export type AppUpdateKind = 'store' | 'ota';

export interface AppUpdate {
  kind: AppUpdateKind | null;
  /** Opens the Play Store listing, or restarts into the downloaded bundle. Never automatic. */
  apply: () => Promise<void>;
  /** Hides the affordance for this launch. A later cold start surfaces it again. */
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdate {
  const { isUpdatePending } = Updates.useUpdates();
  const [storeUpdate, setStoreUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheckRef = useRef(Date.now());

  useEffect(() => {
    let mounted = true;
    // Play answers on device, so this runs at once without holding up launch.
    const checkStore = () => {
      void isPlayUpdateAvailable().then((available) => {
        if (mounted && available) setStoreUpdate(true);
      });
    };
    checkStore();

    const onChange = (status: AppStateStatus) => {
      if (status !== 'active') return;
      const now = Date.now();
      if (now - lastCheckRef.current < FOREGROUND_CHECK_INTERVAL_MS) return;
      lastCheckRef.current = now;
      checkStore();
      // Disabled in Expo Go and dev builds, where reloadAsync throws and no bundle can arrive.
      if (!Updates.isEnabled) return;
      void (async () => {
        try {
          const result = await Updates.checkForUpdateAsync();
          if (result.isAvailable) await Updates.fetchUpdateAsync();
        } catch {
          // Offline or the update server is unreachable. The banner simply stays hidden;
          // there is nothing here worth interrupting a logging session over.
        }
      })();
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  // A new store build supersedes any bundle made for this one.
  const kind: AppUpdateKind | null = dismissed
    ? null
    : storeUpdate
      ? 'store'
      : Updates.isEnabled && isUpdatePending
        ? 'ota'
        : null;

  const apply = useCallback(async () => {
    if (kind === 'store') {
      await openPlayListing();
      return;
    }
    try {
      await Updates.reloadAsync();
    } catch {
      // The reload did not take. Keep the banner so the action stays available rather than
      // reporting a failure the user cannot act on.
    }
  }, [kind]);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { kind, apply, dismiss };
}
