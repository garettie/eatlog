import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface ProfileSettingRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  detail: string;
  onPress?: () => void;
}

export default function ProfileSettingRow({ icon, title, detail, onPress }: ProfileSettingRowProps) {
  const content = (
    <>
      <View className="w-10 h-10 rounded-full bg-m3-surface-container-high items-center justify-center">
        <MaterialIcons name={icon} size={20} color="#c4c6d0" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-m3-on-surface font-semibold text-sm" numberOfLines={1}>{title}</Text>
        <Text className="text-m3-on-surface-variant text-xs mt-0.5" numberOfLines={1}>{detail}</Text>
      </View>
      {onPress && <MaterialIcons name="chevron-right" size={20} color="#c4c6d0" />}
    </>
  );

  if (!onPress) {
    return <View className="min-h-[64px] rounded-2xl bg-m3-surface-container px-4 flex-row items-center gap-3">{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      className="min-h-[64px] rounded-2xl bg-m3-surface-container px-4 flex-row items-center gap-3 active:opacity-70"
    >
      {content}
    </Pressable>
  );
}
