import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

interface ScanningStateProps {
  onCancel: () => void;
}

export default function ScanningState({ onCancel }: ScanningStateProps) {
  return (
    <View style={{ minHeight: 240 }} className="px-5 pt-2 pb-6 gap-4 items-center justify-center">
      <View className="w-full items-center gap-3">
        <ActivityIndicator size="large" color="#ffffff" />
        <Text className="text-m3-on-surface text-sm font-semibold text-center">Reading ingredients and portions…</Text>
        <Text className="text-m3-on-surface-variant text-sm text-center">
          You’ll review every estimate before it reaches your diary.
        </Text>
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel scanning" className="min-h-[48px] justify-center bg-m3-surface-container-highest rounded-full px-5 py-2.5 active:opacity-60">
          <Text className="text-m3-on-surface text-xs font-semibold">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
