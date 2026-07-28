import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { MealType } from '../db/database';

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
  return (
    <View className="flex-row bg-m3-surface-container-high rounded-full p-1.5">
      {MEALS.map((m) => {
        const selected = value === m.value;
        return (
          <Pressable
            key={m.value}
            onPress={() => onChange(m.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`flex-1 py-3.5 rounded-full items-center active:opacity-70 ${
              selected ? 'bg-m3-surface-container-highest' : ''
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                selected ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'
              }`}
            >
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
