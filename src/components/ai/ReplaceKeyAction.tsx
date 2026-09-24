import React from 'react';
import { Pressable, Text } from 'react-native';

import { useAiSetup } from '../../context/AiSetupContext';

/**
 * The recovery for a key Google turned down. The key is never marked broken; replacing it and
 * trying again is the user's move, and the estimate they were making reruns once they have.
 */
export default function ReplaceKeyAction({ onReplaced }: { onReplaced: () => void }) {
  const { openKeySetup } = useAiSetup();
  return (
    <Pressable
      onPress={() => { void openKeySetup('replace').then((saved) => { if (saved) onReplaced(); }); }}
      accessibilityRole="button"
      accessibilityHint="Opens key setup, then tries the estimate again"
      className="min-h-[48px] self-start justify-center rounded-full bg-m3-surface-container-high px-4 active:opacity-70"
    >
      <Text className="text-xs font-semibold text-m3-on-surface">Replace key</Text>
    </Pressable>
  );
}
