import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';

import { MealType, insertFoodLog } from '../../db/database';
import { defaultMealForNow, todayISO } from '../../utils/calculations';
import { M3 } from '../../theme/tokens';
import { useDiscardGuardContext } from './useDiscardGuard';
import MealSelector from '../MealSelector';
import PrimaryButton from '../PrimaryButton';
import SheetBackButton from './SheetBackButton';

interface ManualInputStateProps {
  onLogComplete: (info: { logId: number; meal: MealType; name: string; calories: number; logDate: string }) => void;
  initialMeal?: MealType | null;
  /** Diary date to write to (backfill); null = today. */
  logDate?: string | null;
  onBack: () => void;
}

export default function ManualInputState({ onLogComplete, initialMeal, logDate, onBack }: ManualInputStateProps) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [meal, setMeal] = useState<MealType>(() => initialMeal ?? defaultMealForNow());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const discardGuard = useDiscardGuardContext();

  const values = [calories, protein, carbs, fat];
  const hasAnyMacro = values.some((v) => parseFloat(v) > 0);
  const hasInvalidValue = values.some((v) => v.trim() !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0));
  const canLog = name.trim().length > 0 && hasAnyMacro && !hasInvalidValue && !logging;

  useEffect(() => {
    const unregister = discardGuard.register(
      () => name.trim().length > 0 || hasAnyMacro,
      () => { setName(''); setCalories(''); setProtein(''); setCarbs(''); setFat(''); },
    );
    return unregister;
  }, [discardGuard, name, hasAnyMacro]);

  const handleLog = useCallback(async () => {
    if (!name.trim()) return;
    const cal = parseFloat(calories) || 0;
    const pro = parseFloat(protein) || 0;
    const ca = parseFloat(carbs) || 0;
    const fa = parseFloat(fat) || 0;
    if (!cal && !pro && !ca && !fa || hasInvalidValue) return;

    setLogError(null);
    setLogging(true);
    try {
      const targetLogDate = logDate ?? todayISO();
      const logId = await insertFoodLog({
        log_date: targetLogDate, name: name.trim(), source: 'manual', meal,
        brand: null, data_type: 'manual', preparation: null, grams_logged: null,
        calories_per_100g: null, protein_g_per_100g: null, carbs_g_per_100g: null, fat_g_per_100g: null,
        calories: cal, protein_g: pro, carbs_g: ca, fat_g: fa,
      });
      const loggedName = name.trim();
      setName(''); setCalories(''); setProtein(''); setCarbs(''); setFat('');
      onLogComplete({ logId, meal, name: loggedName, calories: cal, logDate: targetLogDate });
    } catch (e) {
      console.error('[ManualEntry] save failed', e);
      setLogError("Couldn't save this entry. Try again.");
    } finally { setLogging(false); }
  }, [name, calories, protein, carbs, fat, meal, onLogComplete, hasInvalidValue, logDate]);

  return (
    <BottomSheetScrollView className="flex-1 px-5" contentContainerClassName="pb-6 gap-4" keyboardShouldPersistTaps="handled">
      <View className="flex-row items-center gap-1">
        <SheetBackButton onPress={onBack} />
        <Text className="text-m3-on-surface font-bold text-base">Manual Entry</Text>
      </View>

      <View className="gap-1">
        <Text className="text-xs text-m3-on-surface-variant font-semibold uppercase tracking-wider">Food Name</Text>
        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          accessibilityLabel="Food name"
          placeholder="e.g. Homemade Chicken Soup"
          placeholderTextColor={M3.placeholder}
          className="bg-m3-surface-container-high text-m3-on-surface font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
        />
      </View>

      <View className="gap-1">
        <Text className="text-xs text-m3-on-surface-variant font-semibold uppercase tracking-wider">Calories (kcal)</Text>
        <BottomSheetTextInput
          value={calories}
          onChangeText={setCalories}
          accessibilityLabel="Calories"
          placeholder="0"
          placeholderTextColor={M3.placeholder}
          keyboardType="numeric"
          className="bg-m3-surface-container-high text-m3-on-surface tabular-nums font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
        />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-xs text-m3-protein font-semibold uppercase tracking-wider">Protein (g)</Text>
          <BottomSheetTextInput
            value={protein}
            onChangeText={setProtein}
            accessibilityLabel="Protein grams"
            placeholder="0"
            placeholderTextColor={M3.placeholder}
            keyboardType="numeric"
            className="bg-m3-surface-container-high text-m3-on-surface tabular-nums font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
          />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-xs text-m3-carbs font-semibold uppercase tracking-wider">Carbs (g)</Text>
          <BottomSheetTextInput
            value={carbs}
            onChangeText={setCarbs}
            accessibilityLabel="Carbohydrate grams"
            placeholder="0"
            placeholderTextColor={M3.placeholder}
            keyboardType="numeric"
            className="bg-m3-surface-container-high text-m3-on-surface tabular-nums font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
          />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-xs text-m3-fat font-semibold uppercase tracking-wider">Fat (g)</Text>
          <BottomSheetTextInput
            value={fat}
            onChangeText={setFat}
            accessibilityLabel="Fat grams"
            placeholder="0"
            placeholderTextColor={M3.placeholder}
            keyboardType="numeric"
            className="bg-m3-surface-container-high text-m3-on-surface tabular-nums font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
          />
        </View>
      </View>

      <MealSelector value={meal} onChange={setMeal} />

      <View className="mt-2">
        <PrimaryButton title="Log Entry" onPress={handleLog} loading={logging} disabled={!canLog} />
      </View>
      {(hasInvalidValue || logError) && (
        <Text className="text-m3-error text-xs font-medium" accessibilityLiveRegion="assertive">
          {logError ?? 'Nutrition values cannot be negative.'}
        </Text>
      )}
    </BottomSheetScrollView>
  );
}
