import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';

import { MealType, insertFoodLog } from '../../db/database';
import { DataType, FoodResult } from '../../services/foodSearch';
import { isoFromDate, parseLocalISO } from '../../utils/calendar';
import { defaultMealForNow } from '../../utils/calculations';
import { useToday } from '../../hooks/useToday';
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
import MacroSummaryCard from '../MacroSummaryCard';
import PortionStepper from '../PortionStepper';
import PrimaryButton from '../PrimaryButton';
import DateSelector from '../DateSelector';
import SheetBackButton from './SheetBackButton';
import { useDiscardGuardContext } from './useDiscardGuard';
import { M3 } from '../../theme/tokens';
import { useResponsiveLayout } from '../../theme/layout';

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
  const [dateSelectorVisible, setDateSelectorVisible] = useState(false);
  const [logDateOverride, setLogDateOverride] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const loggedRef = useRef(false);
  const discardGuard = useDiscardGuardContext();

  const reducedMotion = useReducedMotion();
  const { isNarrow } = useResponsiveLayout();
  const today = useToday();
  const effectiveLogDate = logDateOverride ?? logDate ?? today;
  const compactLogDateLabel =
    effectiveLogDate === today
      ? 'Today'
      : parseLocalISO(effectiveLogDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

  useEffect(() => {
    if (!food) return;
    setSelection(initialPortionSelection(food));
    setPortionValid(true);
    setMeal(initialMeal ?? defaultMealForNow());
    setLogDateOverride(null);
    dirtyRef.current = false;
    loggedRef.current = false;
  }, [food, initialMeal]);

  useEffect(() => {
    const unregister = discardGuard.register(
      () => dirtyRef.current && !loggedRef.current,
      () => {
        dirtyRef.current = false;
        loggedRef.current = false;
      },
    );
    return unregister;
  }, [discardGuard]);

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
      dirtyRef.current = true;
      setSelection((current) => setPortionMode(current, mode, serving));
    },
    [serving],
  );


  const handleServingsSet = useCallback((value: number) => {
    dirtyRef.current = true;
    setSelection((current) =>
      setServingAmount(current, value, food ? selectedServing(food, current) : null)
    );
  }, [food]);

  const handleGramsSet = useCallback((value: number) => {
    dirtyRef.current = true;
    setSelection((current) => setGramsAmount(current, value));
  }, []);

  const handleLog = useCallback(async () => {
    if (!food || !macros || gramsNum <= 0 || !portionValid) return;
    setLogError(null);
    setLogging(true);
    try {
      const targetLogDate = effectiveLogDate;
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
      loggedRef.current = true;
      onLogComplete({ logId, meal, name: food.name, calories: macros.calories, logDate: targetLogDate });
    } catch (e) {
      console.error('[FoodReview] save failed', e);
      setLogError("Couldn't save this entry. Try again.");
    } finally {
      setLogging(false);
    }
  }, [food, macros, gramsNum, portionValid, meal, onLogComplete, effectiveLogDate, serving]);

  if (!food) return null;

  return (
    <View className="flex-1">
      <View className="px-5 pt-2 pb-3">
        <View className="flex-row items-center gap-1">
          <SheetBackButton onPress={onBack} />
          <Text accessibilityRole="header" className="text-m3-on-surface font-bold text-base">Review food</Text>
        </View>
      </View>
      <BottomSheetScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-2 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          entering={reducedMotion ? undefined : FadeInUp.duration(180)}
          className="gap-6"
        >
          <View className="gap-3">
            <View className="gap-1">
              <Text
                className="text-m3-on-surface font-bold text-xl"
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
            <View className="self-start bg-m3-surface-container-high px-3 py-1 rounded-full">
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
              dirtyRef.current = true;
              setSelection((current) => selectFoodAmount(current, option));
              setPortionValid(true);
            }}
            onModeChange={handleModeChange}
            onServingsSet={handleServingsSet}
            onGramsSet={handleGramsSet}
            onValidityChange={setPortionValid}
          />

          {macros && (
            <MacroSummaryCard
              variant="summary"
              calories={macros.calories}
              protein={macros.protein}
              carbs={macros.carbs}
              fat={macros.fat}
            />
          )}
        </Animated.View>
      </BottomSheetScrollView>

      <View
        className="shrink-0 px-5 pt-4 pb-3 gap-3 border-t border-m3-outline-variant/30"
      >
        <View className={isNarrow ? 'gap-2' : 'flex-row items-center gap-2'}>
          <Pressable
            onPress={() => setDateSelectorVisible(true)}
            disabled={logging}
            accessibilityRole="button"
            accessibilityLabel={`Log date, ${compactLogDateLabel}`}
            accessibilityState={{ disabled: logging }}
            className={`${isNarrow ? 'self-start' : 'min-w-[88px]'} min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high px-3 border border-m3-outline-variant/30 active:opacity-70 disabled:opacity-50`}
          >
            <MaterialIcons name="event" size={17} color={M3.onSurfaceVariant} />
            <Text
              numberOfLines={1}
              className="text-m3-on-surface text-xs font-semibold"
            >
              {compactLogDateLabel}
            </Text>
          </Pressable>
          <View className={isNarrow ? 'w-full' : 'flex-1 min-w-0'}>
            <MealSelector
              value={meal}
              compact={!isNarrow}
              disabled={logging}
              onChange={(nextMeal) => {
                dirtyRef.current = true;
                setMeal(nextMeal);
              }}
            />
          </View>
        </View>
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

      <DateSelector
        visible={dateSelectorVisible}
        value={parseLocalISO(effectiveLogDate)}
        minimumDate={new Date(1900, 0, 1)}
        showTodayAction
        onCancel={() => setDateSelectorVisible(false)}
        onConfirm={(date) => {
          setDateSelectorVisible(false);
          const nextDate = isoFromDate(date);
          if (nextDate === effectiveLogDate) return;
          dirtyRef.current = true;
          setLogDateOverride(nextDate);
        }}
      />
    </View>
  );
}
