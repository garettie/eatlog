import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * expo-updates checks once at launch, so an update published while the app is open would
 * otherwise stay invisible until the next cold start. Re-check on foreground, throttled, so
 * a user who leaves Eatlog open all day still learns about one.
 */
const FOREGROUND_CHECK_INTERVAL_MS = 300000;

export interface AppUpdate {
  /** A new bundle is downloaded and will run on the next reload. */
  ready: boolean;
  /** Applies the downloaded bundle by restarting. Resolves only on failure. */
  restart: () => Promise<void>;
  /** Hides the affordance for this launch. A later cold start surfaces it again. */
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdate {
  const { isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const lastCheckRef = useRef(Date.now());

  useEffect(() => {
    // Disabled in Expo Go and dev builds, where reloadAsync throws and no bundle can arrive.
    if (!Updates.isEnabled) return;
    const onChange = (status: AppStateStatus) => {
      if (status !== 'active') return;
      const now = Date.now();
      if (now - lastCheckRef.current < FOREGROUND_CHECK_INTERVAL_MS) return;
      lastCheckRef.current = now;
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
    return () => subscription.remove();
  }, []);

  const restart = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // The reload did not take. Keep the banner so the action stays available rather than
      // reporting a failure the user cannot act on.
    }
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { ready: Updates.isEnabled && isUpdatePending && !dismissed, restart, dismiss };
}
