import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { searchFood, FoodResult } from '../services/foodSearch';
import { getRecentFoodLogs, RecentFood } from '../db/database';
import PortionAdjuster from '../components/PortionAdjuster';
import ManualEntrySheet from '../components/ManualEntrySheet';

export default function FoodSearchScreen() {
  const navigation = useNavigation<any>();

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<{ usda: FoodResult[]; off: FoodResult[] }>({ usda: [], off: [] });
  const [hasSearched, setHasSearched] = useState(false);
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portionRef = useRef<BottomSheetModal>(null);
  const manualRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    getRecentFoodLogs(10).then(setRecents);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults({ usda: [], off: [] });
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const res = await searchFood(query);
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
    setSelectedFood(food);
    setTimeout(() => portionRef.current?.present(), 100);
  }, []);

  const handleManualEntry = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => manualRef.current?.present(), 100);
  }, []);

  const handleLogComplete = useCallback(() => {
    portionRef.current?.dismiss();
    manualRef.current?.dismiss();
    getRecentFoodLogs(10).then(setRecents);
  }, []);

  const totalResults = results.usda.length + results.off.length;

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      {/* Header */}
      <View className="px-4 pt-2 pb-3 flex-row items-center gap-2 bg-m3-surface-container-low">
        <Pressable onPress={() => navigation.goBack()} className="p-1">
          <MaterialIcons name="arrow-back" size={22} color="#e2e2e9" />
        </Pressable>
        <View className="flex-1 flex-row items-center bg-m3-surface-container-high rounded-full px-4 py-2 border border-m3-outline-variant/30">
          <MaterialIcons name="search" size={18} color="#c4c6d0" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search foods..."
            placeholderTextColor="#c4c6d0"
            className="flex-1 text-m3-on-surface text-sm ml-2 font-medium"
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <MaterialIcons name="close" size={18} color="#c4c6d0" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-3"
        contentContainerClassName="pb-8 gap-3"
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Loading ── */}
        {isSearching && (
          <View className="py-12 items-center">
            <ActivityIndicator size="small" color="#ffffff" />
            <Text className="text-m3-on-surface-variant text-xs mt-3">Searching...</Text>
          </View>
        )}

        {/* ── Recents (shown when search is empty) ── */}
        {!query.trim() && !isSearching && recents.length > 0 && (
          <View className="gap-1.5">
            <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider px-1 mb-1">
              Recents
            </Text>
            {recents.map((item, idx) => (
              <Pressable
                key={`recent-${item.source}-${item.source_food_id ?? idx}`}
                onPress={() => {
                  if (item.calories_per_100g && item.protein_g_per_100g && item.carbs_g_per_100g && item.fat_g_per_100g) {
                    handleResultPress({
                      id: `recent-${idx}`,
                      name: item.name,
                      source: item.source as 'usda' | 'off',
                      sourceFoodId: item.source_food_id ?? '',
                      caloriesPer100g: item.calories_per_100g,
                      proteinPer100g: item.protein_g_per_100g,
                      carbsPer100g: item.carbs_g_per_100g,
                      fatPer100g: item.fat_g_per_100g,
                      servingSizeGrams: null,
                      servingLabel: null,
                    });
                  }
                }}
                className="flex-row items-center justify-between px-4 py-3 bg-m3-surface-container rounded-2xl border border-m3-outline-variant/30"
              >
                <View className="flex-1 mr-3">
                  <Text className="text-m3-on-surface font-medium text-sm" numberOfLines={1}>{item.name}</Text>
                  <Text className="text-m3-on-surface-variant text-[10px] mt-0.5">
                    {item.calories_per_100g ? `${Math.round(item.calories_per_100g)} kcal/100g` : ''}
                    {' · '}
                    {item.source === 'usda' ? 'USDA' : item.source === 'off' ? 'Open Food Facts' : 'Manual'}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color="#c4c6d0" />
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Empty recents state ── */}
        {!query.trim() && !isSearching && recents.length === 0 && (
          <View className="py-12 items-center">
            <MaterialIcons name="restaurant" size={36} color="#44474f" />
            <Text className="text-m3-on-surface-variant text-sm mt-3 font-medium">Search for a food to get started</Text>
          </View>
        )}

        {/* ── USDA results ── */}
        {hasSearched && results.usda.length > 0 && (
          <View className="gap-1.5">
            <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider px-1 mb-1">
              Whole & Generic Foods (USDA)
            </Text>
            {results.usda.map((item) => (
              <ResultRow key={item.id} item={item} onPress={() => handleResultPress(item)} />
            ))}
          </View>
        )}

        {/* ── Open Food Facts results ── */}
        {hasSearched && results.off.length > 0 && (
          <View className="gap-1.5">
            <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider px-1 mb-1">
              Packaged Products (Open Food Facts)
            </Text>
            {results.off.map((item) => (
              <ResultRow key={item.id} item={item} onPress={() => handleResultPress(item)} />
            ))}
          </View>
        )}

        {/* ── No results ── */}
        {hasSearched && !isSearching && totalResults === 0 && (
          <View className="py-10 items-center gap-4">
            <View className="items-center">
              <MaterialIcons name="search-off" size={32} color="#44474f" />
              <Text className="text-m3-on-surface-variant text-sm mt-2 font-medium">No results found</Text>
              <Text className="text-m3-on-surface-variant text-xs mt-1">Try a different search term</Text>
            </View>
            <Pressable
              onPress={handleManualEntry}
              className="flex-row items-center gap-2 bg-m3-surface-container-high px-5 py-3 rounded-full"
            >
              <MaterialIcons name="edit-note" size={18} color="#e2e2e9" />
              <Text className="text-m3-on-surface text-xs font-semibold">Enter manually</Text>
            </Pressable>
          </View>
        )}

        {/* ── Manual entry button (always visible after search) ── */}
        {hasSearched && totalResults > 0 && (
          <Pressable
            onPress={handleManualEntry}
            className="flex-row items-center justify-center gap-2 py-4 mt-1"
          >
            <MaterialIcons name="add-circle-outline" size={18} color="#c4c6d0" />
            <Text className="text-m3-on-surface-variant text-xs font-medium">Enter manually</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* ── Bottom Sheets ── */}
      <PortionAdjuster ref={portionRef} food={selectedFood} onLogComplete={handleLogComplete} />
      <ManualEntrySheet ref={manualRef} onLogComplete={handleLogComplete} />
    </SafeAreaView>
  );
}

// ── Result Row Component ──────────────────────────────────────────────────

function ResultRow({ item, onPress }: { item: FoodResult; onPress: () => void }) {
  const sourceLabel = item.source === 'usda' ? 'USDA' : 'Open Food Facts';
  return (
    <Pressable
      onPress={onPress}
      className="px-4 py-3 bg-m3-surface-container rounded-2xl border border-m3-outline-variant/30 active:opacity-70"
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-3">
          <Text className="text-m3-on-surface font-medium text-sm" numberOfLines={1}>{item.name}</Text>
          <Text className="text-m3-on-surface-variant text-[10px] mt-0.5">{sourceLabel}</Text>
        </View>
        <Text className="num-tabular font-semibold text-xs text-m3-primary">
          {Math.round(item.caloriesPer100g)} kcal/100g
        </Text>
      </View>
    </Pressable>
  );
}
