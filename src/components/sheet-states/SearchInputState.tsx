import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { searchFood, FoodResult, DataType } from '../../services/foodSearch';
import { getRecentFoodLogs, RecentFood } from '../../db/database';

function dataTypeBadge(dt: DataType): string {
  switch (dt) {
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
      className="px-4 py-3 bg-m3-surface-container rounded-2xl border border-m3-outline-variant/30 active:opacity-70"
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-3">
          <Text className="text-m3-on-surface font-medium text-sm" numberOfLines={1}>{item.name}</Text>
          {meta.length > 0 && (
            <Text className="text-m3-on-surface-variant text-[10px] mt-0.5" numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
        <Text className="num-tabular font-semibold text-xs text-m3-primary">
          {item.caloriesPer100g != null ? `${Math.round(item.caloriesPer100g)} kcal/100g` : '---'}
        </Text>
      </View>
    </Pressable>
  );
}

interface SearchInputStateProps {
  onSelectFood: (food: FoodResult) => void;
  onManualEntry: () => void;
}

export default function SearchInputState({ onSelectFood, onManualEntry }: SearchInputStateProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<FoodResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [recents, setRecents] = useState<RecentFood[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    getRecentFoodLogs(10).then(setRecents);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      searchSeq.current++;
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      const res = await searchFood(query);
      if (seq !== searchSeq.current) return;
      setResults(res);
      setHasSearched(true);
      setIsSearching(false);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleResultPress = useCallback((food: FoodResult) => {
    Keyboard.dismiss();
    onSelectFood(food);
  }, [onSelectFood]);

  const recentToFood = useCallback((item: RecentFood, idx: number): FoodResult => {
    return {
      id: `recent-${idx}`,
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

  return (
    <BottomSheetScrollView
      className="flex-1"
      contentContainerClassName="pb-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-m3-surface-container px-5 pt-2 pb-3">
        <View className="flex-row items-center bg-m3-surface-container-high rounded-full px-4 py-2 border border-m3-outline-variant/30">
          <MaterialIcons name="search" size={18} color="#c4c6d0" />
          <BottomSheetTextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search foods..."
            placeholderTextColor="#c4c6d0"
            className="flex-1 text-m3-on-surface text-sm ml-2 font-medium"
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
          {isSearching && (
            <ActivityIndicator size="small" color="#c4c6d0" style={{ marginRight: 8 }} />
          )}
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" className="p-1">
              <MaterialIcons name="close" size={18} color="#c4c6d0" />
            </Pressable>
          )}
        </View>
      </View>

      <View className="px-5 gap-1.5">
        {isSearching && results.length === 0 && (
          <View className="py-12 items-center">
            <ActivityIndicator size="small" color="#ffffff" />
            <Text className="text-m3-on-surface-variant text-xs mt-3">Searching...</Text>
          </View>
        )}

        {!query.trim() && !isSearching && recents.length > 0 && (
          <View className="gap-1.5">
            <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider px-1 mb-1">
              Recents
            </Text>
            {recents.map((item, idx) => {
              const cal = item.calories_per_100g;
              const pro = item.protein_g_per_100g;
              const ca = item.carbs_g_per_100g;
              const fa = item.fat_g_per_100g;
              if (cal == null && pro == null && ca == null && fa == null) return null;
              const food = recentToFood(item, idx);
              return (
                <ResultRow key={food.id} item={food} onPress={() => handleResultPress(food)} />
              );
            })}
          </View>
        )}

        {!query.trim() && !isSearching && recents.length === 0 && (
          <View className="py-12 items-center">
            <MaterialIcons name="restaurant" size={36} color="#44474f" />
            <Text className="text-m3-on-surface-variant text-sm mt-3 font-medium">Search for a food to get started</Text>
          </View>
        )}

        {hasSearched && results.length > 0 && (
          <View className="gap-1.5">
            <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider px-1 mb-1">
              Results
            </Text>
            {results.map((item) => (
              <ResultRow key={item.id} item={item} onPress={() => handleResultPress(item)} />
            ))}
          </View>
        )}

        {hasSearched && !isSearching && results.length === 0 && (
          <View className="py-10 items-center gap-4">
            <View className="items-center">
              <MaterialIcons name="search-off" size={32} color="#44474f" />
              <Text className="text-m3-on-surface-variant text-sm mt-2 font-medium">No results found</Text>
              <Text className="text-m3-on-surface-variant text-xs mt-1">Try a different search term</Text>
            </View>
            <Pressable
              onPress={onManualEntry}
              className="flex-row items-center gap-2 bg-m3-surface-container-high px-5 py-3 rounded-full"
            >
              <MaterialIcons name="edit-note" size={18} color="#e2e2e9" />
              <Text className="text-m3-on-surface text-xs font-semibold">Enter manually</Text>
            </Pressable>
          </View>
        )}

        {hasSearched && results.length > 0 && (
          <Pressable
            onPress={onManualEntry}
            className="flex-row items-center justify-center gap-2 py-4 mt-1"
          >
            <MaterialIcons name="add-circle-outline" size={18} color="#c4c6d0" />
            <Text className="text-m3-on-surface-variant text-xs font-medium">Enter manually</Text>
          </Pressable>
        )}
      </View>
    </BottomSheetScrollView>
  );
}
