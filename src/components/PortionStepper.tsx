import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

interface PortionStepperProps {
  unitMode: 'servings' | 'grams' | 'ml';
  servings: number;
  grams: number;
  servingSizeGrams: number | null;
  servingLabel: string | null;
  hasServing: boolean;
  showMl: boolean;
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
      const v = parseFloat(t);
      if (!isNaN(v) && v > 0) onServingsSet(t);
    },
    [onServingsSet],
  );

  const handleGramsChange = useCallback(
    (t: string) => {
      setGramsText(t);
      onGramsSet(t);
    },
    [onGramsSet],
  );

  const servingDesc = servingLabel ?? (servingSizeGrams ? `${servingSizeGrams}g` : '');
  const totalGrams = Math.round(servings * (servingSizeGrams ?? 0));

  return (
    <View className="gap-3">
      {(hasServing || showMl) && (
        <View className="flex-row gap-1.5">
          {hasServing && (
            <Pressable
              onPress={() => onModeChange('servings')}
              accessibilityRole="button"
              accessibilityState={{ selected: unitMode === 'servings' }}
              className={`flex-1 py-3.5 rounded-full items-center active:opacity-60 ${unitMode === 'servings' ? 'bg-m3-surface-container' : 'bg-m3-surface-container-highest'}`}
            >
              <Text
                className={`text-xs font-semibold ${unitMode === 'servings' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}
              >
                Servings
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => onModeChange('grams')}
            accessibilityRole="button"
            accessibilityState={{ selected: unitMode === 'grams' }}
            className={`flex-1 py-3.5 rounded-full items-center active:opacity-60 ${unitMode === 'grams' ? 'bg-m3-surface-container' : 'bg-m3-surface-container-highest'}`}
          >
            <Text
              className={`text-[10px] font-semibold ${unitMode === 'grams' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}
            >
              Grams
            </Text>
          </Pressable>
          {showMl && (
            <Pressable
              onPress={() => onModeChange('ml')}
              accessibilityRole="button"
              accessibilityState={{ selected: unitMode === 'ml' }}
              className={`flex-1 py-3.5 rounded-full items-center active:opacity-60 ${unitMode === 'ml' ? 'bg-m3-surface-container' : 'bg-m3-surface-container-highest'}`}
            >
              <Text
                className={`text-[10px] font-semibold ${unitMode === 'ml' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}
              >
                ml
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View className="bg-m3-surface-container rounded-2xl px-4 py-4 items-center gap-1.5">
        {unitMode === 'servings' && hasServing ? (
          <>
            <View className="flex-row items-center gap-5">
              <Pressable
                onPress={() => onServingsDelta(-0.5)}
                accessibilityRole="button"
                accessibilityLabel="Decrease servings"
                className="w-11 h-11 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60"
              >
                <MaterialIcons name="remove" size={20} color="#e2e2e9" />
              </Pressable>
              <BottomSheetTextInput
                value={servingsText}
                onChangeText={handleServingsChange}
                keyboardType="numeric"
                returnKeyType="done"
                className="w-16 text-center bg-transparent text-m3-on-surface text-2xl font-bold num-tabular py-1"
              />
              <Pressable
                onPress={() => onServingsDelta(0.5)}
                accessibilityRole="button"
                accessibilityLabel="Increase servings"
                className="w-11 h-11 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60"
              >
                <MaterialIcons name="add" size={20} color="#e2e2e9" />
              </Pressable>
            </View>
            {servingDesc ? (
              <Text className="text-m3-on-surface-variant text-xs" numberOfLines={1}>
                {servingDesc} ({totalGrams}g)
              </Text>
            ) : null}
          </>
        ) : (
          <View className="flex-row items-center justify-center gap-3 w-full">
            <BottomSheetTextInput
              value={gramsText}
              onChangeText={handleGramsChange}
              keyboardType="numeric"
              returnKeyType="done"
              className="w-28 text-center bg-m3-surface-container-high rounded-xl py-3 px-3 text-m3-on-surface text-lg font-bold num-tabular border border-m3-outline-variant/50"
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
