import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../theme/tokens';

interface ProfileSettingRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  detail: string;
  onPress?: () => void;
  disabled?: boolean;
  showDivider?: boolean;
}

export default function ProfileSettingRow({
  icon,
  title,
  detail,
  onPress,
  disabled = false,
  showDivider = true,
}: ProfileSettingRowProps) {
  const content = (
    <>
      <View className="w-10 h-10 rounded-full bg-m3-surface-container-high items-center justify-center">
        <MaterialIcons name={icon} size={20} color={M3.onSurfaceVariant} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-m3-on-surface font-semibold text-sm" numberOfLines={1}>{title}</Text>
        <Text className="text-m3-on-surface-variant text-sm mt-0.5" numberOfLines={2}>{detail}</Text>
      </View>
      {onPress && <MaterialIcons name="chevron-right" size={20} color={M3.onSurfaceVariant} />}
      {showDivider && <View className="absolute bottom-0 left-[68px] right-4 h-px bg-m3-outline-variant/50" />}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible={disabled}
        accessibilityLabel={disabled ? `${title}. ${detail}` : undefined}
        accessibilityState={disabled ? { disabled: true } : undefined}
        className={`min-h-[72px] px-4 flex-row items-center gap-3 ${disabled ? 'opacity-50' : ''}`}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: M3.surfaceContainerHigh }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      className="min-h-[72px] px-4 flex-row items-center gap-3 active:opacity-70"
    >
      {content}
    </Pressable>
  );
}
