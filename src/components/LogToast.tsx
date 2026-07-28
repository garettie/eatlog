import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { M3 } from '../theme/tokens';

interface LogToastProps {
  message: string;
  onUndo?: () => void;
  onHide: () => void;
  durationMs?: number;
}

export default function LogToast({ message, onUndo, onHide, durationMs = 4000 }: LogToastProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    opacity.value = withTiming(
      0,
      { duration: reduced ? 0 : 250, easing: Easing.bezier(0.33, 1, 0.68, 1) },
      () => runOnJS(onHide)()
    );
  }, [onHide, reduced]);

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, durationMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      const absX = Math.abs(e.translationX);
      opacity.value = Math.max(0, 1 - absX / 120);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 80 && !dismissedRef.current) {
        dismissedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        translateX.value = withTiming(e.translationX > 0 ? 500 : -500, { duration: 200 });
        opacity.value = withTiming(0, { duration: 200 }, () => runOnJS(onHide)());
      } else if (!dismissedRef.current) {
        translateX.value = withTiming(
          0,
          { duration: reduced ? 0 : 200, easing: Easing.bezier(0.33, 1, 0.68, 1) }
        );
        opacity.value = withTiming(1, { duration: reduced ? 0 : 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={animatedStyle}
        entering={reduced ? undefined : FadeIn.duration(200)}
        className="bg-m3-surface-container-highest rounded-2xl px-4 py-3.5 flex-row items-center border border-m3-outline-variant/30"
      >
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
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          className="w-8 h-8 items-center justify-center rounded-full -mr-1"
          hitSlop={8}
        >
          <MaterialIcons name="close" size={18} color={M3.onSurfaceVariant} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}
