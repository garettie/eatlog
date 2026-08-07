import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, View } from 'react-native';
import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { searchFood, FoodResult, DataType, type FoodSearchMode, type FoodSearchOutcome } from '../../services/foodSearch';
import { getRecentFoodLogs, RecentFood } from '../../db/database';
import { M3 } from '../../theme/tokens';
import SheetBackButton from './SheetBackButton';

function dataTypeBadge(dt: DataType): string {
  switch (dt) {
    case 'Survey (FNDDS)': return 'USDA Survey (FNDDS)';
    case 'Foundation': return 'USDA Foundation';
    case 'SR Legacy': return 'USDA SR Legacy';
    case 'Branded': return 'USDA Branded';
    case 'off': return 'Open Food Facts';
    case 'scan': return 'Scan';
    case 'describe': return 'Estimate';
    case 'manual': return '';
    default: return '';
  }
}

interface ResultRowProps {
  item: FoodResult;
  onPress: () => void;
}

function ResultRow({ item, onPress }: ResultRowProps) {
  const badge = item.dataType !== 'manual' ? dataTypeBadge(item.dataType) : '';
  const meta = [badge, item.brand, item.preparation, item.servingLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.caloriesPer100g != null ? `${Math.round(item.caloriesPer100g)} calories per 100 grams` : 'nutrition unavailable'}`}
      accessibilityHint="Opens food review"
      className="min-h-[52px] px-4 py-3 bg-m3-surface-container rounded-2xl border border-m3-outline-variant/30 active:opacity-70"
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-3">
          <Text className="text-m3-on-surface font-medium text-sm" numberOfLines={1}>{item.name}</Text>
          {meta.length > 0 && (
            <Text className="text-m3-on-surface-variant text-compact font-medium mt-0.5" numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
        <Text className="tabular-nums font-semibold text-xs text-m3-primary">
          {item.caloriesPer100g != null ? `${Math.round(item.caloriesPer100g)} kcal/100g` : '---'}
        </Text>
      </View>
    </Pressable>
  );
}

interface SearchInputStateProps {
  onSelectFood: (food: FoodResult) => void;
  onManualEntry: () => void;
  onBack: () => void;
}

export default function SearchInputState({ onSelectFood, onManualEntry, onBack }: SearchInputStateProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<FoodResult[]>([]);
  const [outcome, setOutcome] = useState<FoodSearchOutcome['kind']>('success');
  const [retryCount, setRetryCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [recents, setRecents] = useState<RecentFood[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    getRecentFoodLogs(10).then(setRecents);
  }, []);

  const runSearch = useCallback(async (searchQuery: string, mode: FoodSearchMode) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;
    const seq = ++searchSeq.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsSearching(true);
    try {
      const result = await searchFood(trimmed, mode, controller.signal);
      if (seq !== searchSeq.current) return;
      setResults(result.items);
      setOutcome(result.kind);
      setHasSearched(true);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('[FoodSearch] search failed', error);
      if (seq === searchSeq.current) {
        setResults([]);
        setOutcome('unavailable');
        setHasSearched(true);
      }
    } finally {
      if (seq === searchSeq.current) setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    searchSeq.current += 1;

    if (query.trim().length < 2) {
      setResults([]);
      setOutcome('success');
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      await runSearch(query, 'common');
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, retryCount, runSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSubmit = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void runSearch(query, 'full');
    Keyboard.dismiss();
  }, [query, runSearch]);

  const handleResultPress = useCallback((food: FoodResult) => {
    Keyboard.dismiss();
    onSelectFood(food);
  }, [onSelectFood]);

  const recentToFood = useCallback((item: RecentFood): FoodResult => {
    return {
      id: `recent-${item.source}-${item.source_food_id ?? item.name.toLowerCase()}-${item.logged_at}`,
      name: item.name,
      source: item.source as 'usda' | 'off',
      sourceFoodId: item.source_food_id ?? '',
      dataType: (item.data_type as DataType) || (item.source === 'usda' ? 'Branded' : 'off'),
      brand: item.brand,
      preparation: item.preparation,
      normalizedName: '',
      caloriesPer100g: item.calories_per_100g,
      proteinPer100g: item.protein_g_per_100g,
      carbsPer100g: item.carbs_g_per_100g,
      fatPer100g: item.fat_g_per_100g,
      servingSizeGrams: item.serving_size_g ?? null,
      servingLabel: item.serving_label ?? null,
      alternateSourceIds: [],
    };
  }, []);

  const listData = React.useMemo(() => {
    if (hasSearched) return results.map((item) => ({ kind: 'result' as const, key: item.id, food: item }));
    return recents.flatMap((item) => {
      if ([item.calories_per_100g, item.protein_g_per_100g, item.carbs_g_per_100g, item.fat_g_per_100g].every((value) => value == null)) return [];
      const food = recentToFood(item);
      return [{ kind: 'recent' as const, key: food.id, food }];
    });
  }, [hasSearched, recentToFood, recents, results]);

  const renderResult = useCallback(({ item }: { item: { kind: 'result' | 'recent'; key: string; food: FoodResult } }) => (
    <ResultRow item={item.food} onPress={() => handleResultPress(item.food)} />
  ), [handleResultPress]);

  const listHeader = hasSearched && outcome === 'partial' ? (
    <Text accessibilityLiveRegion="polite" className="text-m3-on-surface-variant text-sm mb-2">Some sources are unavailable. Showing available results.</Text>
  ) : listData.length > 0 ? (
    <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider px-1 mb-2">
      {hasSearched ? 'Results' : 'Recents'}
    </Text>
  ) : null;

  const listEmpty = !query.trim() && !isSearching && recents.length === 0 ? (
    <View className="py-12 items-center">
      <MaterialIcons name="restaurant" size={36} color={M3.outline} />
      <Text className="text-m3-on-surface-variant text-sm mt-3 font-medium">Search for a food to get started</Text>
    </View>
  ) : hasSearched && !isSearching && outcome === 'success' ? (
    <View className="py-10 items-center gap-4">
      <View className="items-center">
        <MaterialIcons name="search-off" size={32} color={M3.outline} />
        <Text className="text-m3-on-surface-variant text-sm mt-2 font-medium">No results found</Text>
        <Text className="text-m3-on-surface-variant text-sm mt-1">Try a different search term</Text>
      </View>
      <Pressable onPress={onManualEntry} accessibilityRole="button" accessibilityLabel="Enter food manually" accessibilityHint="Opens manual food entry" className="min-h-[48px] flex-row items-center gap-2 bg-m3-surface-container-high px-5 rounded-full">
        <MaterialIcons name="edit-note" size={18} color={M3.onSurface} />
        <Text className="text-m3-on-surface text-xs font-semibold">Enter manually</Text>
      </Pressable>
    </View>
  ) : hasSearched && !isSearching && outcome === 'unavailable' ? (
    <View className="py-10 items-center gap-4">
      <View className="items-center">
        <MaterialIcons name="cloud-off" size={32} color={M3.onSurfaceVariant} />
        <Text className="text-m3-on-surface-variant text-sm mt-2 font-medium">Search is unavailable</Text>
        <Text className="text-m3-on-surface-variant text-sm mt-1">Check your connection, then try again.</Text>
      </View>
      <View className="flex-row gap-3">
        <Pressable onPress={() => setRetryCount((count) => count + 1)} accessibilityRole="button" accessibilityLabel="Retry food search" className="min-h-[48px] justify-center rounded-full bg-m3-surface-container-high px-5"><Text className="text-m3-on-surface text-xs font-semibold">Retry</Text></Pressable>
        <Pressable onPress={onManualEntry} accessibilityRole="button" accessibilityLabel="Enter food manually" className="min-h-[48px] justify-center rounded-full bg-m3-surface-container-high px-5"><Text className="text-m3-on-surface text-xs font-semibold">Enter manually</Text></Pressable>
      </View>
    </View>
  ) : isSearching ? <View className="py-12 items-center"><ActivityIndicator size="small" color={M3.onSurfaceVariant} /></View> : null;

  const listFooter = hasSearched && results.length > 0 ? (
    <Pressable onPress={onManualEntry} accessibilityRole="button" accessibilityLabel="Enter food manually" className="min-h-[48px] flex-row items-center justify-center gap-2 mt-1">
      <MaterialIcons name="add-circle-outline" size={18} color={M3.onSurfaceVariant} />
      <Text className="text-m3-on-surface-variant text-xs font-medium">Enter manually</Text>
    </Pressable>
  ) : null;

  return (
    <View className="flex-1">
      <View className="bg-m3-surface-container px-5 pt-2 pb-3">
        <View className="flex-row items-center gap-1 mb-1">
          <SheetBackButton onPress={onBack} />
          <Text className="text-m3-on-surface font-bold text-base">Search foods</Text>
        </View>
        <View className="flex-row items-center bg-m3-surface-container-high rounded-full px-4 py-2 border border-m3-outline-variant/30">
          <MaterialIcons name="search" size={18} color={M3.onSurfaceVariant} />
          <BottomSheetTextInput
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search foods"
            placeholder="Search foods…"
            placeholderTextColor={M3.placeholder}
            className="flex-1 text-m3-on-surface text-sm ml-2 font-medium"
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSubmit}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" className="w-12 h-12 items-center justify-center -mr-3 -my-3">
              <MaterialIcons name="close" size={18} color={M3.onSurfaceVariant} />
            </Pressable>
          )}
        </View>
      </View>

      <BottomSheetFlatList
        data={listData}
        renderItem={renderResult}
        keyExtractor={(item) => item.key}
        contentContainerClassName="px-5 gap-1.5 pb-6"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
      />
    </View>
  );
}
