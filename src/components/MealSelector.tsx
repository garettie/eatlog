import React, { startTransition } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MealType } from '../db/database';
import { useResponsiveLayout } from '../theme/layout';
import SegmentedControl from './SegmentedControl';

const MEALS: { label: string; compactLabel: string; value: MealType }[] = [
  { label: 'Breakfast', compactLabel: 'Bfast', value: 'breakfast' },
  { label: 'Lunch', compactLabel: 'Lunch', value: 'lunch' },
  { label: 'Dinner', compactLabel: 'Dinner', value: 'dinner' },
  { label: 'Snack', compactLabel: 'Snack', value: 'snack' },
];

interface MealSelectorProps {
  value: MealType;
  onChange: (meal: MealType) => void;
  compact?: boolean;
  disabled?: boolean;
}

export default function MealSelector({ value, onChange, compact = false, disabled = false }: MealSelectorProps) {
  const { isNarrow } = useResponsiveLayout();
  if (isNarrow) {
    return (
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Meal"
        style={disabled ? { opacity: 0.38 } : undefined}
        className="flex-row flex-wrap gap-2"
      >
        {MEALS.map((m) => {
          const selected = m.value === value;
          return (
            <Pressable
              key={m.value}
              onPress={() => {
                if (m.value === value) return;
                startTransition(() => onChange(m.value));
              }}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              className={`min-h-[48px] min-w-[47%] flex-1 px-3 rounded-full items-center justify-center border active:opacity-70 ${
                selected
                  ? 'bg-m3-primary border-m3-primary'
                  : 'bg-m3-surface-container-high border-m3-outline-variant/30'
              }`}
            >
              <Text
                numberOfLines={2}
                className={`text-xs font-semibold text-center ${selected ? 'text-m3-on-primary' : 'text-m3-on-surface-variant'}`}
              >
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <SegmentedControl
      options={MEALS.map((m) => ({
        value: m.value,
        label: compact ? m.compactLabel : m.label,
        accessibilityLabel: m.label,
      }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
      density="compact"
      accessibilityLabel="Meal"
    />
  );
}
