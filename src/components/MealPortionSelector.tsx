import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import {
  formatMealPortion,
  mealPortionCeiling,
  mealPortionStep,
  type MealPortionScale,
} from '../utils/mealReview';
import { M3 } from '../theme/tokens';

interface MealPortionSelectorProps {
  scale: MealPortionScale;
  eaten: number;
  disabled?: boolean;
  onChange: (eaten: number) => void;
}

interface Shortcut {
  value: number;
  label: string;
}

/**
 * Ordinary plates use exact fractions. Counted foods land on whole portions, so a half of three slices is two rather than
 * an unservable 1.5. Duplicates collapse (half of two is one, which is also the
 * quarter), and a single remaining shortcut means the stepper already covers the
 * range, so the row is dropped.
 */
function shortcutsFor(scale: MealPortionScale): Shortcut[] {
  if (scale.kind === 'count') return [];
  if (scale.kind === 'plate') return [
    { value: 1, label: 'All' },
    { value: 0.5, label: 'Half' },
    { value: 0.25, label: 'Quarter' },
  ];
  const servesTotal = scale.servesTotal;
  const candidates: Shortcut[] = [
    { value: servesTotal, label: 'All' },
    { value: Math.max(1, Math.round(servesTotal / 2)), label: 'Half' },
    ...(servesTotal >= 4
      ? [{ value: Math.max(1, Math.round(servesTotal / 4)), label: 'Quarter' }]
      : []),
  ];
  const unique = candidates.filter(
    (shortcut, index) => candidates.findIndex((other) => other.value === shortcut.value) === index,
  );
  return unique.length > 1 ? unique : [];
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'remove' | 'add';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="h-12 w-12 shrink-0 items-center justify-center rounded-full bg-m3-surface-container-high active:opacity-60 disabled:opacity-40"
    >
      <MaterialIcons name={icon} size={20} color={M3.onSurface} />
    </Pressable>
  );
}

/**
 * Meal-level portion control, covering both directions the estimate can be wrong
 * about how much a person ate. A shared dish is estimated whole, so this is where
 * the user says they only took three slices; a single food is estimated as the one
 * in the picture, so this is also where they say they had three of them. Either
 * way every food scales together instead of being edited one row at a time.
 */
export default function MealPortionSelector({
  scale,
  eaten,
  disabled = false,
  onChange,
}: MealPortionSelectorProps) {
  const shortcuts = shortcutsFor(scale);
  const step = mealPortionStep(scale);
  const atMin = eaten <= step;
  // Past the whole is still loggable: a second helping, or one of the two pizzas on
  // the table. Only the far end of that is implausible enough to stop at.
  const atMax = eaten >= mealPortionCeiling(scale);
  const portionLabel = formatMealPortion(eaten, scale);

  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-m3-on-surface text-base font-semibold">
        {scale.servesTotal == null ? 'How many did you have?' : 'How much did you eat?'}
      </Text>
      <View className="gap-3 rounded-2xl border border-m3-outline-variant/40 bg-m3-surface-container px-4 py-3">
        <View className="flex-row items-center gap-3">
          <StepButton
            icon="remove"
            label={scale.kind === 'plate' ? 'Decrease by a quarter of the meal' : `One less ${scale.unit}`}
            disabled={disabled || atMin}
            onPress={() => onChange(eaten - step)}
          />
          <Text
            accessibilityLiveRegion="polite"
            className="flex-1 text-center text-m3-on-surface text-xl font-bold tabular-nums"
          >
            {portionLabel}
          </Text>
          <StepButton
            icon="add"
            label={scale.kind === 'plate' ? 'Increase by a quarter of the meal' : `One more ${scale.unit}`}
            disabled={disabled || atMax}
            onPress={() => onChange(eaten + step)}
          />
        </View>

        {shortcuts.length > 0 ? (
          <View accessibilityRole="radiogroup" accessibilityLabel="Portion shortcuts" className="flex-row flex-wrap gap-2">
            {shortcuts.map((shortcut) => {
              const selected = shortcut.value === eaten;
              return (
                <Pressable
                  key={shortcut.label}
                  onPress={() => onChange(shortcut.value)}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled }}
                  accessibilityLabel={`${shortcut.label}, ${formatMealPortion(shortcut.value, scale)}`}
                  className={`min-h-[48px] flex-1 items-center justify-center rounded-full border px-3 active:opacity-60 disabled:opacity-40 ${selected ? 'border-m3-primary/50 bg-m3-primary-container' : 'border-m3-outline-variant/40 bg-m3-surface-container-high'}`}
                >
                  <Text
                    numberOfLines={1}
                    className={`text-xs font-semibold ${selected ? 'text-m3-on-primary-container' : 'text-m3-on-surface-variant'}`}
                  >
                    {shortcut.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}
