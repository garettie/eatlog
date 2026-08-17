import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

import { MealType, insertFoodLog } from '../../db/database';
import { DataType, FoodResult } from '../../services/foodSearch';
import { todayISO } from '../../utils/calendar';
import { defaultMealForNow } from '../../utils/calculations';
import {
  buildFoodAmountOptions,
  initialPortionSelection,
  selectFoodAmount,
  selectedServing,
  servingsForSelection,
  setGramsAmount,
  setPortionMode,
  setServingAmount,
  type PortionMode,
  type PortionSelection,
} from '../../utils/portionSelection';
import MealSelector from '../MealSelector';
import MacroChipGroup from '../MacroChipGroup';
import PortionStepper from '../PortionStepper';
import PrimaryButton from '../PrimaryButton';
import SheetBackButton from './SheetBackButton';

function dataTypeLabel(dt: DataType): string {
  switch (dt) {
    case 'Survey (FNDDS)':
      return 'USDA';
    case 'Foundation':
      return 'USDA';
    case 'SR Legacy':
      return 'USDA';
    case 'Branded':
      return 'USDA';
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
  onLogComplete: (info: { logId: number; meal: MealType; name: string; calories: number; logDate: string }) => void;
  initialMeal?: MealType | null;
  /** Diary date to write to (backfill); null = today. */
  logDate?: string | null;
  onBack: () => void;
}

export default function SingleFoodReviewState({
  food,
  onLogComplete,
  initialMeal,
  logDate,
  onBack,
}: SingleFoodReviewStateProps) {
  const [selection, setSelection] = useState<PortionSelection>(() =>
    food
      ? initialPortionSelection(food)
      : { grams: 100, mode: 'grams', selectedServingId: null, selectedAmountId: 'reference-100g' }
  );
  const amountOptions = useMemo(() => food ? buildFoodAmountOptions(food) : [], [food]);
  const serving = useMemo(
    () => food ? selectedServing(food, selection) : null,
    [food, selection],
  );
  const servings = servingsForSelection(selection, serving);
  const gramsNum = selection.grams;
  const [portionValid, setPortionValid] = useState(true);
  const [meal, setMeal] = useState<MealType>(() => initialMeal ?? defaultMealForNow());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!food) return;
    setSelection(initialPortionSelection(food));
    setPortionValid(true);
    setMeal(initialMeal ?? defaultMealForNow());
  }, [food, initialMeal]);

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
    (mode: PortionMode) => {
      setSelection((current) => setPortionMode(current, mode, serving));
    },
    [serving],
  );


  const handleServingsSet = useCallback((value: number) => {
    setSelection((current) =>
      setServingAmount(current, value, food ? selectedServing(food, current) : null)
    );
  }, [food]);

  const handleGramsSet = useCallback((value: number) => {
    setSelection((current) => setGramsAmount(current, value));
  }, []);

  const handleLog = useCallback(async () => {
    if (!food || !macros || gramsNum <= 0 || !portionValid) return;
    setLogError(null);
    setLogging(true);
    try {
      const targetLogDate = logDate ?? todayISO();
      const logId = await insertFoodLog({
        log_date: targetLogDate,
        name: food.name,
        source: food.source,
        source_food_id: food.sourceFoodId,
        meal,
        brand: food.brand,
        data_type: food.dataType,
        preparation: food.preparation,
        grams_logged: gramsNum,
        serving_size_g: serving?.grams ?? null,
        serving_label: serving?.label ?? null,
        calories_per_100g: food.caloriesPer100g,
        protein_g_per_100g: food.proteinPer100g,
        carbs_g_per_100g: food.carbsPer100g,
        fat_g_per_100g: food.fatPer100g,
        calories: macros.calories,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fat_g: macros.fat,
      });
      onLogComplete({ logId, meal, name: food.name, calories: macros.calories, logDate: targetLogDate });
    } catch (e) {
      console.error('[FoodReview] save failed', e);
      setLogError("Couldn't save this entry. Try again.");
    } finally {
      setLogging(false);
    }
  }, [food, macros, gramsNum, portionValid, meal, onLogComplete, logDate, serving]);

  if (!food) return null;

  return (
    <View className="flex-1">
      <View className="px-5 pt-3 gap-3">
        <View className="flex-row items-center gap-1">
          <SheetBackButton onPress={onBack} />
          <Text className="text-m3-on-surface font-bold text-base">Review food</Text>
        </View>
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
                {food.history ? 'Your history' : dataTypeLabel(food.dataType)}
                {food.preparation ? ` · ${food.preparation}` : ''}
              </Text>
            </View>
            <View className="bg-m3-surface-container-high px-3 py-1 rounded-full">
              <Text className="text-m3-on-surface tabular-nums text-xs font-semibold">
                {food.caloriesPer100g != null
                  ? `${Math.round(food.caloriesPer100g)} kcal / 100 g`
                  : '---'}
              </Text>
            </View>
          </View>

          <PortionStepper
            unitMode={selection.mode}
            servings={servings}
            grams={gramsNum}
            servingSizeGrams={serving?.grams ?? null}
            servingLabel={serving?.label ?? null}
            amountOptions={amountOptions}
            selectedAmountId={selection.selectedAmountId}
            onAmountChange={(option) => {
              setSelection((current) => selectFoodAmount(current, option));
              setPortionValid(true);
            }}
            onModeChange={handleModeChange}
            onServingsSet={handleServingsSet}
            onGramsSet={handleGramsSet}
            onValidityChange={setPortionValid}
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
          disabled={!macros || gramsNum <= 0 || !food || !portionValid}
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
