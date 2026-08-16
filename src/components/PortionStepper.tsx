import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import SegmentedControl from './SegmentedControl';
import { M3 } from '../theme/tokens';
import type { FoodAmountOption, PortionMode } from '../utils/portionSelection';
import { MIN_SERVINGS } from '../utils/portionSelection';
import { formatPortionLabel, formatServingSummary, parsePositivePortionInput } from '../utils/portionLabels';

interface PortionStepperProps {
  unitMode: PortionMode;
  servings: number;
  grams: number;
  servingSizeGrams: number | null;
  servingLabel: string | null;
  amountOptions?: FoodAmountOption[];
  selectedAmountId?: string;
  onAmountChange?: (option: FoodAmountOption) => void;
  onModeChange: (mode: PortionMode) => void;
  onServingsDelta: (delta: number) => void;
  onServingsSet: (value: number) => void;
  onGramsSet: (value: number) => void;
  onValidityChange?: (valid: boolean) => void;
}

function formatServings(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded);
}

function formatGrams(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export default function PortionStepper({
  unitMode,
  servings,
  grams,
  servingSizeGrams,
  servingLabel,
  amountOptions = [],
  selectedAmountId,
  onAmountChange,
  onModeChange,
  onServingsDelta,
  onServingsSet,
  onGramsSet,
  onValidityChange,
}: PortionStepperProps) {
  const [servingsText, setServingsText] = useState(formatServings(servings));
  const [gramsText, setGramsText] = useState(formatGrams(grams));
  const hasServing = servingSizeGrams != null && servingSizeGrams > 0;

  useEffect(() => {
    setServingsText(formatServings(servings));
  }, [servings]);

  useEffect(() => {
    setGramsText(formatGrams(grams));
  }, [grams]);

  const handleServingsChange = useCallback(
    (text: string) => {
      setServingsText(text);
      const value = parsePositivePortionInput(text);
      const valid = value != null && value >= MIN_SERVINGS;
      onValidityChange?.(valid);
      if (valid) onServingsSet(value);
    },
    [onServingsSet, onValidityChange],
  );

  const handleGramsChange = useCallback(
    (text: string) => {
      setGramsText(text);
      const value = parsePositivePortionInput(text);
      const valid = value != null;
      onValidityChange?.(valid);
      if (valid) onGramsSet(value);
    },
    [onGramsSet, onValidityChange],
  );

  const servingsValue = parsePositivePortionInput(servingsText);
  const gramsValue = parsePositivePortionInput(gramsText);
  const servingsInvalid = servingsValue == null || servingsValue < MIN_SERVINGS;
  const gramsInvalid = gramsValue == null;
  const editorInvalid = unitMode === 'servings' && hasServing ? servingsInvalid : gramsInvalid;
  const canDecrease = servings > MIN_SERVINGS;
  const totalGrams = grams;
  const servingDesc = servingSizeGrams
    ? formatServingSummary(servingLabel, servingSizeGrams, totalGrams)
    : '';

  return (
    <View className="gap-3">
      {amountOptions.length > 0 && onAmountChange ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {amountOptions.map((option) => {
            const selected = option.id === selectedAmountId;
            const unit = /ml\b/i.test(option.label) ? 'ml' : 'g';
            const optionLabel = formatPortionLabel(option.label, option.grams, unit);
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  onValidityChange?.(true);
                  onAmountChange(option);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={optionLabel.replace(' · ', ', ')}
                className={`max-w-full min-h-[48px] justify-center rounded-full px-4 border border-m3-outline-variant/40 active:opacity-60 ${selected ? 'bg-m3-surface-container-highest' : 'bg-m3-surface-container'}`}
              >
                <Text numberOfLines={2} className={`text-xs font-semibold ${selected ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>
                  {optionLabel}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {hasServing ? (
        <SegmentedControl
          options={[
            {
              value: 'servings' as const,
              label: 'Servings',
              accessibilityLabel: 'Servings, use household portions',
            },
            {
              value: 'grams' as const,
              label: 'Grams',
              accessibilityLabel: 'Grams, enter weight directly',
            },
          ]}
          value={unitMode}
          tone="inset"
          onChange={(mode) => {
            onValidityChange?.(true);
            onModeChange(mode);
          }}
        />
      ) : null}

      <View className={`bg-m3-surface-container rounded-xl px-4 py-3 items-center gap-1.5 border ${editorInvalid ? 'border-m3-error' : 'border-m3-outline-variant/40'}`}>
        {unitMode === 'servings' && hasServing ? (
          <>
            <View className="flex-row items-center gap-5">
              <Pressable
                onPress={() => onServingsDelta(-0.5)}
                disabled={!canDecrease}
                accessibilityRole="button"
                accessibilityLabel="Decrease servings"
                accessibilityState={{ disabled: !canDecrease }}
                className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60 disabled:opacity-40"
              >
                <MaterialIcons
                  name="remove"
                  size={20}
                  color={canDecrease ? M3.onSurface : M3.onSurfaceVariant}
                />
              </Pressable>
              <BottomSheetTextInput
                value={servingsText}
                onChangeText={handleServingsChange}
                onBlur={() => {
                  if (servingsText === '' || servingsInvalid) setServingsText(formatServings(servings));
                  onValidityChange?.(true);
                }}
                accessibilityLabel="Servings"
                accessibilityHint={servingsInvalid ? 'Invalid amount. Enter at least 0.1 serving.' : 'Enter at least 0.1 serving'}
                keyboardType="numeric"
                returnKeyType="done"
                className={`w-16 min-h-[48px] text-center bg-transparent text-2xl font-bold tabular-nums py-1 ${servingsInvalid ? 'text-m3-error' : 'text-m3-on-surface'}`}
              />
              <Pressable
                onPress={() => onServingsDelta(0.5)}
                accessibilityRole="button"
                accessibilityLabel="Increase servings"
                className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60"
              >
                <MaterialIcons name="add" size={20} color={M3.onSurface} />
              </Pressable>
            </View>
            {servingsInvalid ? (
              <Text
                className="text-m3-error text-xs text-center font-medium"
                accessibilityLiveRegion="polite"
              >
                Enter at least 0.1 serving.
              </Text>
            ) : servingDesc ? (
              <Text className="text-m3-on-surface-variant text-xs text-center">
                {servingDesc}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <View className="relative w-full min-h-[48px] items-center justify-center">
              <BottomSheetTextInput
                value={gramsText}
                onChangeText={handleGramsChange}
                onBlur={() => {
                  if (gramsInvalid) setGramsText(formatGrams(grams));
                  onValidityChange?.(true);
                }}
                accessibilityLabel="Amount in grams"
                accessibilityHint={gramsInvalid ? 'Invalid amount. Enter a number greater than zero.' : 'Enter a number greater than zero'}
                keyboardType="numeric"
                returnKeyType="done"
                className={`w-full min-h-[48px] text-center bg-transparent py-2 px-12 text-2xl font-bold tabular-nums ${gramsInvalid ? 'text-m3-error' : 'text-m3-on-surface'}`}
              />
              <View
                pointerEvents="none"
                className="absolute right-4 top-0 bottom-0 justify-center"
              >
                <Text className="text-m3-on-surface-variant text-base font-semibold">
                  g
                </Text>
              </View>
            </View>
            {gramsInvalid ? (
              <Text
                className="text-m3-error text-xs text-center font-medium"
                accessibilityLiveRegion="polite"
              >
                Enter a number greater than zero.
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}
