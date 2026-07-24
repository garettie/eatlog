import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { searchFood, FoodResult, DataType } from '../services/foodSearch';
import { scanFood, describeMeal } from '../services/foodScan';
import { getRecentFoodLogs, RecentFood } from '../db/database';
import PortionAdjuster from '../components/PortionAdjuster';
import ManualEntrySheet from '../components/ManualEntrySheet';
import MealReviewSheet from '../components/MealReviewSheet';

function dataTypeBadge(dt: DataType): string {
  switch (dt) {
    case 'Foundation': return 'USDA Foundation';
    case 'SR Legacy': return 'USDA SR Legacy';
    case 'Branded': return 'USDA Branded';
    case 'off': return 'Open Food Facts';
    case 'scan': return 'AI Scan';
    case 'describe': return 'AI Estimate';
    case 'manual': return '';
    default: return '';
  }
}

export default function FoodSearchScreen() {
  const navigation = useNavigation<any>();

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<FoodResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [descriptionText, setDescriptionText] = useState('');
  const [describeResult, setDescribeResult] = useState<{ mealName: string; components: FoodResult[] } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const portionRef = useRef<BottomSheetModal>(null);
  const manualRef = useRef<BottomSheetModal>(null);
  const mealReviewRef = useRef<BottomSheetModal>(null);

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
    mealReviewRef.current?.dismiss();
    getRecentFoodLogs(10).then(setRecents);
  }, []);

  const handleCameraScan = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is needed to scan labels.');
      return;
    }
    setScanning(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const foodResult = await scanFood(result.assets[0].base64);
      if (!foodResult) {
        Alert.alert('Scan Failed', 'Could not extract nutritional info. Try again or enter manually.');
        return;
      }
      setSelectedFood(foodResult);
      setTimeout(() => portionRef.current?.present(), 100);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleGalleryScan = useCallback(async () => {
    setScanning(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const foodResult = await scanFood(result.assets[0].base64);
      if (!foodResult) {
        Alert.alert('Scan Failed', 'Could not extract nutritional info. Try again or enter manually.');
        return;
      }
      setSelectedFood(foodResult);
      setTimeout(() => portionRef.current?.present(), 100);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleDescribeToggle = useCallback(() => {
    setDescribing((prev) => !prev);
    setDescriptionText('');
  }, []);

  const handleDescribeEstimate = useCallback(async () => {
    const text = descriptionText.trim();
    if (!text) return;
    Keyboard.dismiss();
    setScanning(true);
    try {
      const result = await describeMeal(text);
      if (!result) {
        Alert.alert('Description Failed', 'Could not analyze the meal. Try again or enter manually.');
        return;
      }
      setDescribing(false);
      setDescriptionText('');
      setDescribeResult(result);
      setTimeout(() => mealReviewRef.current?.present(), 100);
    } finally {
      setScanning(false);
    }
  }, [descriptionText]);

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <View className="px-4 pt-2 pb-3 flex-row items-center gap-2 bg-m3-surface-container-low">
        <Pressable onPress={() => navigation.goBack()} className="p-1" hitSlop={10}>
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
            onSubmitEditing={Keyboard.dismiss}
          />
          {isSearching && (
            <ActivityIndicator size="small" color="#c4c6d0" style={{ marginRight: 8 }} />
          )}
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <MaterialIcons name="close" size={18} color="#c4c6d0" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-3"
        contentContainerClassName="pb-8 gap-1.5"
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Scan Actions ── */}
        <View className="flex-row gap-2 mb-3">
          <Pressable
            onPress={handleCameraScan}
            disabled={scanning}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-m3-surface-container-high rounded-full py-2.5 border border-m3-outline-variant/30 active:opacity-70"
          >
            <MaterialIcons name="photo-camera" size={14} color="#e2e2e9" />
            <Text className="text-white text-[11px] font-semibold">Camera</Text>
          </Pressable>
          <Pressable
            onPress={handleGalleryScan}
            disabled={scanning}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-m3-surface-container-high rounded-full py-2.5 border border-m3-outline-variant/30 active:opacity-70"
          >
            <MaterialIcons name="photo-library" size={14} color="#e2e2e9" />
            <Text className="text-white text-[11px] font-semibold">Gallery</Text>
          </Pressable>
          <Pressable
            onPress={handleDescribeToggle}
            disabled={scanning}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-m3-surface-container-high rounded-full py-2.5 border border-m3-outline-variant/30 active:opacity-70"
          >
            <MaterialIcons name="edit-note" size={14} color="#e2e2e9" />
            <Text className="text-white text-[11px] font-semibold">Describe</Text>
          </Pressable>
        </View>

        {scanning && (
          <View className="py-4 items-center">
            <ActivityIndicator size="small" color="#ffffff" />
            <Text className="text-m3-on-surface-variant text-xs mt-2">Analyzing with Gemini...</Text>
          </View>
        )}

        {/* ── Describe Card ── */}
        {describing && (
          <View className="mb-3 bg-m3-surface-container rounded-xl p-3 gap-3 border border-m3-outline-variant/30">
            <TextInput
              value={descriptionText}
              onChangeText={setDescriptionText}
              placeholder="e.g. chicken rice bowl with broccoli, about 500g"
              placeholderTextColor="#c4c6d0"
              multiline
              numberOfLines={3}
              className="bg-m3-surface-container-high text-m3-on-surface text-sm rounded-xl px-4 py-3 border border-m3-outline-variant/50"
              autoFocus
            />
            <Pressable
              onPress={handleDescribeEstimate}
              disabled={scanning || !descriptionText.trim()}
              className="bg-white py-2.5 rounded-full items-center justify-center active:scale-95 disabled:opacity-40"
            >
              <Text className="text-black font-semibold text-sm">Estimate</Text>
            </Pressable>
          </View>
        )}

        {/* ── Loading (initial search only; refinements use the inline spinner) ── */}
        {isSearching && results.length === 0 && (
          <View className="py-12 items-center">
            <ActivityIndicator size="small" color="#ffffff" />
            <Text className="text-m3-on-surface-variant text-xs mt-3">Searching...</Text>
          </View>
        )}

        {/* ── Recents ── */}
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
              const food: FoodResult = {
                id: `recent-${idx}`,
                name: item.name,
                source: item.source as 'usda' | 'off',
                sourceFoodId: item.source_food_id ?? '',
                dataType: (item.data_type as DataType) || (item.source === 'usda' ? 'Branded' : 'off'),
                brand: item.brand,
                preparation: item.preparation,
                normalizedName: '',
                caloriesPer100g: cal,
                proteinPer100g: pro,
                carbsPer100g: ca,
                fatPer100g: fa,
                servingSizeGrams: item.serving_size_g ?? null,
                servingLabel: item.serving_label ?? null,
                alternateSourceIds: [],
              };
              return (
                <ResultRow key={food.id} item={food} onPress={() => handleResultPress(food)} />
              );
            })}
          </View>
        )}

        {/* ── Empty recents ── */}
        {!query.trim() && !isSearching && recents.length === 0 && (
          <View className="py-12 items-center">
            <MaterialIcons name="restaurant" size={36} color="#44474f" />
            <Text className="text-m3-on-surface-variant text-sm mt-3 font-medium">Search for a food to get started</Text>
          </View>
        )}

        {/* ── Search results ── */}
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

        {/* ── No results ── */}
        {hasSearched && !isSearching && results.length === 0 && (
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

        {/* ── Manual entry ── */}
        {hasSearched && results.length > 0 && (
          <Pressable
            onPress={handleManualEntry}
            className="flex-row items-center justify-center gap-2 py-4 mt-1"
          >
            <MaterialIcons name="add-circle-outline" size={18} color="#c4c6d0" />
            <Text className="text-m3-on-surface-variant text-xs font-medium">Enter manually</Text>
          </Pressable>
        )}
      </ScrollView>

      <PortionAdjuster ref={portionRef} food={selectedFood} onLogComplete={handleLogComplete} />
      <ManualEntrySheet ref={manualRef} onLogComplete={handleLogComplete} />
      <MealReviewSheet ref={mealReviewRef} result={describeResult} onLogComplete={handleLogComplete} />
    </SafeAreaView>
  );
}

// ── Result Row ────────────────────────────────────────────────────────────

function ResultRow({ item, onPress }: { item: FoodResult; onPress: () => void }) {
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
