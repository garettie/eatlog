import React, { startTransition, useCallback, useEffect, useRef } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInRight, FadeOutLeft, useReducedMotion } from 'react-native-reanimated';

import { scanFood, clarifyMeal, DescribeResult } from '../../services/foodScan';
import { type DataType, type FoodResult } from '../../services/foodSearch';
import { LoggedMeal, MealType, SaveWeightResult, getMealComponents } from '../../db/database';
import { saveMealPhoto } from '../../utils/mealPhotos';
import { formatDayHeader, todayISO } from '../../utils/calendar';
import { M3 } from '../../theme/tokens';

import EntryMethodState from './EntryMethodState';
import DescribeInputState from './DescribeInputState';
import ScanningState from './ScanningState';
import ReviewState from './ReviewState';
import SearchInputState from './SearchInputState';
import RecentFoodsState from './RecentFoodsState';
import SingleFoodReviewState from './SingleFoodReviewState';
import ManualInputState from './ManualInputState';
import WeightInputState from './WeightInputState';

export type FoodSheetStateKey =
  | 'entry'
  | 'describe'
  | 'scanning'
  | 'permission-denied'
  | 'review-loading'
  | 'review'
  | 'search'
  | 'recent-foods'
  | 'weight-input'
  | 'single-food-review'
  | 'manual-input';

export interface FoodSheetState {
  visible: boolean;
  stateKey: FoodSheetStateKey;
  describeResult: DescribeResult | null;
  selectedFood: FoodResult | null;
  photoUri?: string | null;
  pendingAction?: 'camera' | 'gallery' | 'describe' | 'search' | 'weight' | null;
  editMealId?: number | null;
  fromBar?: boolean;
  pendingMeal?: MealType | null;
  /** Target diary date for food inserts (null = today). Weight entry manages its own date. */
  logDate?: string | null;
}

export type LoggedEntryInfo =
  | { kind: 'meal'; mealId: number; logIds: number[]; meal: MealType; name: string; logDate?: string | null }
  | { kind: 'food'; logId: number; meal: MealType; name: string; logDate?: string | null };

export interface WeightLoggedInfo {
  logId: number;
  logDate: string;
  scaleWeightKg: number;
  wasUpdate: boolean;
  previousScaleWeightKg: number | null;
}

interface FoodSheetContentProps {
  state: FoodSheetState;
  setState: React.Dispatch<React.SetStateAction<FoodSheetState>>;
  resetToEntry: () => void;
  onMealLogged: (info: LoggedEntryInfo) => void;
  onWeightLogged: (info: WeightLoggedInfo) => void;
  skipHistoryRef: React.MutableRefObject<boolean>;
}

export default function FoodSheetContent({
  state,
  setState,
  resetToEntry,
  onMealLogged,
  onWeightLogged,
  skipHistoryRef,
}: FoodSheetContentProps) {
  const reduced = useReducedMotion();
  const cancelScanRef = useRef(false);
  const scanBase64Ref = useRef<string | null>(null);
  const mealRequestRef = useRef(0);
  const fromBarRef = useRef(false);
  fromBarRef.current = !!state.fromBar;
  useEffect(() => {
    if (state.stateKey !== 'review-loading') mealRequestRef.current += 1;
  }, [state.stateKey]);
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
    cancelScanRef.current = false;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (cancelScanRef.current) return;
    if (status !== 'granted') {
      if (fromBarRef.current) { resetToEntry(); return; }
      transitionTo('permission-denied');
      return;
    }
    transitionTo('scanning');
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (cancelScanRef.current) return;
      if (result.canceled || !result.assets?.[0]?.base64) {
        if (fromBarRef.current) { resetToEntry(); return; }
        transitionTo('entry', { pushHistory: false });
        return;
      }
      const base64 = result.assets[0].base64;
      scanBase64Ref.current = base64;
      const scanResult = await scanFood(base64);
      if (cancelScanRef.current) return;
      if (!scanResult) {
        if (fromBarRef.current) { resetToEntry(); return; }
        transitionTo('entry', { pushHistory: false });
        return;
      }
      const photoUri = await saveMealPhoto(base64).catch((e) => {
        console.error('[FoodSheet] camera photo save failed', e);
        return null;
      });
      setState((s) => ({ ...s, photoUri }));
      transitionTo('review', { describeResult: scanResult });
    } catch (e) {
      console.error('[FoodSheet] camera flow failed', e);
      if (fromBarRef.current) { resetToEntry(); return; }
      transitionTo('entry', { pushHistory: false });
    }
  }, [transitionTo, resetToEntry]);

  const handleGallery = useCallback(async () => {
    cancelScanRef.current = false;
    transitionTo('scanning');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (cancelScanRef.current) return;
      if (result.canceled || !result.assets?.[0]?.base64) {
        if (fromBarRef.current) { resetToEntry(); return; }
        transitionTo('entry', { pushHistory: false });
        return;
      }
      const base64 = result.assets[0].base64;
      scanBase64Ref.current = base64;
      const scanResult = await scanFood(base64);
      if (cancelScanRef.current) return;
      if (!scanResult) {
        if (fromBarRef.current) { resetToEntry(); return; }
        transitionTo('entry', { pushHistory: false });
        return;
      }
      const photoUri = await saveMealPhoto(base64).catch((e) => {
        console.error('[FoodSheet] gallery photo save failed', e);
        return null;
      });
      setState((s) => ({ ...s, photoUri }));
      transitionTo('review', { describeResult: scanResult });
    } catch (e) {
      console.error('[FoodSheet] gallery flow failed', e);
      if (fromBarRef.current) { resetToEntry(); return; }
      transitionTo('entry', { pushHistory: false });
    }
  }, [transitionTo, resetToEntry]);

  const handleDescribe = useCallback(() => {
    transitionTo('describe');
  }, [transitionTo]);

  const handleDescribeResult = useCallback(
    (result: DescribeResult) => {
      scanBase64Ref.current = null;
      setState((s) => ({ ...s, photoUri: null }));
      transitionTo('review', { describeResult: result });
    },
    [transitionTo, setState],
  );

  const handleDescribeCancel = useCallback(() => {
    if (fromBarRef.current) {
      resetToEntry();
      return;
    }
    skipHistoryRef.current = true;
    setState((s) => ({ ...s, stateKey: 'entry', describeResult: null, selectedFood: null }));
  }, [setState, skipHistoryRef, resetToEntry]);

  const handleSearch = useCallback(() => {
    transitionTo('search');
  }, [transitionTo]);

  const handleRecentFoods = useCallback(() => {
    transitionTo('recent-foods');
  }, [transitionTo]);

  const handleWeight = useCallback(() => {
    transitionTo('weight-input');
  }, [transitionTo]);

  const handleSelectFood = useCallback(
    (food: FoodResult) => {
      setState((s) => ({ ...s, selectedFood: food }));
      transitionTo('single-food-review');
    },
    [transitionTo, setState],
  );

  const handleSelectLoggedMeal = useCallback(async (meal: LoggedMeal) => {
    const requestId = ++mealRequestRef.current;
    transitionTo('review-loading');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const logs = await getMealComponents(meal.meal_id);
      if (requestId !== mealRequestRef.current) return;
      const components: FoodResult[] = logs.map((log, index) => {
        const grams = log.grams_logged && log.grams_logged > 0 ? log.grams_logged : 100;
        const ratio = 100 / grams;
        return {
          id: `recent-meal-${meal.meal_id}-${index}`,
          name: log.name,
          source: log.source as FoodResult['source'],
          sourceFoodId: log.source_food_id ?? '',
          dataType: (log.data_type as DataType) || 'manual',
          brand: log.brand,
          preparation: log.preparation,
          normalizedName: log.name.toLowerCase(),
          caloriesPer100g: log.calories_per_100g ?? log.calories * ratio,
          proteinPer100g: log.protein_g_per_100g ?? log.protein_g * ratio,
          carbsPer100g: log.carbs_g_per_100g ?? log.carbs_g * ratio,
          fatPer100g: log.fat_g_per_100g ?? log.fat_g * ratio,
          servingSizeGrams: log.serving_size_g,
          servingLabel: log.serving_label,
          estimatedGrams: log.grams_logged,
          alternateSourceIds: [],
        };
      });
      if (!components.length) throw new Error('Meal has no reusable components');
      setState((current) => ({ ...current, photoUri: meal.photo_uri }));
      startTransition(() => {
        transitionTo('review', {
          describeResult: { mealName: meal.meal_name, components },
          pushHistory: false,
        });
      });
    } catch (error) {
      if (requestId !== mealRequestRef.current) return;
      console.error('[FoodSheet] recent meal load failed', error);
      transitionTo('recent-foods', { pushHistory: false });
      Alert.alert('Couldn’t open meal', 'Try selecting it again.');
    }
  }, [setState, transitionTo]);

  const handleManualEntry = useCallback(() => {
    transitionTo('manual-input');
  }, [transitionTo]);

  const handleSingleLogComplete = useCallback(
    ({ logId, meal, name, logDate }: { logId: number; meal: MealType; name: string; logDate: string }) => {
      setState((s) => ({ ...s, visible: false, selectedFood: null }));
      onMealLogged({ kind: 'food', logId, meal, name, logDate });
    },
    [onMealLogged, setState],
  );

  const handleManualLogComplete = useCallback(
    ({ logId, meal, name, logDate }: { logId: number; meal: MealType; name: string; logDate: string }) => {
      setState((s) => ({ ...s, visible: false }));
      onMealLogged({ kind: 'food', logId, meal, name, logDate });
    },
    [onMealLogged, setState],
  );

  const handleWeightLogComplete = useCallback((result: SaveWeightResult) => {
    setState((s) => ({ ...s, visible: false }));
    onWeightLogged({
      logId: result.log.id,
      logDate: result.log.log_date,
      scaleWeightKg: result.log.scale_weight_kg,
      wasUpdate: result.wasUpdate,
      previousScaleWeightKg: result.previousScaleWeightKg,
    });
  }, [onWeightLogged, setState]);

  const handleScanCancel = useCallback(() => {
    cancelScanRef.current = true;
    if (fromBarRef.current) {
      resetToEntry();
      return;
    }
    transitionTo('entry', { pushHistory: false });
  }, [transitionTo, resetToEntry]);

  const handleClarify = useCallback(
    async (name: string): Promise<DescribeResult | null> => {
      return clarifyMeal({ name, imageBase64: scanBase64Ref.current ?? undefined });
    },
    [],
  );

  const handleMealLogged = useCallback(
    (info: { mealId: number; logIds: number[]; meal: MealType; name: string; logDate: string }) => {
      setState((s) => ({ ...s, visible: false, describeResult: null, editMealId: null }));
      onMealLogged({ kind: 'meal', ...info });
    },
    [onMealLogged, setState],
  );

  useEffect(() => {
    if (!state.pendingAction) return;
    if (state.stateKey !== 'entry' && state.stateKey !== 'scanning') return;
    const action = state.pendingAction;
    setState((s) => ({ ...s, pendingAction: null }));
    switch (action) {
      case 'camera':
        handleCamera();
        break;
      case 'gallery':
        handleGallery();
        break;
      case 'describe':
        transitionTo('describe');
        break;
      case 'search':
        transitionTo('search');
        break;
      case 'weight':
        transitionTo('weight-input');
        break;
    }
  }, [state.stateKey, state.pendingAction, handleCamera, handleGallery, transitionTo, setState]);

  const showLogDateChip =
    !!state.logDate &&
    state.logDate !== todayISO() &&
    state.stateKey !== 'weight-input';

  return (
    <View style={{ flex: 1 }}>
      {showLogDateChip && (
        <View className="mx-5 mb-1 self-start flex-row items-center gap-1.5 rounded-full bg-m3-surface-container-high px-3 py-1.5">
          <MaterialIcons name="event" size={12} color={M3.onSurfaceVariant} />
          <Text className="text-m3-on-surface-variant text-xs font-semibold">
            Logging to {formatDayHeader(state.logDate!)}
          </Text>
        </View>
      )}
      <Animated.View
        key={state.stateKey}
        entering={reduced ? undefined : FadeInRight.duration(220)}
        exiting={reduced ? undefined : FadeOutLeft.duration(110)}
        style={{ flex: 1 }}
      >
      {state.stateKey === 'entry' && (
        <EntryMethodState
          onCamera={handleCamera}
          onGallery={handleGallery}
          onDescribe={handleDescribe}
          onSearch={handleSearch}
          onRecentFoods={handleRecentFoods}
          onWeight={handleWeight}
        />
      )}
      {state.stateKey === 'describe' && (
        <DescribeInputState onResult={handleDescribeResult} onCancel={handleDescribeCancel} />
      )}
      {state.stateKey === 'scanning' && <ScanningState onCancel={handleScanCancel} />}
      {state.stateKey === 'permission-denied' && (
        <PermissionDeniedState onClose={() => transitionTo('entry', { pushHistory: false })} />
      )}
      {state.stateKey === 'review-loading' && <ReviewLoadingState />}
      {state.stateKey === 'review' && (
        <ReviewState
          result={state.describeResult}
          photoUri={state.photoUri ?? null}
          onLogComplete={handleMealLogged}
          onClarify={handleClarify}
          editMealId={state.editMealId}
          initialMeal={state.pendingMeal}
          logDate={state.logDate ?? null}
        />
      )}
      {state.stateKey === 'search' && (
        <SearchInputState onSelectFood={handleSelectFood} onManualEntry={handleManualEntry} />
      )}
      {state.stateKey === 'recent-foods' && <RecentFoodsState onSelectFood={handleSelectFood} onSelectMeal={handleSelectLoggedMeal} />}
      {state.stateKey === 'weight-input' && <WeightInputState onLogComplete={handleWeightLogComplete} />}
      {state.stateKey === 'single-food-review' && (
        <SingleFoodReviewState food={state.selectedFood} onLogComplete={handleSingleLogComplete} initialMeal={state.pendingMeal} logDate={state.logDate ?? null} />
      )}
      {state.stateKey === 'manual-input' && (
        <ManualInputState onLogComplete={handleManualLogComplete} initialMeal={state.pendingMeal} logDate={state.logDate ?? null} />
      )}
      </Animated.View>
    </View>
  );
}

function ReviewLoadingState() {
  return (
    <View className="flex-1 px-5 pt-3 gap-5">
      <View className="h-12 rounded-xl bg-m3-surface-container-high" />
      <View className="items-center gap-3 py-4">
        <View className="h-10 w-32 rounded-full bg-m3-surface-container-highest" />
        <View className="h-6 w-60 rounded-full bg-m3-surface-container-high" />
      </View>
      <View className="gap-2">
        <View className="h-20 rounded-2xl bg-m3-surface-container-high" />
        <View className="h-20 rounded-2xl bg-m3-surface-container-high" />
        <View className="h-20 rounded-2xl bg-m3-surface-container-high" />
      </View>
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
