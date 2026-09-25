import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { M3 } from '../theme/tokens';
import { DURATION } from '../theme/motion';
import { haptics } from '../utils/haptics';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { useDiscardGuardContext } from './sheet-states/useDiscardGuard';

const COPY = {
  ota: {
    message: 'An update is ready. Restart to apply it.',
    action: 'Restart',
    actionLabel: 'Restart Eatlog to apply the update',
  },
  store: {
    message: 'A new version of Eatlog is on Google Play.',
    action: 'Update',
    actionLabel: 'Open Google Play to update Eatlog',
  },
} as const;

/**
 * Announces an update on Today only. Applying it is the user's call and never the app's: an
 * unannounced reload, or Play replacing the app mid-install, would discard the edit being made.
 */
export default function UpdateBanner() {
  const { kind, apply, dismiss } = useAppUpdate();
  const { isAnyDirty } = useDiscardGuardContext();
  const reduced = useReducedMotion();
  const [applying, setApplying] = useState(false);

  const handleApply = useCallback(() => {
    // Unsaved edits outlive this component, so ask the owner of that state rather than
    // assuming Today being visible means nothing is in progress.
    if (isAnyDirty()) {
      haptics.warn();
      return;
    }
    haptics.tap();
    setApplying(true);
    void apply().finally(() => setApplying(false));
  }, [isAnyDirty, apply]);

  const handleDismiss = useCallback(() => {
    haptics.tap();
    dismiss();
  }, [dismiss]);

  if (!kind) return null;
  const copy = COPY[kind];

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(DURATION.short)}
      className="bg-m3-secondary-container rounded-2xl px-4 py-3 flex-row items-center gap-3"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <MaterialIcons name="system-update-alt" size={22} color={M3.onSecondaryContainer} />
      <Text className="text-m3-on-secondary-container text-sm font-medium flex-1">
        {copy.message}
      </Text>
      <Pressable
        onPress={handleApply}
        disabled={applying}
        className="min-h-[48px] px-3 items-center justify-center rounded-full active:opacity-70 disabled:opacity-50"
        accessibilityRole="button"
        accessibilityLabel={copy.actionLabel}
      >
        <Text className="text-m3-on-secondary-container text-sm font-semibold">{copy.action}</Text>
      </Pressable>
      <Pressable
        onPress={handleDismiss}
        className="min-h-[48px] w-12 items-center justify-center rounded-full active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel="Dismiss the update notice"
      >
        <MaterialIcons name="close" size={20} color={M3.onSecondaryContainer} />
      </Pressable>
    </Animated.View>
  );
}
