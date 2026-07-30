import React, { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, Text } from 'react-native';
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

export type LogToastTone = 'success' | 'neutral' | 'error';

interface LogToastProps {
  message: string;
  tone?: LogToastTone;
  onUndo?: () => void | Promise<void>;
  onHide: () => void;
  durationMs?: number;
}

function LogToast({ message, tone = 'neutral', onUndo, onHide, durationMs }: LogToastProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);
  const dismissed = useSharedValue(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;
  const resolvedDurationMs = durationMs ?? (onUndo ? 6000 : 4000);
  const hide = useCallback(() => onHideRef.current(), []);
  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const dismiss = useCallback(() => {
    if (dismissed.value) return;
    dismissed.value = true;
    clearTimer();
    opacity.value = withTiming(
      0,
      { duration: reduced ? 0 : 250, easing: Easing.bezier(0.33, 1, 0.68, 1) },
      () => runOnJS(hide)()
    );
  }, [clearTimer, hide, reduced]);

  useEffect(() => {
    let active = true;
    dismissed.value = false;
    opacity.value = 1;
    translateX.value = 0;
    void AccessibilityInfo.getRecommendedTimeoutMillis(resolvedDurationMs)
      .catch(() => resolvedDurationMs)
      .then((timeout) => {
        if (active) timerRef.current = setTimeout(dismiss, timeout);
      });
    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, resolvedDurationMs, dismiss]);

  const handleUndo = useCallback(async () => {
    if (dismissed.value || !onUndo) return;
    dismissed.value = true;
    clearTimer();
    try {
      await onUndo();
      onHide();
    } catch {
      dismissed.value = false;
    }
  }, [clearTimer, onHide, onUndo]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      const absX = Math.abs(e.translationX);
      opacity.value = Math.max(0, 1 - absX / 120);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 80 && !dismissed.value) {
        dismissed.value = true;
        runOnJS(clearTimer)();
        translateX.value = withTiming(e.translationX > 0 ? 500 : -500, { duration: reduced ? 0 : 200 });
        opacity.value = withTiming(0, { duration: reduced ? 0 : 200 }, () => runOnJS(hide)());
      } else if (!dismissed.value) {
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
  const icon = tone === 'success' ? 'check' : tone === 'error' ? 'error-outline' : 'info-outline';
  const iconColor = tone === 'error' ? M3.error : M3.onSurface;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={animatedStyle}
        entering={reduced ? undefined : FadeIn.duration(200)}
        accessibilityLiveRegion="polite"
        className="bg-m3-surface-container-highest rounded-2xl px-4 py-3.5 flex-row items-center border border-m3-outline-variant/30"
      >
        <Animated.View className="w-8 h-8 rounded-full bg-white/10 items-center justify-center mr-3">
          <MaterialIcons name={icon} size={17} color={iconColor} />
        </Animated.View>
        <Text className="flex-1 text-m3-on-surface text-sm font-medium mr-2">{message}</Text>
        {onUndo && (
          <Pressable
            onPress={handleUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            className="min-h-[48px] px-3 items-center justify-center -my-1 mr-1"
          >
            <Text className="text-white font-bold text-sm">Undo</Text>
          </Pressable>
        )}
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          className="w-12 h-12 items-center justify-center rounded-full -mr-1"
        >
          <MaterialIcons name="close" size={18} color={M3.onSurfaceVariant} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export default React.memo(LogToast);
