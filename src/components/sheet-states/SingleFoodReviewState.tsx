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

type UnitMode = 'servings' | 'grams' | 'ml';

export default function SingleFoodReviewState({
  food,
  onLogComplete,
  initialMeal,
  logDate,
  onBack,
}: SingleFoodReviewStateProps) {
  const defaultPortion = useMemo(() => food?.portions.find((portion) => portion.id === food.defaultPortionId)
    ?? food?.portions[0] ?? null, [food]);
  const [selectedPortionId, setSelectedPortionId] = useState(defaultPortion?.id ?? '100-g');
  const selectedPortion = useMemo(() => food?.portions.find((portion) => portion.id === selectedPortionId)
    ?? defaultPortion, [defaultPortion, food, selectedPortionId]);
  const hasServing = !!selectedPortion;
  const showMl = useMemo(
    () => !!(selectedPortion?.label && /ml\b/i.test(selectedPortion.label)),
    [selectedPortion],
  );

  const [mode, setMode] = useState<UnitMode>(() => showMl ? 'ml' : hasServing ? 'servings' : 'grams');
  const [servings, setServings] = useState(1);
  const [gramsInput, setGramsInput] = useState('');
  const [meal, setMeal] = useState<MealType>(() => initialMeal ?? defaultMealForNow());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!food) return;
    const portion = food.portions.find((candidate) => candidate.id === food.defaultPortionId) ?? food.portions[0];
    setSelectedPortionId(portion?.id ?? '100-g');
    setMode(portion?.label && /ml\b/i.test(portion.label) ? 'ml' : portion ? 'servings' : 'grams');
    if (portion) {
      setServings(1);
      setGramsInput(String(Math.round(portion.grams)));
    } else {
      setServings(1);
      setGramsInput('100');
    }
    setMeal(initialMeal ?? defaultMealForNow());
  }, [food, initialMeal]);

  const gramsNum = useMemo(() => {
    if (mode === 'servings' && selectedPortion)
      return Math.round(servings * selectedPortion.grams);
    const n = parseFloat(gramsInput);
    return isNaN(n) || n <= 0 ? 0 : n;
  }, [mode, servings, gramsInput, selectedPortion]);

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
      if (newMode === 'servings' && selectedPortion) {
        setServings(
          Math.round((gramsNum / selectedPortion.grams) * 10) / 10 || 1,
        );
      } else {
        setGramsInput(String(Math.round(gramsNum) || 100));
      }
      setMode(newMode);
    },
    [mode, gramsNum, selectedPortion],
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
        serving_size_g: selectedPortion?.grams ?? null,
        serving_label: selectedPortion?.label ?? null,
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
  }, [food, macros, gramsNum, meal, onLogComplete, logDate, selectedPortion]);

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
                  ? `${Math.round(food.caloriesPer100g)} kcal / 100g`
                  : '---'}
              </Text>
            </View>
          </View>

          <PortionStepper
            unitMode={mode}
            servings={servings}
            grams={gramsNum}
            servingSizeGrams={selectedPortion?.grams ?? null}
            servingLabel={selectedPortion?.label ?? null}
            hasServing={hasServing}
            showMl={showMl}
            portions={food.portions}
            selectedPortionId={selectedPortion?.id}
            onPortionChange={(portion) => {
              setSelectedPortionId(portion.id);
              setServings(1);
              setGramsInput(String(Math.round(portion.grams)));
              setMode(/ml\b/i.test(portion.label) ? 'ml' : 'servings');
            }}
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
