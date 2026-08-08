import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import SegmentedControl from './SegmentedControl';
import { M3 } from '../theme/tokens';
import type { FoodPortion } from '../services/foodSearchTypes';
import { formatPortionLabel, formatServingSummary, parsePositivePortionInput } from '../utils/portionLabels';

interface PortionStepperProps {
  unitMode: 'servings' | 'grams' | 'ml';
  servings: number;
  grams: number;
  servingSizeGrams: number | null;
  servingLabel: string | null;
  hasServing: boolean;
  showMl: boolean;
  portions?: FoodPortion[];
  selectedPortionId?: string;
  onPortionChange?: (portion: FoodPortion) => void;
  onModeChange: (mode: 'servings' | 'grams' | 'ml') => void;
  onServingsDelta: (delta: number) => void;
  onServingsSet: (value: string) => void;
  onGramsSet: (value: string) => void;
}

function formatServings(v: number): string {
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1);
}

export default function PortionStepper({
  unitMode,
  servings,
  grams,
  servingSizeGrams,
  servingLabel,
  hasServing,
  showMl,
  portions = [],
  selectedPortionId,
  onPortionChange,
  onModeChange,
  onServingsDelta,
  onServingsSet,
  onGramsSet,
}: PortionStepperProps) {
  const [servingsText, setServingsText] = useState(formatServings(servings));
  const [gramsText, setGramsText] = useState(String(grams));

  useEffect(() => {
    setServingsText(formatServings(servings));
  }, [servings]);

  useEffect(() => {
    setGramsText(String(grams));
  }, [grams]);

  const handleServingsChange = useCallback(
    (t: string) => {
      setServingsText(t);
      const value = parsePositivePortionInput(t);
      if (value != null) onServingsSet(String(value));
    },
    [onServingsSet],
  );

  const handleGramsChange = useCallback(
    (t: string) => {
      setGramsText(t);
      const value = parsePositivePortionInput(t);
      if (value != null) onGramsSet(String(value));
    },
    [onGramsSet],
  );

  const totalGrams = Math.round(servings * (servingSizeGrams ?? 0));
  const servingDesc = servingSizeGrams
    ? formatServingSummary(servingLabel, servingSizeGrams, totalGrams)
    : '';
  const servingsInvalid = servingsText !== '' && parsePositivePortionInput(servingsText) == null;
  const gramsInvalid = gramsText !== '' && parsePositivePortionInput(gramsText) == null;

  return (
    <View className="gap-3">
      {portions.length > 1 && onPortionChange ? (
        <View className="flex-row flex-wrap gap-2">
          {portions.map((portion) => {
            const selected = portion.id === selectedPortionId;
            const unit = /ml\b/i.test(portion.label) ? 'ml' : 'g';
            const portionLabel = formatPortionLabel(portion.label, Math.round(portion.grams), unit);
            return (
              <Pressable
                key={portion.id}
                onPress={() => onPortionChange(portion)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={portionLabel.replace(' · ', ', ')}
                className={`max-w-full min-h-[48px] justify-center rounded-full px-4 border border-m3-outline-variant/40 active:opacity-60 ${selected ? 'bg-m3-surface-container-highest' : 'bg-m3-surface-container'}`}
              >
                <Text numberOfLines={2} className={`text-xs font-semibold ${selected ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>
                  {portionLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {(hasServing || showMl) && (
        <SegmentedControl
          options={[
            ...(hasServing ? [{ value: 'servings' as const, label: 'Servings' }] : []),
            { value: 'grams' as const, label: 'Grams' },
            ...(showMl ? [{ value: 'ml' as const, label: 'ml' }] : []),
          ]}
          value={unitMode}
          onChange={onModeChange}
        />
      )}

      <View className="bg-m3-surface-container rounded-2xl px-4 py-4 items-center gap-1.5">
        {unitMode === 'servings' && hasServing ? (
          <>
            <View className="flex-row items-center gap-5">
              <Pressable
                onPress={() => onServingsDelta(-0.5)}
                accessibilityRole="button"
                accessibilityLabel="Decrease servings"
                className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60"
              >
                <MaterialIcons name="remove" size={20} color={M3.onSurface} />
              </Pressable>
              <BottomSheetTextInput
                value={servingsText}
                onChangeText={handleServingsChange}
                onBlur={() => {
                  if (servingsText === '' || servingsInvalid) setServingsText(formatServings(servings));
                }}
                accessibilityLabel="Servings"
                accessibilityHint={servingsInvalid ? 'Invalid serving amount. Enter a number greater than zero.' : 'Enter a number greater than zero'}
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
            {servingDesc ? (
              <Text className="text-m3-on-surface-variant text-xs text-center">
                {servingDesc}
              </Text>
            ) : null}
          </>
        ) : (
          <View className="flex-row items-center justify-center gap-3 w-full">
            <BottomSheetTextInput
              value={gramsText}
              onChangeText={handleGramsChange}
              onBlur={() => {
                if (gramsText === '' || gramsInvalid) setGramsText(String(grams));
              }}
              accessibilityLabel={unitMode === 'ml' ? 'Amount in milliliters' : 'Amount in grams'}
              accessibilityHint={gramsInvalid ? 'Invalid amount. Enter a number greater than zero.' : 'Enter a number greater than zero'}
              keyboardType="numeric"
              returnKeyType="done"
              className={`w-28 min-h-[48px] text-center bg-m3-surface-container-high rounded-xl py-3 px-3 text-lg font-bold tabular-nums border ${gramsInvalid ? 'text-m3-error border-m3-error' : 'text-m3-on-surface border-m3-outline-variant/50'}`}
            />
            <Text className="text-m3-on-surface-variant text-sm font-semibold">
              {unitMode === 'ml' ? 'ml' : 'grams'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
