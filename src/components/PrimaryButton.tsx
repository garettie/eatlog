import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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
      className="w-full bg-white rounded-full py-4 flex-row items-center justify-center gap-2 active:scale-95"
    >
      {loading ? (
        <ActivityIndicator color="#000000" />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <MaterialIcons name={icon} size={16} color="#000000" />
          )}
          <Text className="text-black font-bold text-sm">{title}</Text>
          {icon && iconPosition === 'right' && (
            <MaterialIcons name={icon} size={16} color="#000000" />
          )}
        </>
      )}
    </Pressable>
  );
}
