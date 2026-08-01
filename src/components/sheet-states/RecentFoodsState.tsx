import React, { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { getLoggedFoods, getLoggedMeals, LoggedFood, LoggedMeal, setFoodPinned } from '../../db/database';
import { FoodResult } from '../../services/foodSearch';
import { M3 } from '../../theme/tokens';
import NutritionCard from '../NutritionCard';
import SheetBackButton from './SheetBackButton';

interface RecentFoodsStateProps {
  onSelectFood: (food: FoodResult) => void;
  onSelectMeal: (meal: LoggedMeal) => void;
  onBack: () => void;
}

type LoggedEntry =
  | { kind: 'food'; key: string; loggedAt: string; pinned: number; food: LoggedFood }
  | { kind: 'meal'; key: string; loggedAt: string; pinned: number; meal: LoggedMeal };

function foodToResult(food: LoggedFood): FoodResult {
  const grams = food.grams_logged && food.grams_logged > 0 ? food.grams_logged : 100;
  const ratio = 100 / grams;
  return {
    id: `logged-${food.id}`,
    name: food.name,
    source: food.source as FoodResult['source'],
    sourceFoodId: food.source_food_id ?? '',
    dataType: (food.data_type as FoodResult['dataType']) || 'manual',
    brand: food.brand,
    preparation: food.preparation,
    normalizedName: food.name.toLowerCase(),
    caloriesPer100g: food.calories_per_100g ?? food.calories * ratio,
    proteinPer100g: food.protein_g_per_100g ?? food.protein_g * ratio,
    carbsPer100g: food.carbs_g_per_100g ?? food.carbs_g * ratio,
    fatPer100g: food.fat_g_per_100g ?? food.fat_g * ratio,
    servingSizeGrams: food.serving_size_g,
    servingLabel: food.serving_label,
    estimatedGrams: food.grams_logged,
    alternateSourceIds: [],
  };
}

function FoodRow({ food, pinned, onPress, onTogglePin }: { food: LoggedFood; pinned: boolean; onPress: () => void; onTogglePin: () => void }) {
  return (
    <NutritionCard
      name={food.name}
      photoUri={food.photo_uri}
      secondaryText={[food.brand, food.serving_label, food.grams_logged ? `${Math.round(food.grams_logged)}g` : null].filter(Boolean).join(' · ')}
      calories={food.calories}
      protein={food.protein_g}
      carbs={food.carbs_g}
      fat={food.fat_g}
      onPress={onPress}
      accessibilityHint="Opens food review"
      action={(
        <Pressable
          onPress={onTogglePin}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={pinned ? `Unpin ${food.name}` : `Pin ${food.name}`}
          className="absolute right-2 top-2 w-12 h-12 items-center justify-center active:opacity-60"
        >
          <MaterialIcons name={pinned ? 'favorite' : 'favorite-border'} size={20} color={pinned ? M3.error : M3.onSurfaceVariant} />
        </Pressable>
      )}
    />
  );
}

function MealRow({ meal, pinned, onPress, onTogglePin }: { meal: LoggedMeal; pinned: boolean; onPress: () => void; onTogglePin: () => void }) {
  return (
    <NutritionCard
      name={meal.meal_name}
      photoUri={meal.photo_uri}
      secondaryText={`${meal.component_count} ${meal.component_count === 1 ? 'item' : 'items'}`}
      calories={meal.total_calories}
      protein={meal.total_protein}
      carbs={meal.total_carbs}
      fat={meal.total_fat}
      onPress={onPress}
      accessibilityHint="Opens meal review"
      action={(
        <Pressable
          onPress={onTogglePin}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={pinned ? `Unpin ${meal.meal_name}` : `Pin ${meal.meal_name}`}
          className="absolute right-2 top-2 w-12 h-12 items-center justify-center active:opacity-60"
        >
          <MaterialIcons name={pinned ? 'favorite' : 'favorite-border'} size={20} color={pinned ? M3.error : M3.onSurfaceVariant} />
        </Pressable>
      )}
    />
  );
}

export default function RecentFoodsState({ onSelectFood, onSelectMeal, onBack }: RecentFoodsStateProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [entries, setEntries] = useState<LoggedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const loadQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const loadRequestRef = React.useRef(0);
  const hasLoadedRef = React.useRef(false);

  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    if (!hasLoadedRef.current) setLoading(true);
    setError(false);
    const queued = loadQueueRef.current.catch(() => {}).then(async () => {
      if (requestId !== loadRequestRef.current) return;
      const foods = await getLoggedFoods(deferredQuery);
      if (requestId !== loadRequestRef.current) return;
      const meals = await getLoggedMeals(deferredQuery);
      const results: LoggedEntry[] = [
        ...foods.map((food) => ({ kind: 'food' as const, key: food.food_key, loggedAt: food.logged_at, pinned: food.is_pinned, food })),
        ...meals.map((meal) => ({ kind: 'meal' as const, key: meal.food_key, loggedAt: meal.last_logged_at, pinned: meal.is_pinned, meal })),
      ];
      results.sort((a, b) => b.pinned - a.pinned || b.loggedAt.localeCompare(a.loggedAt));
      if (requestId !== loadRequestRef.current) return;
      hasLoadedRef.current = true;
      setEntries(results);
    });
    loadQueueRef.current = queued;
    queued
      .catch((e) => {
        console.error('[RecentFoods] getLoggedFoods failed', e);
        if (requestId === loadRequestRef.current) setError(true);
      })
      .finally(() => {
        if (requestId === loadRequestRef.current) setLoading(false);
      });
    return () => {
      if (requestId === loadRequestRef.current) loadRequestRef.current += 1;
    };
  }, [deferredQuery, retryCount]);

  const handleTogglePin = useCallback(async (entry: LoggedEntry) => {
    const isPinned = entry.pinned === 1;
    const update = (current: LoggedEntry[], pinned: number) => current
      .map((item) => item.key === entry.key ? { ...item, pinned } : item)
      .sort((a, b) => b.pinned - a.pinned || b.loggedAt.localeCompare(a.loggedAt));
    setEntries((current) => update(current, isPinned ? 0 : 1));
    try {
      await setFoodPinned(entry.key, !isPinned);
    } catch (e) {
      console.error('[RecentFoods] setFoodPinned failed', e);
      setEntries((current) => update(current, isPinned ? 1 : 0));
    }
  }, []);

  const renderEntry = useCallback(({ item: entry }: { item: LoggedEntry }) => entry.kind === 'food' ? (
    <FoodRow
      food={entry.food}
      pinned={entry.pinned === 1}
      onPress={() => onSelectFood(foodToResult(entry.food))}
      onTogglePin={() => void handleTogglePin(entry)}
    />
  ) : (
    <MealRow
      meal={entry.meal}
      pinned={entry.pinned === 1}
      onPress={() => onSelectMeal(entry.meal)}
      onTogglePin={() => void handleTogglePin(entry)}
    />
  ), [handleTogglePin, onSelectFood, onSelectMeal]);

  const emptyContent = loading ? (
    <View className="py-12 items-center"><ActivityIndicator size="small" color={M3.onSurfaceVariant} /></View>
  ) : error ? (
    <View className="py-12 items-center" accessibilityLiveRegion="assertive">
      <Text className="text-m3-on-surface-variant text-sm">Couldn't load your foods.</Text>
      <Pressable onPress={() => setRetryCount((count) => count + 1)} accessibilityRole="button" accessibilityLabel="Retry loading recent foods" className="min-h-[48px] mt-3 justify-center rounded-full bg-m3-surface-container-high px-5">
        <Text className="text-m3-on-surface text-xs font-semibold">Retry</Text>
      </Pressable>
    </View>
  ) : (
    <View className="py-12 items-center gap-2">
      <MaterialIcons name="restaurant" size={36} color={M3.onSurfaceVariant} />
      <Text className="text-m3-on-surface-variant text-sm font-medium">{query ? 'No foods found' : 'No foods logged yet'}</Text>
    </View>
  );

  return (
    <View className="flex-1">
      <View className="bg-m3-surface-container px-5 pt-2 pb-3">
        <View className="flex-row items-center gap-1 mb-1">
          <SheetBackButton onPress={onBack} />
          <Text className="text-m3-on-surface font-bold text-base">Recent foods</Text>
        </View>
        <View className="flex-row items-center bg-m3-surface-container-high rounded-full px-4 py-2 border border-m3-outline-variant/30">
          <MaterialIcons name="search" size={18} color={M3.onSurfaceVariant} />
          <BottomSheetTextInput
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search logged foods"
            placeholder="Search logged foods"
            placeholderTextColor={M3.placeholder}
            className="flex-1 text-m3-on-surface text-sm ml-2 font-medium"
            autoFocus
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" className="w-12 h-12 items-center justify-center -mr-3 -my-3">
              <MaterialIcons name="close" size={18} color={M3.onSurfaceVariant} />
            </Pressable>
          )}
        </View>
      </View>
      <BottomSheetFlatList
        data={loading || error ? [] : entries}
        renderItem={renderEntry}
        keyExtractor={(entry) => entry.key}
        contentContainerClassName="px-5 gap-2 pb-6"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={emptyContent}
      />
    </View>
  );
}
