import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import {
  getLoggedMeals,
  insertFoodLog,
  type LoggedMeal,
  type MealType,
  setFoodPinned,
} from '../../db/database';
import { describeMeal, type DescribeResult } from '../../services/foodScan';
import { loadFoodDetails, type FoodResult } from '../../services/foodSearch';
import { createQuickLogInput } from '../../services/foodSearchCore';
import { useFoodSearchController } from '../../hooks/useFoodSearchController';
import { defaultMealForNow, todayISO } from '../../utils/calculations';
import { M3 } from '../../theme/tokens';
import FoodSearchResultRow from '../FoodSearchResultRow';
import NutritionCard from '../NutritionCard';
import SheetBackButton from './SheetBackButton';

interface SearchInputStateProps {
  autoFocus: boolean;
  onSelectFood: (food: FoodResult) => void;
  onSelectMeal: (meal: LoggedMeal) => void;
  onManualEntry: () => void;
  onEstimateResult: (result: DescribeResult) => void;
  onQuickLogComplete: (info: { logId: number; meal: MealType; name: string; calories: number; logDate: string }) => void;
  initialMeal?: MealType | null;
  logDate?: string | null;
  onBack: () => void;
}

type MixedEntry =
  | { kind: 'food'; key: string; pinned: number; loggedAt: string; food: FoodResult }
  | { kind: 'meal'; key: string; pinned: number; loggedAt: string; meal: LoggedMeal };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider px-1 pt-2">{children}</Text>;
}

export default function SearchInputState({
  autoFocus,
  onSelectFood,
  onSelectMeal,
  onManualEntry,
  onEstimateResult,
  onQuickLogComplete,
  initialMeal,
  logDate,
  onBack,
}: SearchInputStateProps) {
  const search = useFoodSearchController();
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [mealLoading, setMealLoading] = useState(true);
  const [mealError, setMealError] = useState(false);
  const [quickLoggingId, setQuickLoggingId] = useState<string | null>(null);
  const [quickLogError, setQuickLogError] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const mealSequence = useRef(0);

  useEffect(() => {
    const sequence = ++mealSequence.current;
    setMealLoading(true);
    setMealError(false);
    void getLoggedMeals(search.query).then((items) => {
      if (sequence === mealSequence.current) setMeals(items);
    }).catch((error) => {
      console.error('[FoodSearch] meals failed', error);
      if (sequence === mealSequence.current) {
        setMeals([]);
        setMealError(true);
      }
    }).finally(() => {
      if (sequence === mealSequence.current) setMealLoading(false);
    });
  }, [search.query]);

  const handleFoodPress = useCallback(async (food: FoodResult) => {
    Keyboard.dismiss();
    if (food.source !== 'usda' || food.history) {
      onSelectFood(food);
      return;
    }
    setDetailLoadingId(food.id);
    try {
      onSelectFood(await loadFoodDetails(food));
    } catch {
      onSelectFood(food);
    } finally {
      setDetailLoadingId(null);
    }
  }, [onSelectFood]);

  const handleToggleFoodPin = useCallback(async (food: FoodResult) => {
    if (!food.history) return;
    const nextPinned = !food.isPinned;
    const keys = nextPinned
      ? [food.history.pinKey]
      : [food.history.pinKey, ...food.history.legacyPinKeys];
    await Promise.all([...new Set(keys)].map((key) => setFoodPinned(key, nextPinned))).catch((error) => {
      console.error('[FoodSearch] food pin failed', error);
    });
    search.refreshLocal();
  }, [search]);

  const handleToggleMealPin = useCallback(async (meal: LoggedMeal) => {
    const nextPinned = meal.is_pinned !== 1;
    setMeals((current) => current.map((item) => item.food_key === meal.food_key
      ? { ...item, is_pinned: nextPinned ? 1 : 0 }
      : item));
    try {
      await setFoodPinned(meal.food_key, nextPinned);
    } catch (error) {
      console.error('[FoodSearch] meal pin failed', error);
      setMeals((current) => current.map((item) => item.food_key === meal.food_key
        ? { ...item, is_pinned: meal.is_pinned }
        : item));
    }
  }, []);

  const handleQuickLog = useCallback(async (food: FoodResult) => {
    if (!food.history || quickLoggingId) return;
    setQuickLoggingId(food.id);
    setQuickLogError(null);
    try {
      const targetLogDate = logDate ?? todayISO();
      const meal = initialMeal ?? defaultMealForNow();
      const input = createQuickLogInput(food, targetLogDate, meal);
      const logId = await insertFoodLog(input);
      onQuickLogComplete({ logId, meal, name: food.name, calories: food.history.calories, logDate: targetLogDate });
    } catch (error) {
      console.error('[FoodSearch] quick log failed', error);
      setQuickLogError("Couldn't quick log this food. Try again.");
    } finally {
      setQuickLoggingId(null);
    }
  }, [initialMeal, logDate, onQuickLogComplete, quickLoggingId]);

  const handleEstimate = useCallback(async () => {
    const query = search.query.trim();
    if (!query || estimating) return;
    setEstimating(true);
    setEstimateError(null);
    const result = await describeMeal(query);
    setEstimating(false);
    if (!result.ok) {
      setEstimateError(result.message);
      return;
    }
    Keyboard.dismiss();
    onEstimateResult(result.result);
  }, [estimating, onEstimateResult, search.query]);

  const mixedEntries = useMemo<MixedEntry[]>(() => [
    ...search.personalResults.map((food) => ({
      kind: 'food' as const,
      key: `food:${food.id}`,
      pinned: food.isPinned ? 1 : 0,
      loggedAt: food.history?.lastLoggedAt ?? '',
      food,
    })),
    ...meals.map((meal) => ({
      kind: 'meal' as const,
      key: `meal:${meal.meal_id}`,
      pinned: meal.is_pinned,
      loggedAt: meal.last_logged_at,
      meal,
    })),
  ].sort((first, second) => second.pinned - first.pinned || second.loggedAt.localeCompare(first.loggedAt)), [meals, search.personalResults]);

  const foodRow = (food: FoodResult) => (
    <FoodSearchResultRow
      key={food.id}
      food={food}
      onPress={() => void handleFoodPress(food)}
      onTogglePin={food.history ? () => void handleToggleFoodPin(food) : undefined}
      onQuickLog={food.history ? () => void handleQuickLog(food) : undefined}
      quickLogging={quickLoggingId === food.id || detailLoadingId === food.id}
    />
  );

  const mealRow = (meal: LoggedMeal) => (
    <NutritionCard
      key={meal.meal_id}
      name={meal.meal_name}
      photoUri={meal.photo_uri}
      secondaryText={`Meal · ${meal.component_count} ${meal.component_count === 1 ? 'item' : 'items'}`}
      calories={meal.total_calories}
      protein={meal.total_protein}
      carbs={meal.total_carbs}
      fat={meal.total_fat}
      onPress={() => onSelectMeal(meal)}
      accessibilityHint="Opens meal review"
      action={(
        <Pressable
          onPress={() => void handleToggleMealPin(meal)}
          accessibilityRole="button"
          accessibilityLabel={meal.is_pinned ? `Unpin ${meal.meal_name}` : `Pin ${meal.meal_name}`}
          className="absolute right-2 top-2 w-12 h-12 items-center justify-center active:opacity-60"
        >
          <MaterialIcons name={meal.is_pinned ? 'favorite' : 'favorite-border'} size={20} color={meal.is_pinned ? M3.error : M3.onSurfaceVariant} />
        </Pressable>
      )}
    />
  );

  const trimmedQuery = search.query.trim();
  const noResults = trimmedQuery.length > 0
    && !search.localLoading
    && !mealLoading
    && search.personalResults.length === 0
    && meals.length === 0
    && search.remoteResults.length === 0
    && search.remoteState !== 'loading';

  return (
    <View className="flex-1">
      <View className="bg-m3-surface-container px-5 pt-2 pb-3">
        <View className="flex-row items-center gap-1 mb-1">
          <SheetBackButton onPress={onBack} />
          <Text className="text-m3-on-surface font-bold text-base">Food search</Text>
        </View>
        <View className="flex-row items-center bg-m3-surface-container-high rounded-full px-4 py-2 border border-m3-outline-variant/30">
          <MaterialIcons name="search" size={18} color={M3.onSurfaceVariant} />
          <BottomSheetTextInput
            value={search.query}
            onChangeText={(value) => { search.setQuery(value); setEstimateError(null); }}
            accessibilityLabel="Search foods"
            placeholder="Search foods…"
            placeholderTextColor={M3.placeholder}
            className="flex-1 text-m3-on-surface text-sm ml-2 font-medium"
            autoFocus={autoFocus}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => { search.submit(); Keyboard.dismiss(); }}
          />
          {search.query.length > 0 ? (
            <Pressable onPress={() => search.setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" className="w-12 h-12 items-center justify-center -mr-3 -my-3">
              <MaterialIcons name="close" size={18} color={M3.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <BottomSheetScrollView contentContainerClassName="px-5 pb-6 gap-2" keyboardShouldPersistTaps="handled">
        {!trimmedQuery ? (
          <>
            <SectionTitle>Pinned and recent</SectionTitle>
            {mixedEntries.map((entry) => entry.kind === 'food' ? foodRow(entry.food) : mealRow(entry.meal))}
            {((search.localLoading || mealLoading) && mixedEntries.length === 0) ? <View className="py-10"><ActivityIndicator size="small" color={M3.onSurfaceVariant} /></View> : null}
            {!search.localLoading && !mealLoading && mixedEntries.length === 0 ? (
              <View className="py-10 items-center gap-2">
                <MaterialIcons name="restaurant" size={36} color={M3.onSurfaceVariant} />
                <Text className="text-m3-on-surface-variant text-sm font-medium">No foods logged yet</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <SectionTitle>From your history</SectionTitle>
            {search.personalResults.map(foodRow)}
            {search.localLoading ? <ActivityIndicator size="small" color={M3.onSurfaceVariant} /> : null}
            {!search.localLoading && search.personalResults.length === 0 ? <Text className="text-m3-on-surface-variant text-sm px-1">No personal matches</Text> : null}

            <SectionTitle>Meals</SectionTitle>
            {meals.map(mealRow)}
            {mealLoading ? <ActivityIndicator size="small" color={M3.onSurfaceVariant} /> : null}
            {!mealLoading && meals.length === 0 && !mealError ? <Text className="text-m3-on-surface-variant text-sm px-1">No matching meals</Text> : null}
            {mealError ? <Text className="text-m3-error text-sm px-1">Couldn't load matching meals.</Text> : null}

            <SectionTitle>Online results</SectionTitle>
            {search.remoteResults.map(foodRow)}
            {search.remoteState === 'loading' ? <View className="py-4"><ActivityIndicator size="small" color={M3.onSurfaceVariant} /></View> : null}
            {search.remoteState === 'partial' ? <Text className="text-m3-on-surface-variant text-sm px-1">Some online sources are unavailable.</Text> : null}
            {search.remoteState === 'unavailable' ? (
              <View className="gap-2 px-1">
                <Text className="text-m3-on-surface-variant text-sm">Online foods unavailable. Your history still works.</Text>
                <Pressable onPress={search.retry} accessibilityRole="button" className="min-h-[48px] self-start justify-center rounded-full bg-m3-surface-container-high px-5 active:opacity-60">
                  <Text className="text-m3-on-surface text-xs font-semibold">Retry online</Text>
                </Pressable>
              </View>
            ) : null}
            {search.remoteState === 'success' && search.remoteResults.length === 0 ? <Text className="text-m3-on-surface-variant text-sm px-1">No online matches</Text> : null}
          </>
        )}

        {noResults ? (
          <View className="pt-3 gap-2">
            {search.remoteState !== 'unavailable' ? (
              <Pressable onPress={() => void handleEstimate()} disabled={estimating} accessibilityRole="button" className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high active:opacity-60 disabled:opacity-50">
                {estimating ? <ActivityIndicator size="small" color={M3.onSurfaceVariant} /> : <MaterialIcons name="auto-awesome" size={18} color={M3.onSurface} />}
                <Text className="text-m3-on-surface text-xs font-semibold">Estimate “{trimmedQuery}” with AI</Text>
              </Pressable>
            ) : null}
            {estimateError ? <Text className="text-m3-error text-sm" accessibilityLiveRegion="assertive">{estimateError}</Text> : null}
          </View>
        ) : null}

        {quickLogError ? <Text className="text-m3-error text-sm px-1" accessibilityLiveRegion="assertive">{quickLogError}</Text> : null}

        <Pressable onPress={onManualEntry} accessibilityRole="button" accessibilityLabel="Enter food manually" className="min-h-[48px] flex-row items-center justify-center gap-2 mt-1">
          <MaterialIcons name="edit-note" size={18} color={M3.onSurfaceVariant} />
          <Text className="text-m3-on-surface-variant text-xs font-semibold">Enter manually</Text>
        </Pressable>
      </BottomSheetScrollView>
    </View>
  );
}
