import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { M3 } from '../theme/tokens';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
  iconPosition?: 'left' | 'right';
}

export default function PrimaryButton({ title, onPress, disabled, loading, icon, iconPosition = 'right' }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={disabled || loading ? { opacity: 0.4 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      className="w-full min-h-[52px] bg-m3-primary rounded-full px-5 py-3.5 flex-row items-center justify-center gap-2 active:opacity-90"
    >
      {loading ? (
        <ActivityIndicator color={M3.onPrimary} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <MaterialIcons name={icon} size={16} color={M3.onPrimary} />
          )}
          <Text className="text-m3-on-primary font-bold text-sm">{title}</Text>
          {icon && iconPosition === 'right' && (
            <MaterialIcons name={icon} size={16} color={M3.onPrimary} />
          )}
        </>
      )}
    </Pressable>
  );
}
