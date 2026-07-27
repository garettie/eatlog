import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { MealType, insertFoodLog } from '../../db/database';
import { DataType, FoodResult } from '../../services/foodSearch';
import { defaultMealForNow, todayISO } from '../../utils/calculations';
import MealSelector from '../MealSelector';
import MacroChipGroup from '../MacroChipGroup';
import PrimaryButton from '../PrimaryButton';

function dataTypeLabel(dt: DataType): string {
  switch (dt) {
    case 'Foundation': return 'USDA Foundation Database';
    case 'SR Legacy': return 'USDA SR Legacy';
    case 'Branded': return 'USDA Branded';
    case 'off': return 'Open Food Facts';
    case 'manual': return 'Manual Entry';
    case 'scan': return 'Scan';
    case 'describe': return 'Estimate';
    default: return 'Unknown Source';
  }
}

interface SingleFoodReviewStateProps {
  food: FoodResult | null;
  onLogComplete: (info: { logId: number; meal: MealType }) => void;
}

type UnitMode = 'servings' | 'grams';

export default function SingleFoodReviewState({ food, onLogComplete }: SingleFoodReviewStateProps) {
  const hasServing = useMemo(() => !!(food?.servingSizeGrams && food.servingSizeGrams > 0), [food]);

  const [mode, setMode] = useState<UnitMode>(hasServing ? 'servings' : 'grams');
  const [servings, setServings] = useState(1);
  const [gramsInput, setGramsInput] = useState('');
  const [meal, setMeal] = useState<MealType>(() => defaultMealForNow());
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    if (!food) return;
    if (food.servingSizeGrams && food.servingSizeGrams > 0) {
      setMode('servings');
      setServings(1);
      setGramsInput(String(Math.round(food.servingSizeGrams)));
    } else {
      setMode('grams');
      setGramsInput('150');
      setServings(1);
    }
    setMeal(defaultMealForNow());
  }, [food]);

  const gramsNum = useMemo(() => {
    if (mode === 'servings' && food?.servingSizeGrams) return servings * food.servingSizeGrams;
    const n = parseFloat(gramsInput);
    return isNaN(n) || n <= 0 ? 0 : n;
  }, [mode, servings, gramsInput, food]);

  const macros = useMemo(() => {
    if (!food || gramsNum <= 0) return null;
    const ratio = gramsNum / 100;
    return {
      calories: food.caloriesPer100g != null ? Math.round(food.caloriesPer100g * ratio) : 0,
      protein: food.proteinPer100g != null ? Math.round(food.proteinPer100g * ratio * 10) / 10 : 0,
      carbs: food.carbsPer100g != null ? Math.round(food.carbsPer100g * ratio * 10) / 10 : 0,
      fat: food.fatPer100g != null ? Math.round(food.fatPer100g * ratio * 10) / 10 : 0,
    };
  }, [food, gramsNum]);

  const handleModeChange = useCallback((newMode: UnitMode) => {
    if (newMode === mode) return;
    if (newMode === 'servings' && food?.servingSizeGrams) {
      setServings(Math.round((gramsNum / food.servingSizeGrams) * 10) / 10 || 1);
    } else {
      setGramsInput(String(Math.round(gramsNum) || 150));
    }
    setMode(newMode);
  }, [mode, gramsNum, food]);

  const handleServingChange = useCallback((delta: number) => {
    setServings((prev) => Math.max(0.25, Math.round((prev + delta) * 10) / 10));
  }, []);

  const handleLog = useCallback(async () => {
    if (!food || !macros || gramsNum <= 0) return;
    setLogging(true);
    try {
      const logId = await insertFoodLog({
        log_date: todayISO(), name: food.name, source: food.source, source_food_id: food.sourceFoodId,
        meal, brand: food.brand, data_type: food.dataType, preparation: food.preparation,
        grams_logged: gramsNum, serving_size_g: food.servingSizeGrams, serving_label: food.servingLabel,
        calories_per_100g: food.caloriesPer100g, protein_g_per_100g: food.proteinPer100g,
        carbs_g_per_100g: food.carbsPer100g, fat_g_per_100g: food.fatPer100g,
        calories: macros.calories, protein_g: macros.protein, carbs_g: macros.carbs, fat_g: macros.fat,
      });
      onLogComplete({ logId, meal });
    } finally { setLogging(false); }
  }, [food, macros, gramsNum, meal, onLogComplete]);

  if (!food) return null;

  return (
    <BottomSheetScrollView className="flex-1 px-5" contentContainerClassName="pb-8 gap-5" keyboardShouldPersistTaps="handled">
      <View className="flex-row justify-between items-start pt-2">
        <View className="flex-1 mr-3">
          <Text className="text-m3-on-surface font-bold text-base leading-5" numberOfLines={2}>{food.name}</Text>
          {!!food.brand && <Text className="text-m3-on-surface-variant text-xs mt-0.5">{food.brand}</Text>}
          <Text className="text-m3-on-surface-variant text-[10px] mt-0.5">
            {dataTypeLabel(food.dataType)}{food.preparation && ` · ${food.preparation}`}
          </Text>
        </View>
        <View className="bg-m3-surface-container-high px-3 py-1 rounded-full">
          <Text className="text-m3-on-surface num-tabular text-[10px] font-semibold">
            {food.caloriesPer100g != null ? `${Math.round(food.caloriesPer100g)} kcal / 100g` : '---'}
          </Text>
        </View>
      </View>

      {hasServing && (
        <View className="flex-row bg-m3-surface-container-high rounded-full p-1.5">
          <Pressable onPress={() => handleModeChange('servings')} accessibilityRole="button" accessibilityState={{ selected: mode === 'servings' }}
            className={`flex-1 py-3.5 rounded-full items-center ${mode === 'servings' ? 'bg-m3-surface-container' : ''}`}>
            <Text className={`text-xs font-semibold ${mode === 'servings' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>Servings</Text>
          </Pressable>
          <Pressable onPress={() => handleModeChange('grams')} accessibilityRole="button" accessibilityState={{ selected: mode === 'grams' }}
            className={`flex-1 py-3.5 rounded-full items-center ${mode === 'grams' ? 'bg-m3-surface-container' : ''}`}>
            <Text className={`text-xs font-semibold ${mode === 'grams' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>Grams</Text>
          </Pressable>
        </View>
      )}

      <View className="bg-m3-surface-container rounded-2xl px-4 py-4 gap-3">
        <Text className="text-[10px] font-semibold text-m3-on-surface-variant uppercase tracking-wider">Quantity</Text>
        {mode === 'servings' ? (
          <View className="flex-row items-center justify-center gap-5">
            <Pressable onPress={() => handleServingChange(-0.5)} accessibilityRole="button" accessibilityLabel="Decrease servings"
              className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60">
              <MaterialIcons name="remove" size={22} color="#e2e2e9" />
            </Pressable>
            <View className="items-center min-w-[70px]">
              <Text className="text-m3-on-surface font-bold text-3xl num-tabular leading-9">
                {servings % 1 === 0 ? servings.toFixed(0) : servings.toFixed(1)}
              </Text>
              <Text className="text-m3-on-surface-variant text-[10px] mt-1 text-center">
                {food.servingLabel ? `${food.servingLabel}` : `${Math.round(food.servingSizeGrams!)}g`}
                {mode === 'servings' && food.servingSizeGrams ? ` (${Math.round(servings * food.servingSizeGrams)}g total)` : ''}
              </Text>
            </View>
            <Pressable onPress={() => handleServingChange(0.5)} accessibilityRole="button" accessibilityLabel="Increase servings"
              className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60">
              <MaterialIcons name="add" size={22} color="#e2e2e9" />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <BottomSheetTextInput
                value={gramsInput}
                onChangeText={setGramsInput}
                keyboardType="numeric"
                returnKeyType="done"
                className="bg-m3-surface-container-high text-m3-on-surface num-tabular font-bold text-lg rounded-xl px-4 py-3 border border-m3-outline-variant/50 text-center"
              />
            </View>
            <Text className="text-m3-on-surface-variant text-sm font-semibold">grams</Text>
          </View>
        )}
      </View>

      {macros && (
        <View className="bg-m3-surface-container rounded-2xl p-4 gap-2">
          <Text className="text-[10px] font-semibold text-m3-on-surface-variant uppercase tracking-wider">Calculated Nutrition</Text>
          <MacroChipGroup calories={macros.calories} protein={macros.protein} carbs={macros.carbs} fat={macros.fat} />
        </View>
      )}

      <MealSelector value={meal} onChange={setMeal} />

      <PrimaryButton title="Log Entry" icon="check" iconPosition="left" onPress={handleLog} loading={logging} disabled={!macros || gramsNum <= 0} />
    </BottomSheetScrollView>
  );
}
