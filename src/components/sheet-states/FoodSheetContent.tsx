import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { scanFood, clarifyMeal, DescribeResult, FoodEstimationFailureKind } from '../../services/foodScan';
import { serviceConfig } from '../../config/services';
import { type DataType, type FoodResult } from '../../services/foodSearch';
import { LoggedMeal, MealType, SaveWeightResult, getMealComponents } from '../../db/database';
import { saveMealPhoto } from '../../utils/mealPhotos';
import { formatDayHeader, todayISO } from '../../utils/calendar';
import { EASING } from '../../theme/motion';
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
  | 'estimation-error'
  | 'review-loading'
  | 'review'
  | 'search'
  | 'recent-foods'
  | 'weight-input'
  | 'single-food-review'
  | 'manual-input';

type FoodSheetFailureKind =
  | FoodEstimationFailureKind
  | 'camera-unavailable'
  | 'gallery-unavailable'
  | 'photo-unreadable';

const FAILURE_MESSAGES: Record<FoodSheetFailureKind, string> = {
  unavailable: 'Food estimates are not configured in this build.',
  network: 'Check your connection, then try again.',
  timeout: 'The estimate took too long. Try again.',
  provider: 'The estimation service could not complete this request.',
  'invalid-response': 'This photo did not produce a usable food estimate.',
  'camera-unavailable': 'The camera could not open. Try again or choose another logging method.',
  'gallery-unavailable': 'The photo library could not open. Try again or choose another logging method.',
  'photo-unreadable': 'The selected photo could not be read. Choose another photo or logging method.',
};

const CONTENT_EXIT_DURATION = 90;
const CONTENT_ENTER_DURATION = 150;

export interface FoodSheetState {
  visible: boolean;
  stateKey: FoodSheetStateKey;
  describeResult: DescribeResult | null;
  selectedFood: FoodResult | null;
  photoUri?: string | null;
  pendingAction?: 'camera' | 'gallery' | 'describe' | 'search' | 'weight' | null;
  estimationFailure?: FoodSheetFailureKind | null;
  cameraPermissionCanAskAgain?: boolean | null;
  editMealId?: number | null;
  fromBar?: boolean;
  pendingMeal?: MealType | null;
  /** Target diary date for food inserts (null = today). Weight entry manages its own date. */
  logDate?: string | null;
}

export type LoggedEntryInfo =
  | { kind: 'meal'; mealId: number; logIds: number[]; meal: MealType; name: string; calories: number; wasUpdate: boolean; logDate?: string | null }
  | { kind: 'food'; logId: number; meal: MealType; name: string; calories: number; logDate?: string | null };

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
  onGoBack: () => boolean;
}

export default function FoodSheetContent({
  state,
  setState,
  resetToEntry,
  onMealLogged,
  onWeightLogged,
  skipHistoryRef,
  onGoBack,
}: FoodSheetContentProps) {
  const reduced = useReducedMotion();
  const scanRequestRef = useRef(0);
  const scanInFlightRef = useRef(false);
  const scanBase64Ref = useRef<string | null>(null);
  const mealRequestRef = useRef(0);
  const fromBarRef = useRef(false);
  const previousStateKeyRef = useRef(state.stateKey);
  const [renderedStateKey, setRenderedStateKey] = useState(state.stateKey);
  const stateTransitionRequestRef = useRef(0);
  const enteringStateRef = useRef(false);
  const stateOffset = useSharedValue(0);
  const stateOpacity = useSharedValue(1);
  fromBarRef.current = !!state.fromBar;

  const commitRenderedState = useCallback((stateKey: FoodSheetStateKey, requestId: number) => {
    if (requestId !== stateTransitionRequestRef.current) return;
    enteringStateRef.current = true;
    setRenderedStateKey(stateKey);
  }, []);

  useEffect(() => {
    const requestId = ++stateTransitionRequestRef.current;
    if (state.stateKey === renderedStateKey) {
      stateOffset.value = withTiming(0, {
        duration: reduced ? 0 : CONTENT_ENTER_DURATION,
        easing: EASING.emphasizedDecelerate,
      });
      stateOpacity.value = withTiming(1, { duration: reduced ? 0 : CONTENT_ENTER_DURATION });
      return;
    }
    if (reduced) {
      enteringStateRef.current = false;
      stateOffset.value = 0;
      stateOpacity.value = 1;
      setRenderedStateKey(state.stateKey);
      return;
    }
    stateOffset.value = withTiming(-20, {
      duration: reduced ? 0 : CONTENT_EXIT_DURATION,
      easing: EASING.emphasizedAccelerate,
    });
    stateOpacity.value = withTiming(0, { duration: reduced ? 0 : CONTENT_EXIT_DURATION }, (finished) => {
      if (finished) runOnJS(commitRenderedState)(state.stateKey, requestId);
    });
  }, [reduced, state.stateKey]);

  useLayoutEffect(() => {
    if (!enteringStateRef.current || reduced) return;
    enteringStateRef.current = false;
    stateOffset.value = 20;
    stateOpacity.value = 0;
    stateOffset.value = withTiming(0, {
      duration: reduced ? 0 : CONTENT_ENTER_DURATION,
      easing: EASING.emphasizedDecelerate,
    });
    stateOpacity.value = withTiming(1, { duration: reduced ? 0 : CONTENT_ENTER_DURATION });
  }, [reduced, renderedStateKey]);

  const stateTransitionStyle = useAnimatedStyle(() => ({
    opacity: stateOpacity.value,
    transform: [{ translateX: stateOffset.value }],
  }));

  useEffect(() => {
    if (state.stateKey !== 'review-loading') mealRequestRef.current += 1;
  }, [state.stateKey]);
  useEffect(() => {
    const leftScanning =
      previousStateKeyRef.current === 'scanning' &&
      state.stateKey !== 'scanning';
    if ((!state.visible || leftScanning) && scanInFlightRef.current) {
      scanRequestRef.current += 1;
      scanInFlightRef.current = false;
    }
    previousStateKeyRef.current = state.stateKey;
  }, [state.stateKey, state.visible]);
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

  const showScanError = useCallback(
    (kind: FoodSheetFailureKind, pendingAction: 'camera' | 'gallery') => {
      setState((s) => ({
        ...s,
        stateKey: 'estimation-error',
        estimationFailure: kind,
        pendingAction,
      }));
    },
    [setState],
  );

  const handleCamera = useCallback(async () => {
    if (scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    const requestId = ++scanRequestRef.current;

    try {
      if (!serviceConfig.availability.gemini) {
        showScanError('unavailable', 'camera');
        return;
      }

      const permission = await ImagePicker.requestCameraPermissionsAsync().catch((error) => {
        console.error('[FoodSheet] camera permission request failed', error);
        if (requestId === scanRequestRef.current) showScanError('camera-unavailable', 'camera');
        return null;
      });
      if (!permission || requestId !== scanRequestRef.current) return;
      if (!permission.granted) {
        setState((s) => ({
          ...s,
          stateKey: 'permission-denied',
          pendingAction: null,
          cameraPermissionCanAskAgain: permission.canAskAgain,
        }));
        return;
      }

      transitionTo('scanning');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      }).catch((error) => {
        console.error('[FoodSheet] camera launch failed', error);
        if (requestId === scanRequestRef.current) showScanError('camera-unavailable', 'camera');
        return null;
      });
      if (!result || requestId !== scanRequestRef.current) return;
      if (result.canceled) {
        if (fromBarRef.current) { resetToEntry(); return; }
        transitionTo('entry', { pushHistory: false });
        return;
      }
      const base64 = result.assets[0]?.base64;
      if (!base64) {
        showScanError('photo-unreadable', 'camera');
        return;
      }
      scanBase64Ref.current = base64;
      const scanResult = await scanFood(base64).catch((error) => {
        console.error('[FoodSheet] camera estimate failed unexpectedly', error);
        if (requestId === scanRequestRef.current) showScanError('provider', 'camera');
        return null;
      });
      if (!scanResult || requestId !== scanRequestRef.current) return;
      if (!scanResult.ok) {
        showScanError(scanResult.kind, 'camera');
        return;
      }
      const photoUri = await saveMealPhoto(base64).catch((e) => {
        console.error('[FoodSheet] camera photo save failed', e);
        return null;
      });
      if (requestId !== scanRequestRef.current) return;
      setState((s) => ({ ...s, photoUri }));
      transitionTo('review', { describeResult: scanResult.result });
    } finally {
      if (requestId === scanRequestRef.current) scanInFlightRef.current = false;
    }
  }, [transitionTo, resetToEntry, setState, showScanError]);

  const handleGallery = useCallback(async () => {
    if (scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    const requestId = ++scanRequestRef.current;

    try {
      if (!serviceConfig.availability.gemini) {
        showScanError('unavailable', 'gallery');
        return;
      }

      transitionTo('scanning');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      }).catch((error) => {
        console.error('[FoodSheet] gallery launch failed', error);
        if (requestId === scanRequestRef.current) showScanError('gallery-unavailable', 'gallery');
        return null;
      });
      if (!result || requestId !== scanRequestRef.current) return;
      if (result.canceled) {
        if (fromBarRef.current) { resetToEntry(); return; }
        transitionTo('entry', { pushHistory: false });
        return;
      }
      const base64 = result.assets[0]?.base64;
      if (!base64) {
        showScanError('photo-unreadable', 'gallery');
        return;
      }
      scanBase64Ref.current = base64;
      const scanResult = await scanFood(base64).catch((error) => {
        console.error('[FoodSheet] gallery estimate failed unexpectedly', error);
        if (requestId === scanRequestRef.current) showScanError('provider', 'gallery');
        return null;
      });
      if (!scanResult || requestId !== scanRequestRef.current) return;
      if (!scanResult.ok) {
        showScanError(scanResult.kind, 'gallery');
        return;
      }
      const photoUri = await saveMealPhoto(base64).catch((e) => {
        console.error('[FoodSheet] gallery photo save failed', e);
        return null;
      });
      if (requestId !== scanRequestRef.current) return;
      setState((s) => ({ ...s, photoUri }));
      transitionTo('review', { describeResult: scanResult.result });
    } finally {
      if (requestId === scanRequestRef.current) scanInFlightRef.current = false;
    }
  }, [transitionTo, resetToEntry, setState, showScanError]);

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
      transitionTo('review', {
        describeResult: { mealName: meal.meal_name, components },
        pushHistory: false,
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
    ({ logId, meal, name, calories, logDate }: { logId: number; meal: MealType; name: string; calories: number; logDate: string }) => {
      setState((s) => ({ ...s, visible: false, selectedFood: null }));
      onMealLogged({ kind: 'food', logId, meal, name, calories, logDate });
    },
    [onMealLogged, setState],
  );

  const handleManualLogComplete = useCallback(
    ({ logId, meal, name, calories, logDate }: { logId: number; meal: MealType; name: string; calories: number; logDate: string }) => {
      setState((s) => ({ ...s, visible: false }));
      onMealLogged({ kind: 'food', logId, meal, name, calories, logDate });
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
    scanRequestRef.current += 1;
    scanInFlightRef.current = false;
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
    (info: { mealId: number; logIds: number[]; meal: MealType; name: string; calories: number; wasUpdate: boolean; logDate: string }) => {
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
    renderedStateKey !== 'weight-input';

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
        style={[{ flex: 1 }, stateTransitionStyle]}
      >
      {renderedStateKey === 'entry' && (
        <EntryMethodState
          onCamera={handleCamera}
          onGallery={handleGallery}
          onDescribe={handleDescribe}
          onSearch={handleSearch}
          onRecentFoods={handleRecentFoods}
          onWeight={handleWeight}
          estimatesAvailable={serviceConfig.availability.gemini}
        />
      )}
      {renderedStateKey === 'describe' && (
        <DescribeInputState onResult={handleDescribeResult} onBack={onGoBack} onSearch={handleSearch} onManualEntry={handleManualEntry} />
      )}
      {renderedStateKey === 'scanning' && <ScanningState onCancel={handleScanCancel} />}
      {renderedStateKey === 'permission-denied' && (
        <PermissionDeniedState
          canAskAgain={state.cameraPermissionCanAskAgain !== false}
          onRetry={handleCamera}
          onClose={() => {
            setState((s) => ({ ...s, cameraPermissionCanAskAgain: null }));
            transitionTo('entry', { pushHistory: false });
          }}
        />
      )}
      {renderedStateKey === 'estimation-error' && (
        <EstimationErrorState
          kind={state.estimationFailure ?? 'provider'}
          source={state.pendingAction === 'gallery' ? 'Gallery' : 'Camera'}
          onRetry={state.estimationFailure === 'unavailable' ? undefined : () => {
            const action = state.pendingAction;
            skipHistoryRef.current = true;
            setState((s) => ({ ...s, stateKey: 'scanning', pendingAction: action, estimationFailure: null }));
          }}
          onSearch={() => {
            skipHistoryRef.current = true;
            setState((s) => ({ ...s, stateKey: 'search', pendingAction: null, estimationFailure: null }));
          }}
          onDescribe={() => {
            skipHistoryRef.current = true;
            setState((s) => ({ ...s, stateKey: 'describe', pendingAction: null, estimationFailure: null }));
          }}
          onManualEntry={() => {
            skipHistoryRef.current = true;
            setState((s) => ({ ...s, stateKey: 'manual-input', pendingAction: null, estimationFailure: null }));
          }}
        />
      )}
      {renderedStateKey === 'review-loading' && <ReviewLoadingState />}
      {renderedStateKey === 'review' && (
        <ReviewState
          result={state.describeResult}
          photoUri={state.photoUri ?? null}
          onLogComplete={handleMealLogged}
          onClarify={handleClarify}
          editMealId={state.editMealId}
          initialMeal={state.pendingMeal}
          logDate={state.logDate ?? null}
          onGoBack={onGoBack}
        />
      )}
      {renderedStateKey === 'search' && (
        <SearchInputState onSelectFood={handleSelectFood} onManualEntry={handleManualEntry} onBack={onGoBack} />
      )}
      {renderedStateKey === 'recent-foods' && <RecentFoodsState onSelectFood={handleSelectFood} onSelectMeal={handleSelectLoggedMeal} onBack={onGoBack} />}
      {renderedStateKey === 'weight-input' && <WeightInputState onLogComplete={handleWeightLogComplete} onBack={onGoBack} />}
      {renderedStateKey === 'single-food-review' && (
        <SingleFoodReviewState food={state.selectedFood} onLogComplete={handleSingleLogComplete} initialMeal={state.pendingMeal} logDate={state.logDate ?? null} onBack={onGoBack} />
      )}
      {renderedStateKey === 'manual-input' && (
        <ManualInputState onLogComplete={handleManualLogComplete} initialMeal={state.pendingMeal} logDate={state.logDate ?? null} onBack={onGoBack} />
      )}
      </Animated.View>
    </View>
  );
}

function ReviewLoadingState() {
  return (
    <View
      className="flex-1 px-5 pt-3 gap-5"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading meal details"
      accessibilityLiveRegion="polite"
    >
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

function PermissionDeniedState({
  canAskAgain,
  onRetry,
  onClose,
}: {
  canAskAgain: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const handleOpenSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error('[FoodSheet] settings launch failed', error);
      Alert.alert('Couldn’t open Settings', 'Open Android Settings and allow camera access for Marco.');
    }
  }, []);

  return (
    <View className="px-5 pt-2 pb-6 gap-4 items-center justify-center" accessibilityLiveRegion="assertive">
      <Text className="text-m3-on-surface font-semibold text-sm">Camera access denied</Text>
      <Text className="text-m3-on-surface-variant text-sm text-center">
        {canAskAgain
          ? 'Allow camera access to scan food, or choose another logging method.'
          : 'Allow camera access in Android Settings, or choose another logging method.'}
      </Text>
      <View className="flex-row flex-wrap justify-center gap-2">
        {canAskAgain ? (
          <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try camera access again" className="min-h-[48px] justify-center bg-m3-surface-container-highest rounded-full px-5 active:opacity-60">
            <Text className="text-m3-on-surface text-xs font-semibold">Try again</Text>
          </Pressable>
        ) : (
          <Pressable onPress={handleOpenSettings} accessibilityRole="button" accessibilityLabel="Open Android camera settings" accessibilityHint="Opens Android Settings to allow camera access" className="min-h-[48px] justify-center bg-m3-surface-container-highest rounded-full px-5 active:opacity-60">
            <Text className="text-m3-on-surface text-xs font-semibold">Open Settings</Text>
          </Pressable>
        )}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back to logging options" className="min-h-[48px] justify-center rounded-full px-5 active:opacity-60">
          <Text className="text-m3-on-surface-variant text-xs font-semibold">Back to options</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EstimationErrorState({ kind, source, onRetry, onSearch, onDescribe, onManualEntry }: { kind: FoodSheetFailureKind; source: string; onRetry?: () => void; onSearch: () => void; onDescribe: () => void; onManualEntry: () => void }) {
  const title =
    kind === 'camera-unavailable'
      ? 'Camera unavailable'
      : kind === 'gallery-unavailable'
        ? 'Gallery unavailable'
        : kind === 'photo-unreadable'
          ? 'Photo couldn’t be read'
          : `${source} estimate unavailable`;

  return (
    <View className="px-5 pt-2 pb-6 gap-4 items-center justify-center" accessibilityLiveRegion="assertive">
      <Text className="text-m3-on-surface font-semibold text-sm">{title}</Text>
      <Text className="text-m3-on-surface-variant text-sm text-center">{FAILURE_MESSAGES[kind]}</Text>
      <View className="flex-row flex-wrap justify-center gap-2">
        {onRetry ? (
          <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry food estimate" className="min-h-[48px] justify-center bg-m3-surface-container-highest rounded-full px-4 active:opacity-60">
            <Text className="text-m3-on-surface text-xs font-semibold">Retry</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onSearch} accessibilityRole="button" accessibilityLabel="Search foods instead" className="min-h-[48px] justify-center px-4 active:opacity-60">
          <Text className="text-m3-on-surface text-xs font-semibold">Search foods</Text>
        </Pressable>
        <Pressable onPress={onDescribe} accessibilityRole="button" accessibilityLabel="Describe the meal instead" className="min-h-[48px] justify-center px-4 active:opacity-60">
          <Text className="text-m3-on-surface text-xs font-semibold">Describe instead</Text>
        </Pressable>
        <Pressable onPress={onManualEntry} accessibilityRole="button" accessibilityLabel="Enter food manually" className="min-h-[48px] justify-center px-4 active:opacity-60">
          <Text className="text-m3-on-surface text-xs font-semibold">Enter manually</Text>
        </Pressable>
      </View>
    </View>
  );
}
