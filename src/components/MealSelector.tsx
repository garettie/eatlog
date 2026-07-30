import React, { startTransition, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MealType } from '../db/database';
import { DURATION, EASING } from '../theme/motion';

const MEALS: { label: string; value: MealType }[] = [
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' },
  { label: 'Snack', value: 'snack' },
];

interface MealSelectorProps {
  value: MealType;
  onChange: (meal: MealType) => void;
}

export default function MealSelector({ value, onChange }: MealSelectorProps) {
  const reduced = useReducedMotion();
  const selectedIndex = Math.max(0, MEALS.findIndex((meal) => meal.value === value));
  const trackWidth = useSharedValue(0);
  const measuredRef = useRef(false);
  const requestedIndexRef = useRef(selectedIndex);
  const pendingValueRef = useRef<MealType | null>(null);
  const [visualIndex, setVisualIndex] = useState(selectedIndex);
  const selection = useSharedValue(selectedIndex);

  useEffect(() => {
    if (pendingValueRef.current != null) {
      if (value !== pendingValueRef.current) return;
      pendingValueRef.current = null;
    }
    setVisualIndex((currentIndex) => currentIndex === selectedIndex ? currentIndex : selectedIndex);
    if (!measuredRef.current) return;
    if (requestedIndexRef.current === selectedIndex) return;
    requestedIndexRef.current = selectedIndex;
    selection.value = withTiming(selectedIndex, {
      duration: reduced ? 0 : DURATION.short,
      easing: EASING.emphasized,
    });
  }, [reduced, selectedIndex, value]);

  const pillStyle = useAnimatedStyle(() => {
    const segmentWidth = Math.max(0, (trackWidth.value - 4) / MEALS.length);
    return {
      width: segmentWidth,
      opacity: trackWidth.value > 0 ? 1 : 0,
      transform: [{ translateX: selection.value * segmentWidth }],
    };
  });

  return (
    <View
      className="flex-row bg-m3-surface-container-high rounded-full p-0.5 border border-m3-outline-variant/30 relative overflow-hidden"
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (!measuredRef.current) {
          selection.value = selectedIndex;
          requestedIndexRef.current = selectedIndex;
          measuredRef.current = true;
        }
        trackWidth.value = nextWidth;
      }}
    >
      <Animated.View
        pointerEvents="none"
        className="absolute bg-white rounded-full"
        style={[pillStyle, { top: 2, bottom: 2, left: 2 }]}
      />
      {MEALS.map((m, mealIndex) => {
        const selected = mealIndex === visualIndex;
        return (
          <Pressable
            key={m.value}
            onPress={() => {
              if (mealIndex === requestedIndexRef.current) return;
              requestedIndexRef.current = mealIndex;
              pendingValueRef.current = m.value;
              setVisualIndex(mealIndex);
              selection.value = withTiming(mealIndex, {
                duration: reduced ? 0 : DURATION.short,
                easing: EASING.emphasized,
              });
              startTransition(() => onChange(m.value));
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className="flex-1 min-h-[48px] px-1 rounded-full items-center justify-center z-10 active:opacity-70"
          >
            <Text
              numberOfLines={1}
              className={`text-xs font-semibold ${selected ? 'text-m3-on-primary' : 'text-m3-on-surface-variant'}`}
            >
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
