import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { scanFood, DescribeResult } from '../../services/foodScan';
import { type FoodResult, type DataType } from '../../services/foodSearch';
import { MealType, RecentMeal, getRecentMeals, getMealComponents, FoodLog } from '../../db/database';
import SheetState from '../SheetState';

import EntryMethodState from './EntryMethodState';
import DescribeInputState from './DescribeInputState';
import ScanningState from './ScanningState';
import ReviewState, { type ReviewStateHandle } from './ReviewState';
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
  detent: 'peek' | 'half' | 'full';
  stateKey: FoodSheetStateKey;
  describeResult: DescribeResult | null;
  selectedFood: FoodResult | null;
}

export interface FoodSheetControls {
  openEntry: () => void;
  close: () => void;
  canClose: () => boolean;
}

interface FoodSheetContentProps {
  state: FoodSheetState;
  setState: React.Dispatch<React.SetStateAction<FoodSheetState>>;
  resetToEntry: () => void;
  registerCanClose: (cb: () => boolean) => void;
  onMealLogged: (info: { mealId: number; logIds: number[]; meal: MealType; name: string }) => void;
}

export default function FoodSheetContent({
  state,
  setState,
  resetToEntry,
  registerCanClose,
  onMealLogged,
}: FoodSheetContentProps) {
  const dirtyRef = useRef<() => boolean>(() => false);
  const loggedRef = useRef<() => boolean>(() => false);
  const markCleanRef = useRef<() => void>(() => {});
  const cancelScanRef = useRef(false);
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);

  // Always re-register the latest canClose
  const canClose = useCallback(() => {
    if (state.stateKey === 'review' && loggedRef.current()) {
      markCleanRef.current();
      return true;
    }
    if (state.stateKey === 'review' && dirtyRef.current()) {
      Alert.alert('Discard changes?', 'Your edits to this meal will be lost.', [
        { text: 'Keep Editing' },
        { text: 'Discard', style: 'destructive', onPress: () => { markCleanRef.current?.(); setState((s) => ({ ...s, visible: false })); } },
      ]);
      return false;
    }
    return true;
  }, [state.stateKey, setState]);

  useEffect(() => {
    registerCanClose(canClose);
  }, [canClose, registerCanClose]);

  useEffect(() => {
    getRecentMeals(5).then(setRecentMeals).catch(() => {});
  }, []);

  const transitionTo = useCallback(
    (stateKey: FoodSheetStateKey, detent: 'peek' | 'half' | 'full', describeResult?: DescribeResult | null) => {
      setState((s) => ({
        ...s,
        stateKey,
        detent,
        ...(describeResult !== undefined ? { describeResult } : {}),
      }));
    },
    [setState],
  );

  const handleCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      transitionTo('permission-denied', 'peek');
      return;
    }
    cancelScanRef.current = false;
    transitionTo('scanning', 'half');
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (result.canceled || !result.assets?.[0]?.base64) {
        transitionTo('entry', 'half');
        return;
      }
      const scanResult = await scanFood(result.assets[0].base64);
      if (cancelScanRef.current) return;
      if (!scanResult) {
        Alert.alert('Scan Failed', 'Could not extract nutritional info. Try again or enter manually.');
        transitionTo('entry', 'half');
        return;
      }
      transitionTo('review', 'full', scanResult);
    } catch {
      transitionTo('entry', 'half');
    }
  }, [transitionTo]);

  const handleGallery = useCallback(async () => {
    cancelScanRef.current = false;
    transitionTo('scanning', 'half');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (result.canceled || !result.assets?.[0]?.base64) {
        transitionTo('entry', 'half');
        return;
      }
      const scanResult = await scanFood(result.assets[0].base64);
      if (cancelScanRef.current) return;
      if (!scanResult) {
        Alert.alert('Scan Failed', 'Could not extract nutritional info. Try again or enter manually.');
        transitionTo('entry', 'half');
        return;
      }
      transitionTo('review', 'full', scanResult);
    } catch {
      transitionTo('entry', 'half');
    }
  }, [transitionTo]);

  const handleDescribe = useCallback(() => {
    transitionTo('describe', 'half');
  }, [transitionTo]);

  const handleDescribeResult = useCallback(
    (result: DescribeResult) => {
      transitionTo('review', 'full', result);
    },
    [transitionTo],
  );

  const handleDescribeCancel = useCallback(() => {
    transitionTo('entry', 'half');
  }, [transitionTo]);

  const handleSearch = useCallback(() => {
    transitionTo('search', 'full');
  }, [transitionTo]);

  const handleSelectFood = useCallback((food: FoodResult) => {
    setState((s) => ({ ...s, selectedFood: food }));
    transitionTo('single-food-review', 'full');
  }, [transitionTo, setState]);

  const handleManualEntry = useCallback(() => {
    transitionTo('manual-input', 'half');
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
    transitionTo('entry', 'half');
  }, [transitionTo]);

  const handleSelectRecentMeal = useCallback(async (meal: RecentMeal) => {
    const logs = await getMealComponents(meal.meal_id);
    const components: FoodResult[] = logs
      .filter(log => log.calories_per_100g != null)
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
    if (!components.length) {
      Alert.alert('Not replayable', 'This meal has no components with per-100g nutrition data.');
      return;
    }
    const result: DescribeResult = { mealName: meal.meal_name, components };
    transitionTo('review', 'full', result);
  }, [transitionTo]);

  const handleMealLogged = useCallback(
    (info: { mealId: number; logIds: number[]; meal: MealType; name: string }) => {
      setState((s) => ({ ...s, visible: false, describeResult: null }));
      onMealLogged(info);
    },
    [onMealLogged, setState],
  );

  return (
    <SheetState stateKey={state.stateKey}>
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
        <PermissionDeniedState onClose={() => transitionTo('entry', 'half')} />
      )}
      {state.stateKey === 'review' && (
        <ReviewState
          result={state.describeResult}
          onLogComplete={handleMealLogged}
          registerDirty={(cb) => { dirtyRef.current = cb; }}
          registerLogged={(isLogged, markClean) => {
            loggedRef.current = isLogged;
            markCleanRef.current = markClean;
          }}
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
    </SheetState>
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