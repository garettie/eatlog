import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../../theme/tokens';

/**
 * The top bar of a full-screen AI setup step: one leading icon button, Close for the modal
 * steps and Back inside onboarding, as Material's full-screen dialogs do.
 */
export default function FlowTopBar({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: 'close' | 'arrow-back';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View className="h-14 flex-row items-center px-1">
      <Pressable
        onPress={onPress}
        disabled={disabled}
        hitSlop={4}
        android_ripple={{ color: M3.surfaceContainerHigh, borderless: true, radius: 24 }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        className={`h-12 w-12 items-center justify-center rounded-full active:opacity-70 ${disabled ? 'opacity-40' : ''}`}
      >
        <MaterialIcons name={icon} size={24} color={M3.onSurface} />
      </Pressable>
    </View>
  );
}
