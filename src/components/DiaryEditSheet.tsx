import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { FoodLog } from '../db/database';
import Sheet from './Sheet';
import { useDiscardGuard } from './sheet-states/useDiscardGuard';

export function portionRatio(food: FoodLog, grams: number): number {
  if (food.grams_logged && food.grams_logged > 0) return grams / food.grams_logged;
  if (food.calories_per_100g != null) return grams / 100;
  return 1;
}

interface DiaryEditSheetProps {
  food: FoodLog | null;
  saving: boolean;
  onSave: (grams: number) => Promise<boolean>;
  onClosed: () => void;
}

export default function DiaryEditSheet({ food, saving, onSave, onClosed }: DiaryEditSheetProps) {
  const [grams, setGrams] = useState(0);
  const baselineRef = useRef(0);
  const guard = useDiscardGuard();
  const closeRef = useRef<() => void>(() => { });
  const canCloseRef = useRef<() => boolean>(() => true);

  canCloseRef.current = () => guard.requestClose(() => closeRef.current());

  useEffect(() => {
    if (food) {
      const initial = food.grams_logged ?? 150;
      baselineRef.current = initial;
      setGrams(initial);
    }
  }, [food]);

  useEffect(
    () =>
      guard.register(
        () => grams !== baselineRef.current,
        () => { baselineRef.current = grams; },
      ),
    [guard, grams],
  );

  const handleSave = useCallback(async () => {
    if (!food || grams <= 0) return;
    const saved = await onSave(grams);
    if (saved) {
      baselineRef.current = grams;
      closeRef.current();
    }
  }, [food, grams, onSave]);

  const ratio = food ? portionRatio(food, grams) : 1;
  const previewCals = food ? Math.round(food.calories * ratio) : 0;
  const previewP = food ? Math.round(food.protein_g * ratio * 10) / 10 : 0;
  const previewC = food ? Math.round(food.carbs_g * ratio * 10) / 10 : 0;
  const previewF = food ? Math.round(food.fat_g * ratio * 10) / 10 : 0;

  return (
    <Sheet
      visible={food != null}
      snapPoints={['50%']}
      enableDynamicSizing
      stateKey="diary-edit"
      canCloseRef={canCloseRef}
      sheetCloseRef={closeRef}
      onSheetClosed={onClosed}
    >
      {food && (
        <View className="px-5 pb-6 gap-4" accessibilityViewIsModal>
          <View className="flex-row justify-between items-start">
            <View className="flex-1 mr-3">
              <Text className="text-m3-on-surface font-bold text-base" numberOfLines={2}>
                {food.name}
              </Text>
              <Text className="text-m3-on-surface-variant text-xs mt-1">
                {food.brand ? `${food.brand} · ` : ''}
                {food.calories_per_100g
                  ? `${Math.round(food.calories_per_100g)} kcal/100g`
                  : `${Math.round(food.calories)} kcal`}
              </Text>
            </View>
            <Text className="text-m3-on-surface text-lg font-bold tabular-nums">
              {previewCals}
            </Text>
          </View>

          <View className="flex-row items-center justify-center gap-4 bg-m3-surface-container-high rounded-2xl py-4">
            <Pressable
              onPress={() => setGrams((g) => Math.max(1, g - 10))}
              accessibilityRole="button"
              accessibilityLabel="Decrease portion by 10 grams"
              className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-70"
            >
              <MaterialIcons name="remove" size={22} color="#e2e2e9" />
            </Pressable>
            <View className="items-center min-w-[80px]">
              <BottomSheetTextInput
                value={String(grams)}
                onChangeText={(t) => {
                  const v = parseInt(t, 10);
                  if (!isNaN(v) && v > 0) setGrams(v);
                  else if (t === '') setGrams(0);
                }}
                keyboardType="numeric"
                accessibilityLabel="Portion in grams"
                className="text-white text-3xl font-bold text-center w-24 h-12"
              />
              <Text className="text-m3-on-surface-variant text-xs">grams</Text>
            </View>
            <Pressable
              onPress={() => setGrams((g) => g + 10)}
              accessibilityRole="button"
              accessibilityLabel="Increase portion by 10 grams"
              className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-70"
            >
              <MaterialIcons name="add" size={22} color="#e2e2e9" />
            </Pressable>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 bg-m3-surface-container-high rounded-2xl py-2 px-3 items-center">
              <Text className="text-m3-protein text-xs font-semibold">Protein</Text>
              <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{previewP}g</Text>
            </View>
            <View className="flex-1 bg-m3-surface-container-high rounded-2xl py-2 px-3 items-center">
              <Text className="text-m3-carbs text-xs font-semibold">Carbs</Text>
              <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{previewC}g</Text>
            </View>
            <View className="flex-1 bg-m3-surface-container-high rounded-2xl py-2 px-3 items-center">
              <Text className="text-m3-fat text-xs font-semibold">Fat</Text>
              <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{previewF}g</Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => { baselineRef.current = grams; closeRef.current(); }}
              accessibilityRole="button"
              className="flex-1 py-3 rounded-full items-center border border-m3-outline-variant/50 active:opacity-70"
            >
              <Text className="text-m3-on-surface-variant font-semibold text-sm">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || grams <= 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving || grams <= 0, busy: saving }}
              className={`flex-1 py-3 rounded-full items-center ${saving || grams <= 0 ? 'bg-m3-surface-container-high opacity-50' : 'bg-white active:opacity-80'}`}
            >
              <Text className={`font-semibold text-sm ${saving || grams <= 0 ? 'text-m3-on-surface-variant' : 'text-m3-on-primary'}`}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </Sheet>
  );
}
