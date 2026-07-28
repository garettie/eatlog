import React, { useEffect, useState } from 'react';
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
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(0, MEALS.findIndex((meal) => meal.value === value));
  const selection = useSharedValue(selectedIndex);
  const segmentWidth = Math.max(0, (trackWidth - 4) / MEALS.length);

  useEffect(() => {
    selection.value = withTiming(selectedIndex, {
      duration: reduced ? 0 : DURATION.medium,
      easing: EASING.emphasized,
    });
  }, [reduced, selectedIndex]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: selection.value * segmentWidth }],
  }), [segmentWidth]);

  return (
    <View
      className="flex-row bg-m3-surface-container-high rounded-full p-0.5 border border-m3-outline-variant/30 relative overflow-hidden"
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {trackWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          className="absolute bg-white rounded-full"
          style={[pillStyle, { width: segmentWidth, top: 2, bottom: 2, left: 2 }]}
        />
      )}
      {MEALS.map((m) => {
        const selected = value === m.value;
        return (
          <Pressable
            key={m.value}
            onPress={() => onChange(m.value)}
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
