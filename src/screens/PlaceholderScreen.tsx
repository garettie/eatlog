import React from 'react';
import { Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { M3 } from '../theme/tokens';

interface PlaceholderScreenProps {
  title: string;
}

export default function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  const isSync = title === 'Sync';
  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-16 h-16 rounded-full bg-m3-surface-container-high items-center justify-center mb-5">
          <MaterialIcons name={isSync ? 'cloud-off' : 'insights'} size={28} color={M3.onSurfaceVariant} />
        </View>
        <Text className="text-m3-on-surface text-xl font-bold mb-2">{title}</Text>
        <Text className="text-m3-on-surface-variant text-sm text-center leading-5 max-w-[280px]">
          {isSync
            ? 'Your data stays on this device. Backup and sync are still in development.'
            : 'Deeper trends and progress insights are still in development.'}
        </Text>
        <View className="mt-5 rounded-full bg-m3-surface-container px-4 py-2 border border-m3-outline-variant/30">
          <Text className="text-m3-on-surface-variant text-xs font-semibold">In development</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
