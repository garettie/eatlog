import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

import { M3 } from '../theme/tokens';

interface LogToastProps {
  message: string;
  onUndo?: () => void;
  onHide: () => void;
  durationMs?: number;
}

export default function LogToast({ message, onUndo, onHide, durationMs = 4000 }: LogToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeRef = useRef<Swipeable>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onHide, durationMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, onHide, durationMs]);

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onHide();
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={() => null}
      onSwipeableWillOpen={() => handleDismiss()}
      friction={2}
      rightThreshold={100}
      overshootRight={false}
      containerStyle={{ overflow: 'visible' }}
    >
      <View className="bg-m3-surface-container-highest rounded-2xl px-4 py-3.5 flex-row items-center border border-m3-outline-variant/30">
        <Text className="flex-1 text-m3-on-surface text-sm font-medium mr-2">{message}</Text>
        {onUndo && (
          <Pressable
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            className="px-3 py-2 -my-1 mr-1"
          >
            <Text className="text-white font-bold text-sm">Undo</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          className="w-8 h-8 items-center justify-center rounded-full -mr-1"
          hitSlop={8}
        >
          <MaterialIcons name="close" size={18} color={M3.onSurfaceVariant} />
        </Pressable>
      </View>
    </Swipeable>
  );
}
