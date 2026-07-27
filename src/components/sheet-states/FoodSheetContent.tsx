import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { scanFood, DescribeResult } from '../../services/foodScan';
import { type FoodResult, type DataType } from '../../services/foodSearch';
import { MealType, RecentMeal, getRecentMeals, getMealComponents } from '../../db/database';

import EntryMethodState from './EntryMethodState';
import DescribeInputState from './DescribeInputState';
import ScanningState from './ScanningState';
import ReviewState from './ReviewState';
import SearchInputState from './SearchInputState';
import SingleFoodReviewState from './SingleFoodReviewState';
import ManualInputState from './ManualInputState';

export type FoodSheetStateKey =
  | 'entry'
  | 'describe'
  | 'scanning'
  | 'permission-denied'
  | 'review'
  | 'search'
  | 'single-food-review'
  | 'manual-input';

export interface FoodSheetState {
  visible: boolean;
  stateKey: FoodSheetStateKey;
  describeResult: DescribeResult | null;
  selectedFood: FoodResult | null;
}

interface FoodSheetContentProps {
  state: FoodSheetState;
  setState: React.Dispatch<React.SetStateAction<FoodSheetState>>;
  resetToEntry: () => void;
  onMealLogged: (info: { mealId: number; logIds: number[]; meal: MealType; name: string }) => void;
  skipHistoryRef: React.MutableRefObject<boolean>;
}

export default function FoodSheetContent({
  state,
  setState,
  resetToEntry,
  onMealLogged,
  skipHistoryRef,
}: FoodSheetContentProps) {
  const cancelScanRef = useRef(false);
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);

  useEffect(() => {
    getRecentMeals(5).then(setRecentMeals).catch(() => {});
  }, []);

  const transitionTo = useCallback(
    (stateKey: FoodSheetStateKey, opts?: { describeResult?: DescribeResult | null; pushHistory?: boolean }) => {
      const { describeResult, pushHistory = true } = opts ?? {};
      if (!pushHistory) skipHistoryRef.current = true;
      setState((s) => ({
        ...s,
        stateKey,
        ...(describeResult !== undefined ? { describeResult } : {}),
      }));
    },
    [setState, skipHistoryRef],
  );

  const handleCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      transitionTo('permission-denied');
      return;
    }
    cancelScanRef.current = false;
    transitionTo('scanning');
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (result.canceled || !result.assets?.[0]?.base64) {
        transitionTo('entry', { pushHistory: false });
        return;
      }
      const scanResult = await scanFood(result.assets[0].base64);
      if (cancelScanRef.current) return;
      if (!scanResult) {
        transitionTo('entry', { pushHistory: false });
        return;
      }
      transitionTo('review', { describeResult: scanResult });
    } catch {
      transitionTo('entry', { pushHistory: false });
    }
  }, [transitionTo]);

  const handleGallery = useCallback(async () => {
    cancelScanRef.current = false;
    transitionTo('scanning');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (result.canceled || !result.assets?.[0]?.base64) {
        transitionTo('entry', { pushHistory: false });
        return;
      }
      const scanResult = await scanFood(result.assets[0].base64);
      if (cancelScanRef.current) return;
      if (!scanResult) {
        transitionTo('entry', { pushHistory: false });
        return;
      }
      transitionTo('review', { describeResult: scanResult });
    } catch {
      transitionTo('entry', { pushHistory: false });
    }
  }, [transitionTo]);

  const handleDescribe = useCallback(() => {
    transitionTo('describe');
  }, [transitionTo]);

  const handleDescribeResult = useCallback(
    (result: DescribeResult) => {
      transitionTo('review', { describeResult: result });
    },
    [transitionTo],
  );

  const handleDescribeCancel = useCallback(() => {
    skipHistoryRef.current = true;
    setState((s) => ({ ...s, stateKey: 'entry', describeResult: null, selectedFood: null }));
  }, [setState, skipHistoryRef]);

  const handleSearch = useCallback(() => {
    transitionTo('search');
  }, [transitionTo]);

  const handleSelectFood = useCallback(
    (food: FoodResult) => {
      setState((s) => ({ ...s, selectedFood: food }));
      transitionTo('single-food-review');
    },
    [transitionTo, setState],
  );

  const handleManualEntry = useCallback(() => {
    transitionTo('manual-input');
  }, [transitionTo]);

  const handleSingleLogComplete = useCallback(
    ({ logId, meal }: { logId: number; meal: MealType }) => {
      setState((s) => ({ ...s, visible: false, selectedFood: null }));
      onMealLogged({ mealId: logId, logIds: [logId], meal, name: '' });
    },
    [onMealLogged, setState],
  );

  const handleManualLogComplete = useCallback(
    ({ logId, meal }: { logId: number; meal: MealType }) => {
      setState((s) => ({ ...s, visible: false }));
      onMealLogged({ mealId: logId, logIds: [logId], meal, name: '' });
    },
    [onMealLogged, setState],
  );

  const handleScanCancel = useCallback(() => {
    cancelScanRef.current = true;
    transitionTo('entry', { pushHistory: false });
  }, [transitionTo]);

  const handleSelectRecentMeal = useCallback(
    async (meal: RecentMeal) => {
      const logs = await getMealComponents(meal.meal_id);
      const components: FoodResult[] = logs
        .filter((log) => log.calories_per_100g != null)
        .map((log, i) => {
          const food: FoodResult = {
            id: `meal-comp-${meal.meal_id}-${i}`,
            name: log.name,
            source: log.source as FoodResult['source'],
            sourceFoodId: log.source_food_id ?? '',
            dataType: (log.data_type as DataType) || 'manual',
            brand: log.brand,
            preparation: log.preparation,
            normalizedName: log.name.toLowerCase(),
            caloriesPer100g: log.calories_per_100g,
            proteinPer100g: log.protein_g_per_100g,
            carbsPer100g: log.carbs_g_per_100g,
            fatPer100g: log.fat_g_per_100g,
            servingSizeGrams: log.serving_size_g,
            servingLabel: log.serving_label,
            estimatedGrams: log.grams_logged ?? undefined,
            alternateSourceIds: [],
          };
          return food;
        });
      if (!components.length) return;
      const result: DescribeResult = { mealName: meal.meal_name, components };
      transitionTo('review', { describeResult: result });
    },
    [transitionTo],
  );

  const handleMealLogged = useCallback(
    (info: { mealId: number; logIds: number[]; meal: MealType; name: string }) => {
      setState((s) => ({ ...s, visible: false, describeResult: null }));
      onMealLogged(info);
    },
    [onMealLogged, setState],
  );

  return (
    <View style={{ flex: 1 }}>
      {state.stateKey === 'entry' && (
        <EntryMethodState
          onCamera={handleCamera}
          onGallery={handleGallery}
          onDescribe={handleDescribe}
          onSearch={handleSearch}
          recentMeals={recentMeals}
          onSelectRecentMeal={handleSelectRecentMeal}
        />
      )}
      {state.stateKey === 'describe' && (
        <DescribeInputState onResult={handleDescribeResult} onCancel={handleDescribeCancel} />
      )}
      {state.stateKey === 'scanning' && <ScanningState onCancel={handleScanCancel} />}
      {state.stateKey === 'permission-denied' && (
        <PermissionDeniedState onClose={() => transitionTo('entry', { pushHistory: false })} />
      )}
      {state.stateKey === 'review' && (
        <ReviewState
          result={state.describeResult}
          onLogComplete={handleMealLogged}
        />
      )}
      {state.stateKey === 'search' && (
        <SearchInputState onSelectFood={handleSelectFood} onManualEntry={handleManualEntry} />
      )}
      {state.stateKey === 'single-food-review' && (
        <SingleFoodReviewState food={state.selectedFood} onLogComplete={handleSingleLogComplete} />
      )}
      {state.stateKey === 'manual-input' && (
        <ManualInputState onLogComplete={handleManualLogComplete} />
      )}
    </View>
  );
}

function PermissionDeniedState({ onClose }: { onClose: () => void }) {
  return (
    <View className="px-5 pt-2 pb-6 gap-4 items-center justify-center">
      <Text className="text-m3-on-surface font-semibold text-sm">Camera access denied</Text>
      <Text className="text-m3-on-surface-variant text-xs text-center">To scan a photo, allow camera access in your system settings.</Text>
      <View className="flex-row gap-3">
        <Pressable onPress={() => Linking.openSettings()} className="bg-m3-surface-container-highest rounded-full px-5 py-2.5 active:opacity-60">
          <Text className="text-m3-on-surface text-xs font-semibold">Open Settings</Text>
        </Pressable>
        <Pressable onPress={onClose} className="rounded-full px-5 py-2.5 active:opacity-60">
          <Text className="text-m3-on-surface-variant text-xs font-semibold">Back to options</Text>
        </Pressable>
      </View>
    </View>
  );
}
