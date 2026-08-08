import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { getLoggedMeals, type LoggedMeal, setFoodPinned } from '../../db/database';
import { M3 } from '../../theme/tokens';
import NutritionCard from '../NutritionCard';
import SheetBackButton from './SheetBackButton';

interface RecentMealsStateProps {
  onSelectMeal: (meal: LoggedMeal) => void;
  onBack: () => void;
}

export default function RecentMealsState({ onSelectMeal, onBack }: RecentMealsStateProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(false);
    void getLoggedMeals(deferredQuery).then((items) => {
      if (sequence === requestSequence.current) setMeals(items);
    }).catch((loadError) => {
      console.error('[RecentMeals] load failed', loadError);
      if (sequence === requestSequence.current) {
        setMeals([]);
        setError(true);
      }
    }).finally(() => {
      if (sequence === requestSequence.current) setLoading(false);
    });
  }, [deferredQuery, retryCount]);

  const handleTogglePin = useCallback(async (meal: LoggedMeal) => {
    const nextPinned = meal.is_pinned !== 1;
    const updateMeal = (item: LoggedMeal, pinned: number) => item.food_key === meal.food_key
      ? { ...item, is_pinned: pinned }
      : item;
    const sortMeals = (items: LoggedMeal[]) => items.sort((first, second) =>
      second.is_pinned - first.is_pinned || second.last_logged_at.localeCompare(first.last_logged_at));

    setMeals((current) => sortMeals(current.map((item) => updateMeal(item, nextPinned ? 1 : 0))));
    try {
      await setFoodPinned(meal.food_key, nextPinned);
    } catch (pinError) {
      console.error('[RecentMeals] pin failed', pinError);
      setMeals((current) => sortMeals(current.map((item) => updateMeal(item, meal.is_pinned))));
    }
  }, []);

  const renderMeal = useCallback(({ item: meal }: { item: LoggedMeal }) => (
    <NutritionCard
      name={meal.meal_name}
      photoUri={meal.photo_uri}
      secondaryText={`${meal.component_count} ${meal.component_count === 1 ? 'item' : 'items'}`}
      calories={meal.total_calories}
      protein={meal.total_protein}
      carbs={meal.total_carbs}
      fat={meal.total_fat}
      onPress={() => onSelectMeal(meal)}
      accessibilityHint="Opens meal review"
      action={(
        <Pressable
          onPress={() => void handleTogglePin(meal)}
          accessibilityRole="button"
          accessibilityLabel={meal.is_pinned ? `Unpin ${meal.meal_name}` : `Pin ${meal.meal_name}`}
          className="absolute right-2 top-2 w-12 h-12 items-center justify-center active:opacity-60"
        >
          <MaterialIcons name={meal.is_pinned ? 'favorite' : 'favorite-border'} size={20} color={meal.is_pinned ? M3.error : M3.onSurfaceVariant} />
        </Pressable>
      )}
    />
  ), [handleTogglePin, onSelectMeal]);

  const emptyContent = loading ? (
    <View className="py-12 items-center"><ActivityIndicator size="small" color={M3.onSurfaceVariant} /></View>
  ) : error ? (
    <View className="py-12 items-center" accessibilityLiveRegion="assertive">
      <Text className="text-m3-on-surface-variant text-sm">Couldn't load recent meals.</Text>
      <Pressable onPress={() => setRetryCount((count) => count + 1)} accessibilityRole="button" accessibilityLabel="Retry loading recent meals" className="min-h-[48px] mt-3 justify-center rounded-full bg-m3-surface-container-high px-5 active:opacity-60">
        <Text className="text-m3-on-surface text-xs font-semibold">Retry</Text>
      </Pressable>
    </View>
  ) : (
    <View className="py-12 items-center gap-2">
      <MaterialIcons name="restaurant" size={36} color={M3.onSurfaceVariant} />
      <Text className="text-m3-on-surface-variant text-sm font-medium">{query ? 'No meals found' : 'No meals logged yet'}</Text>
    </View>
  );

  return (
    <View className="flex-1">
      <View className="bg-m3-surface-container px-5 pt-2 pb-3">
        <View className="flex-row items-center gap-1 mb-1">
          <SheetBackButton onPress={onBack} />
          <Text className="text-m3-on-surface font-bold text-base">Recent meals</Text>
        </View>
        <View className="flex-row items-center bg-m3-surface-container-high rounded-full px-4 py-2 border border-m3-outline-variant/30">
          <MaterialIcons name="search" size={18} color={M3.onSurfaceVariant} />
          <BottomSheetTextInput
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search meals from your log"
            placeholder="Search meals…"
            placeholderTextColor={M3.placeholder}
            className="flex-1 text-m3-on-surface text-sm ml-2 font-medium"
            autoFocus={false}
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" className="w-12 h-12 items-center justify-center -mr-3 -my-3">
              <MaterialIcons name="close" size={18} color={M3.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <BottomSheetFlatList
        className="flex-1"
        data={loading || error ? [] : meals}
        renderItem={renderMeal}
        keyExtractor={(meal) => String(meal.meal_id)}
        contentContainerClassName="px-5 gap-2 pb-6"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={emptyContent}
      />
    </View>
  );
}
