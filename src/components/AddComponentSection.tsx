import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { loadFoodDetails, type FoodResult } from '../services/foodSearch';
import { buildFoodPortions } from '../services/foodSearchCore';
import { describeMeal } from '../services/foodScan';
import { useFoodSearchController } from '../hooks/useFoodSearchController';
import { M3 } from '../theme/tokens';
import PrimaryButton from './PrimaryButton';
import FoodSearchResultRow from './FoodSearchResultRow';

type AddMode = 'search' | 'describe' | 'manual' | null;

interface AddComponentSectionProps {
  onAdd: (foods: FoodResult[]) => void;
}

export default function AddComponentSection({ onAdd }: AddComponentSectionProps) {
  const [mode, setMode] = useState<AddMode>(null);
  const search = useFoodSearchController();
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const [describeText, setDescribeText] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [describeError, setDescribeError] = useState<string | null>(null);

  const [manualName, setManualName] = useState('');
  const [manualCal, setManualCal] = useState('');
  const [manualPro, setManualPro] = useState('');
  const [manualCarb, setManualCarb] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualGrams, setManualGrams] = useState('100');
  const manualNutrients = [manualCal, manualPro, manualCarb, manualFat].map(Number);
  const manualGramsValue = Number(manualGrams);
  const manualCanAdd = manualName.trim().length > 0
    && Number.isFinite(manualGramsValue)
    && manualGramsValue > 0
    && manualNutrients.every((value) => Number.isFinite(value) && value >= 0)
    && manualNutrients.some((value) => value > 0);

  const reset = useCallback(() => {
    setMode(null);
    search.setQuery('');
    setDescribeText('');
    setDescribeError(null);
  }, [search]);

  const handleSearchSelect = useCallback(async (food: FoodResult) => {
    if (selectingId) return;
    setSelectingId(food.id);
    try {
      let selected = food;
      if (food.source === 'usda' && !food.history) {
        selected = await loadFoodDetails(food).catch(() => food);
      }
      onAdd([selected]);
      reset();
    } finally {
      setSelectingId(null);
    }
  }, [onAdd, reset, selectingId]);

  const handleDescribe = useCallback(async () => {
    const text = describeText.trim();
    if (!text) return;
    setDescribeError(null);
    setIsEstimating(true);
    try {
      const result = await describeMeal(text);
      if (result.ok && result.result.components.length > 0) {
        onAdd(result.result.components);
        reset();
      } else {
        setDescribeError(result.ok ? "Couldn't estimate this meal. Try a different description." : result.message);
      }
    } catch {
      setDescribeError('Estimate failed. Check your connection.');
    } finally {
      setIsEstimating(false);
    }
  }, [describeText, onAdd, reset]);

  const handleManualAdd = useCallback(() => {
    if (!manualCanAdd) return;
    const [cal, pro, carb, fat] = manualNutrients;
    const grams = manualGramsValue;

    const name = manualName.trim();
    const portions = buildFoodPortions([{ id: 'reviewed', label: 'Reviewed amount', grams }]);
    const food: FoodResult = {
      id: `manual-${Date.now()}`,
      name,
      source: 'manual',
      sourceFoodId: '',
      dataType: 'manual',
      brand: null,
      preparation: null,
      normalizedName: name.toLowerCase(),
      caloriesPer100g: cal > 0 ? cal : null,
      proteinPer100g: pro > 0 ? pro : null,
      carbsPer100g: carb > 0 ? carb : null,
      fatPer100g: fat > 0 ? fat : null,
      portions,
      defaultPortionId: portions[0].id,
      estimatedGrams: grams,
      alternateSourceIds: [],
    };
    onAdd([food]);
    setManualName('');
    setManualCal('');
    setManualPro('');
    setManualCarb('');
    setManualFat('');
    setManualGrams('100');
    reset();
  }, [manualName, manualCanAdd, manualNutrients, manualGramsValue, onAdd, reset]);

  if (mode === null) {
    return (
      <Pressable
        onPress={() => setMode('describe')}
        accessibilityRole="button"
        accessibilityLabel="Add component"
        accessibilityHint="Opens a description estimate, with search and manual entry available as fallbacks"
        className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/30 active:opacity-60"
      >
        <MaterialIcons name="add-circle-outline" size={20} color={M3.onSurface} />
        <Text className="text-m3-on-surface text-sm font-semibold">Add component</Text>
      </Pressable>
    );
  }

  return (
    <View className="bg-m3-surface-container-high rounded-2xl px-4 py-4 gap-4 border border-m3-outline-variant/30">
      <View className="flex-row gap-2 items-center">
        <Pressable
          onPress={() => setMode('search')}
          accessibilityRole="button"
          accessibilityLabel="Search component"
          accessibilityState={{ selected: mode === 'search' }}
          className={`flex-1 min-h-[48px] rounded-full items-center justify-center active:opacity-70 ${mode === 'search' ? 'bg-m3-surface-container-highest' : ''}`}
        >
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="search" size={14} color={mode === 'search' ? M3.onSurface : M3.onSurfaceVariant} />
            <Text className={`text-xs font-semibold ${mode === 'search' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>
              Search
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setMode('describe')}
          accessibilityRole="button"
          accessibilityLabel="Describe component"
          accessibilityState={{ selected: mode === 'describe' }}
          className={`flex-1 min-h-[48px] rounded-full items-center justify-center active:opacity-70 ${mode === 'describe' ? 'bg-m3-surface-container-highest' : ''}`}
        >
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="auto-awesome" size={14} color={mode === 'describe' ? M3.onSurface : M3.onSurfaceVariant} />
            <Text className={`text-xs font-semibold ${mode === 'describe' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>
              Describe
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setMode('manual')}
          accessibilityRole="button"
          accessibilityLabel="Manual entry"
          accessibilityState={{ selected: mode === 'manual' }}
          className={`flex-1 min-h-[48px] rounded-full items-center justify-center active:opacity-70 ${mode === 'manual' ? 'bg-m3-surface-container-highest' : ''}`}
        >
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="edit" size={14} color={mode === 'manual' ? M3.onSurface : M3.onSurfaceVariant} />
            <Text className={`text-xs font-semibold ${mode === 'manual' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>
              Manual
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel="Cancel adding component" className="w-12 h-12 items-center justify-center active:opacity-60">
          <MaterialIcons name="close" size={18} color={M3.onSurfaceVariant} />
        </Pressable>
      </View>

      {mode === 'search' && (
        <View className="gap-3">
          <View className="flex-row items-center bg-m3-surface-container rounded-xl px-4 py-3 border border-m3-outline-variant/50">
            <MaterialIcons name="search" size={16} color={M3.onSurfaceVariant} />
            <BottomSheetTextInput
              value={search.query}
              onChangeText={search.setQuery}
              accessibilityLabel="Search foods"
              placeholder="Search foods…"
              placeholderTextColor={M3.placeholder}
              className="flex-1 text-m3-on-surface text-sm ml-2"
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={search.submit}
            />
            {search.remoteState === 'loading' && <View className="ml-1"><ActivityIndicator size="small" color={M3.onSurfaceVariant} /></View>}
            {search.query.length > 0 && (
              <Pressable onPress={() => search.setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear component search" className="w-12 h-12 items-center justify-center -mr-3">
                <MaterialIcons name="close" size={16} color={M3.onSurfaceVariant} />
              </Pressable>
            )}
          </View>
          {search.personalResults.map((item) => (
            <FoodSearchResultRow key={item.id} food={item} onPress={() => void handleSearchSelect(item)} quickLogging={selectingId === item.id} accessibilityHint="Adds this component to the meal" />
          ))}
          {search.remoteResults.map((item) => (
            <FoodSearchResultRow key={item.id} food={item} onPress={() => void handleSearchSelect(item)} quickLogging={selectingId === item.id} accessibilityHint="Adds this component to the meal" />
          ))}
          {search.remoteState === 'partial' && (
            <Text accessibilityLiveRegion="polite" className="text-m3-on-surface-variant text-xs">
              Some sources are unavailable. Showing available results.
            </Text>
          )}
          {search.remoteState === 'unavailable' && (
            <View className="bg-m3-error-container rounded-xl px-4 py-3 gap-3">
              <Text className="text-m3-on-error-container text-xs font-medium">Online foods unavailable. Personal history still works.</Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable onPress={search.retry} accessibilityRole="button" accessibilityLabel="Retry component search" className="min-h-[48px] justify-center rounded-full bg-m3-surface-container-high px-4 active:opacity-60">
                  <Text className="text-m3-on-surface text-xs font-semibold">Retry</Text>
                </Pressable>
                <Pressable onPress={() => { setDescribeText(search.query); setMode('describe'); }} accessibilityRole="button" accessibilityLabel="Describe component instead" className="min-h-[48px] justify-center px-2 active:opacity-60">
                  <Text className="text-m3-on-error-container text-xs font-semibold">Describe instead</Text>
                </Pressable>
                <Pressable onPress={() => setMode('manual')} accessibilityRole="button" accessibilityLabel="Enter component manually" className="min-h-[48px] justify-center px-2 active:opacity-60">
                  <Text className="text-m3-on-error-container text-xs font-semibold">Enter manually</Text>
                </Pressable>
              </View>
            </View>
          )}
          {!search.localLoading && search.remoteState !== 'loading' && search.query.trim().length > 0 && search.personalResults.length === 0 && search.remoteResults.length === 0 && (
            <View className="gap-2">
              <Text className="text-m3-on-surface-variant text-xs text-center py-2">No results</Text>
              <Pressable onPress={() => { setDescribeText(search.query); setMode('describe'); }} accessibilityRole="button" className="min-h-[48px] justify-center items-center rounded-full bg-m3-surface-container px-4 active:opacity-60">
                <Text className="text-m3-on-surface text-xs font-semibold">Estimate “{search.query.trim()}” with AI</Text>
              </Pressable>
              <Pressable onPress={() => setMode('manual')} accessibilityRole="button" className="min-h-[48px] justify-center items-center px-4 active:opacity-60">
                <Text className="text-m3-on-surface-variant text-xs font-semibold">Enter manually</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {mode === 'describe' && (
        <View className="gap-3">
          <BottomSheetTextInput
            value={describeText}
            onChangeText={setDescribeText}
            accessibilityLabel="Describe a component"
            placeholder="e.g. 2 eggs with toast"
            placeholderTextColor={M3.placeholder}
            multiline
            numberOfLines={2}
            className="bg-m3-surface-container text-m3-on-surface text-sm rounded-xl px-4 py-3 border border-m3-outline-variant/50"
            autoFocus
          />
          <PrimaryButton
            title="Estimate"
            onPress={handleDescribe}
            loading={isEstimating}
            disabled={!describeText.trim()}
          />
          {describeError && (
            <View className="bg-m3-error-container rounded-xl px-4 py-3 gap-2">
              <Text className="text-m3-on-error-container text-xs font-medium">{describeError}</Text>
            </View>
          )}
        </View>
      )}

      {mode === 'manual' && (
        <View className="gap-4">
          <BottomSheetTextInput
            value={manualName}
            onChangeText={setManualName}
            accessibilityLabel="Food name"
            placeholder="e.g. Olive Oil"
            placeholderTextColor={M3.placeholder}
            className="bg-m3-surface-container text-m3-on-surface text-sm font-medium rounded-xl px-4 py-3 border border-m3-outline-variant/50"
            autoFocus
          />
          <Text className="text-m3-on-surface-variant text-xs font-medium">Nutrition per 100g</Text>
          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Text className="text-compact text-m3-on-surface-variant font-semibold text-center">Calories</Text>
              <BottomSheetTextInput
                value={manualCal}
                onChangeText={setManualCal}
                accessibilityLabel="Calories per 100 grams"
                placeholder="0"
                placeholderTextColor={M3.placeholder}
                keyboardType="numeric"
                className="bg-m3-surface-container text-m3-on-surface text-sm font-medium rounded-xl px-3 py-2.5 border border-m3-outline-variant/50 text-center"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-compact text-m3-protein font-semibold text-center">Protein</Text>
              <BottomSheetTextInput
                value={manualPro}
                onChangeText={setManualPro}
                accessibilityLabel="Protein per 100 grams"
                placeholder="0"
                placeholderTextColor={M3.placeholder}
                keyboardType="numeric"
                className="bg-m3-surface-container text-m3-on-surface text-sm font-medium rounded-xl px-3 py-2.5 border border-m3-outline-variant/50 text-center"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-compact text-m3-carbs font-semibold text-center">Carbs</Text>
              <BottomSheetTextInput
                value={manualCarb}
                onChangeText={setManualCarb}
                accessibilityLabel="Carbohydrates per 100 grams"
                placeholder="0"
                placeholderTextColor={M3.placeholder}
                keyboardType="numeric"
                className="bg-m3-surface-container text-m3-on-surface text-sm font-medium rounded-xl px-3 py-2.5 border border-m3-outline-variant/50 text-center"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-compact text-m3-fat font-semibold text-center">Fat</Text>
              <BottomSheetTextInput
                value={manualFat}
                onChangeText={setManualFat}
                accessibilityLabel="Fat per 100 grams"
                placeholder="0"
                placeholderTextColor={M3.placeholder}
                keyboardType="numeric"
                className="bg-m3-surface-container text-m3-on-surface text-sm font-medium rounded-xl px-3 py-2.5 border border-m3-outline-variant/50 text-center"
              />
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <BottomSheetTextInput
              value={manualGrams}
              onChangeText={setManualGrams}
              accessibilityLabel="Portion weight in grams"
              placeholder="150"
              placeholderTextColor={M3.placeholder}
              keyboardType="numeric"
              className="w-24 text-center bg-m3-surface-container rounded-xl py-3 px-2 text-m3-on-surface text-sm font-semibold border border-m3-outline-variant/50"
            />
            <Text className="text-xs text-m3-on-surface-variant">grams</Text>
          </View>
          <PrimaryButton
            title="Add"
            onPress={handleManualAdd}
            disabled={!manualCanAdd}
          />
        </View>
      )}
    </View>
  );
}
