import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

import { MealType, insertFoodLog } from '../../db/database';
import { DataType, FoodResult } from '../../services/foodSearch';
import { defaultMealForNow, todayISO } from '../../utils/calculations';
import MealSelector from '../MealSelector';
import MacroChipGroup from '../MacroChipGroup';
import PortionStepper from '../PortionStepper';
import PrimaryButton from '../PrimaryButton';

function dataTypeLabel(dt: DataType): string {
  switch (dt) {
    case 'Foundation':
      return 'USDA Foundation Database';
    case 'SR Legacy':
      return 'USDA SR Legacy';
    case 'Branded':
      return 'USDA Branded';
    case 'off':
      return 'Open Food Facts';
    case 'manual':
      return 'Manual Entry';
    case 'scan':
      return 'Scan';
    case 'describe':
      return 'Estimate';
    default:
      return 'Unknown Source';
  }
}

interface SingleFoodReviewStateProps {
  food: FoodResult | null;
  onLogComplete: (info: { logId: number; meal: MealType; name: string }) => void;
  initialMeal?: MealType | null;
}

type UnitMode = 'servings' | 'grams' | 'ml';

export default function SingleFoodReviewState({
  food,
  onLogComplete,
  initialMeal,
}: SingleFoodReviewStateProps) {
  const hasServing = useMemo(
    () => !!(food?.servingSizeGrams && food.servingSizeGrams > 0),
    [food],
  );
  const showMl = useMemo(
    () => !!(food?.servingLabel && /ml\b/i.test(food.servingLabel)),
    [food],
  );

  const defaultMode: UnitMode = useMemo(() => {
    if (showMl) return 'ml';
    if (hasServing) return 'servings';
    return 'grams';
  }, [hasServing, showMl]);

  const [mode, setMode] = useState<UnitMode>(defaultMode);
  const [servings, setServings] = useState(1);
  const [gramsInput, setGramsInput] = useState('');
  const [meal, setMeal] = useState<MealType>(() => initialMeal ?? defaultMealForNow());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!food) return;
    setMode(defaultMode);
    if (food.servingSizeGrams && food.servingSizeGrams > 0) {
      setServings(1);
      setGramsInput(String(Math.round(food.servingSizeGrams)));
    } else {
      setServings(1);
      setGramsInput(String(Math.round(food.estimatedGrams ?? 150)));
    }
    setMeal(initialMeal ?? defaultMealForNow());
  }, [food, defaultMode, initialMeal]);

  const gramsNum = useMemo(() => {
    if (mode === 'servings' && food?.servingSizeGrams)
      return Math.round(servings * food.servingSizeGrams);
    const n = parseFloat(gramsInput);
    return isNaN(n) || n <= 0 ? 0 : n;
  }, [mode, servings, gramsInput, food]);

  const macros = useMemo(() => {
    if (!food || gramsNum <= 0) return null;
    const ratio = gramsNum / 100;
    return {
      calories:
        food.caloriesPer100g != null
          ? Math.round(food.caloriesPer100g * ratio)
          : 0,
      protein:
        food.proteinPer100g != null
          ? Math.round(food.proteinPer100g * ratio * 10) / 10
          : 0,
      carbs:
        food.carbsPer100g != null
          ? Math.round(food.carbsPer100g * ratio * 10) / 10
          : 0,
      fat:
        food.fatPer100g != null
          ? Math.round(food.fatPer100g * ratio * 10) / 10
          : 0,
    };
  }, [food, gramsNum]);

  const handleModeChange = useCallback(
    (newMode: UnitMode) => {
      if (newMode === mode) return;
      if (newMode === 'servings' && food?.servingSizeGrams) {
        setServings(
          Math.round((gramsNum / food.servingSizeGrams) * 10) / 10 || 1,
        );
      } else {
        setGramsInput(String(Math.round(gramsNum) || 150));
      }
      setMode(newMode);
    },
    [mode, gramsNum, food],
  );

  const handleServingsDelta = useCallback((delta: number) => {
    setServings((prev) =>
      Math.max(0.25, Math.round((prev + delta) * 10) / 10),
    );
  }, []);

  const handleServingsSet = useCallback((t: string) => {
    const v = parseFloat(t);
    if (!isNaN(v) && v > 0) setServings(Math.round(v * 10) / 10);
  }, []);

  const handleGramsSet = useCallback((t: string) => {
    setGramsInput(t);
  }, []);

  const handleLog = useCallback(async () => {
    if (!food || !macros || gramsNum <= 0) return;
    setLogError(null);
    setLogging(true);
    try {
      const logId = await insertFoodLog({
        log_date: todayISO(),
        name: food.name,
        source: food.source,
        source_food_id: food.sourceFoodId,
        meal,
        brand: food.brand,
        data_type: food.dataType,
        preparation: food.preparation,
        grams_logged: gramsNum,
        serving_size_g: food.servingSizeGrams,
        serving_label: food.servingLabel,
        calories_per_100g: food.caloriesPer100g,
        protein_g_per_100g: food.proteinPer100g,
        carbs_g_per_100g: food.carbsPer100g,
        fat_g_per_100g: food.fatPer100g,
        calories: macros.calories,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fat_g: macros.fat,
      });
      onLogComplete({ logId, meal, name: food.name });
    } catch (e) {
      console.error('[FoodReview] save failed', e);
      setLogError("Couldn't save this entry. Try again.");
    } finally {
      setLogging(false);
    }
  }, [food, macros, gramsNum, meal, onLogComplete]);

  if (!food) return null;

  return (
    <View className="flex-1">
      <View className="px-5 pt-3 gap-3">
        <Animated.View
          entering={reducedMotion ? undefined : FadeInUp.duration(180)}
          className="gap-3"
        >
          <View className="flex-row justify-between items-start">
            <View className="flex-1 mr-3">
              <Text
                className="text-m3-on-surface font-bold text-base leading-5"
                numberOfLines={2}
              >
                {food.name}
              </Text>
              {food.brand ? (
                <Text className="text-m3-on-surface-variant text-xs mt-0.5">
                  {food.brand}
                </Text>
              ) : null}
               <Text className="text-m3-on-surface-variant text-xs mt-0.5">
                 {dataTypeLabel(food.dataType)}
                {food.preparation ? ` · ${food.preparation}` : ''}
              </Text>
            </View>
            <View className="bg-m3-surface-container-high px-3 py-1 rounded-full">
              <Text className="text-m3-on-surface tabular-nums text-xs font-semibold">
                {food.caloriesPer100g != null
                  ? `${Math.round(food.caloriesPer100g)} kcal / 100g`
                  : '---'}
              </Text>
            </View>
          </View>

          <PortionStepper
            unitMode={mode}
            servings={servings}
            grams={gramsNum}
            servingSizeGrams={food.servingSizeGrams ?? null}
            servingLabel={food.servingLabel ?? null}
            hasServing={hasServing}
            showMl={showMl}
            onModeChange={handleModeChange}
            onServingsDelta={handleServingsDelta}
            onServingsSet={handleServingsSet}
            onGramsSet={handleGramsSet}
          />

          {macros && (
            <>
              <Text className="text-m3-on-surface text-4xl font-bold tabular-nums text-center">
                {macros.calories}
                <Text className="text-m3-on-surface-variant text-sm font-medium">
                  {' '}
                  kcal
                </Text>
              </Text>
              <View className="w-full">
                <MacroChipGroup
                  protein={macros.protein}
                  carbs={macros.carbs}
                  fat={macros.fat}
                />
              </View>
            </>
          )}
        </Animated.View>
      </View>

      <View
        className="px-5 pt-3 pb-3 gap-3 border-t border-m3-outline-variant/30"
      >
        <MealSelector value={meal} onChange={setMeal} />
        <PrimaryButton
          title="Log Entry"
          icon="check"
          iconPosition="left"
          onPress={handleLog}
          loading={logging}
          disabled={!macros || gramsNum <= 0 || !food}
        />
        {logError && (
          <Text className="text-m3-error text-xs font-medium" accessibilityLiveRegion="assertive">
            {logError}
          </Text>
        )}
      </View>
    </View>
  );
}
