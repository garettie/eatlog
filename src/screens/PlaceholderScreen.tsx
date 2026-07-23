import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface PlaceholderScreenProps {
  title: string;
}

export default function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-m3-on-surface text-xl font-bold mb-2">{title}</Text>
        <Text className="text-m3-on-surface-variant text-sm">Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}
