import React, { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

import { getLoggedFoods, getLoggedMeals, LoggedFood, LoggedMeal, setFoodPinned } from '../../db/database';
import { FoodResult } from '../../services/foodSearch';
import { M3 } from '../../theme/tokens';
import { foodIcon } from '../../utils/foodIcons';
import SheetBackButton from './SheetBackButton';

interface RecentFoodsStateProps {
  onSelectFood: (food: FoodResult) => void;
  onSelectMeal: (meal: LoggedMeal) => void;
  onBack: () => void;
}

type LoggedEntry =
  | { kind: 'food'; key: string; loggedAt: string; pinned: number; food: LoggedFood }
  | { kind: 'meal'; key: string; loggedAt: string; pinned: number; meal: LoggedMeal };

function MacroPill({ letter, grams, color }: { letter: string; grams: number; color: string }) {
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: color + '1A' }}>
      <Text className="text-compact font-bold tabular-nums" style={{ color }}>{letter} {Math.round(grams)}g</Text>
    </View>
  );
}

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
    <View className="rounded-2xl overflow-hidden bg-m3-surface-container border border-m3-outline-variant/30">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${food.name}, ${Math.round(food.calories)} calories`}
        accessibilityHint="Opens food review"
        className="flex-row items-stretch min-h-[112px] active:opacity-80"
      >
        {food.photo_uri ? (
          <Image source={{ uri: food.photo_uri }} className="w-28 self-stretch bg-m3-surface-container-highest" resizeMode="cover" />
        ) : (
          <View className="w-28 self-stretch items-center justify-center">
            <View className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center">
              <MaterialCommunityIcons name={foodIcon(food.name)} size={20} color={M3.onSurfaceVariant} />
            </View>
          </View>
        )}
        <View className="flex-1 min-w-0 px-5 py-5">
          <Text className="text-m3-on-surface text-base font-bold leading-5" numberOfLines={2}>{food.name}</Text>
          <Text className="text-m3-on-surface-variant text-xs mt-0.5" numberOfLines={1}>
            {[food.brand, food.serving_label, food.grams_logged ? `${Math.round(food.grams_logged)}g` : null].filter(Boolean).join(' · ')}
          </Text>
          <View className="flex-row gap-1.5 flex-wrap mt-2">
            <MacroPill letter="P" grams={food.protein_g} color={M3.protein} />
            <MacroPill letter="C" grams={food.carbs_g} color={M3.carbs} />
            <MacroPill letter="F" grams={food.fat_g} color={M3.fat} />
          </View>
        </View>
        <View className="w-24 shrink-0 items-end pt-14 pr-5">
          <Text className="text-m3-on-surface text-base font-bold tabular-nums">
            {Math.round(food.calories)}<Text className="text-m3-on-surface-variant text-compact font-medium"> kcal</Text>
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onTogglePin}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={pinned ? `Unpin ${food.name}` : `Pin ${food.name}`}
        className="absolute right-2 top-2 w-12 h-12 items-center justify-center active:opacity-60"
      >
        <MaterialIcons name={pinned ? 'favorite' : 'favorite-border'} size={20} color={pinned ? M3.error : M3.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

function MealRow({ meal, pinned, onPress, onTogglePin }: { meal: LoggedMeal; pinned: boolean; onPress: () => void; onTogglePin: () => void }) {
  return (
    <View className="rounded-2xl overflow-hidden bg-m3-surface-container border border-m3-outline-variant/30">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${meal.meal_name}, ${Math.round(meal.total_calories)} calories`}
        accessibilityHint="Opens meal review"
        className="flex-row items-stretch min-h-[112px] active:opacity-80"
      >
        {meal.photo_uri ? (
          <Image source={{ uri: meal.photo_uri }} className="w-28 self-stretch bg-m3-surface-container-highest" resizeMode="cover" />
        ) : (
          <View className="w-28 self-stretch items-center justify-center">
            <View className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center">
              <MaterialCommunityIcons name={foodIcon(meal.meal_name)} size={20} color={M3.onSurfaceVariant} />
            </View>
          </View>
        )}
        <View className="flex-1 min-w-0 px-5 py-5">
          <Text className="text-m3-on-surface text-base font-bold leading-5" numberOfLines={2}>{meal.meal_name}</Text>
          <Text className="text-m3-on-surface-variant text-xs mt-0.5">
            {meal.component_count} {meal.component_count === 1 ? 'item' : 'items'}
          </Text>
          <View className="flex-row gap-1.5 flex-wrap mt-2">
            <MacroPill letter="P" grams={meal.total_protein} color={M3.protein} />
            <MacroPill letter="C" grams={meal.total_carbs} color={M3.carbs} />
            <MacroPill letter="F" grams={meal.total_fat} color={M3.fat} />
          </View>
        </View>
        <View className="w-24 shrink-0 items-end pt-14 pr-5">
          <Text className="text-m3-on-surface text-base font-bold tabular-nums">
            {Math.round(meal.total_calories)}<Text className="text-m3-on-surface-variant text-compact font-medium"> kcal</Text>
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onTogglePin}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={pinned ? `Unpin ${meal.meal_name}` : `Pin ${meal.meal_name}`}
        className="absolute right-2 top-2 w-12 h-12 items-center justify-center active:opacity-60"
      >
        <MaterialIcons name={pinned ? 'favorite' : 'favorite-border'} size={20} color={pinned ? M3.error : M3.onSurfaceVariant} />
      </Pressable>
    </View>
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
