import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

interface LogToastProps {
  message: string;
  onUndo?: () => void;
  onHide: () => void;
  durationMs?: number;
}

export default function LogToast({ message, onUndo, onHide, durationMs = 4000 }: LogToastProps) {
  useEffect(() => {
    const t = setTimeout(onHide, durationMs);
    return () => clearTimeout(t);
  }, [message, onHide, durationMs]);

  return (
    <View className="absolute bottom-6 left-4 right-4 bg-m3-surface-container-highest rounded-2xl px-4 py-3.5 flex-row items-center border border-m3-outline-variant/30">
      <Text className="flex-1 text-m3-on-surface text-sm font-medium">{message}</Text>
      {onUndo && (
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          className="px-3 py-2 -my-1"
        >
          <Text className="text-white font-bold text-sm">Undo</Text>
        </Pressable>
      )}
    </View>
  );
}
