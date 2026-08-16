import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

import {
    scanFood,
    clarifyComponent,
    clarifyMeal,
    type ComponentClarificationInput,
    type DescribeResult,
    type FoodEstimationFailureKind,
    type MealClarificationInput,
} from '../../services/foodScan';
import { serviceConfig } from '../../config/services';
import type { FoodResult } from '../../services/foodSearch';
import { foodResultFromLog } from '../../services/foodSearchCore';
import { type HealthConnectWeightExport, type LoggedMeal, type MealType, type SaveWeightResult, type WeightLog, getMealComponents } from '../../db/database';
import { prepareFoodEstimateImage, saveMealPhoto } from '../../utils/mealPhotos';
import { formatDayHeader, todayISO } from '../../utils/calendar';
import { EASING } from '../../theme/motion';
import { M3 } from '../../theme/tokens';
import { useRemoteEstimateConsent } from '../../context/RemoteEstimateConsentContext';

import EntryMethodState from './EntryMethodState';
import DescribeInputState from './DescribeInputState';
import PhotoMealTitleState from './PhotoMealTitleState';
import ScanningState from './ScanningState';
import ReviewState from './ReviewState';
import SearchInputState from './SearchInputState';
import RecentMealsState from './RecentMealsState';
import SingleFoodReviewState from './SingleFoodReviewState';
import ManualInputState from './ManualInputState';
import WeightInputState from './WeightInputState';

export type FoodSheetStateKey =
    | 'entry'
    | 'describe'
    | 'photo-title'
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
    unavailable: 'Photo and description estimates are unavailable.',
    'consent-required': 'Enable online estimates to use this.',
    network: 'Check your connection, then try again.',
    timeout: 'The estimate took too long. Try again.',
    provider: 'The estimation service could not complete this request.',
    'invalid-response': 'This photo did not produce a usable food estimate.',
    unrecognized: 'No usable food was recognized. Try a clearer food photo or another logging method.',
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
    previousLog: WeightLog | null;
    previousExport: HealthConnectWeightExport | null;
}

export interface ClarificationOutcome<T> {
    result: T | null;
    consentDeclined: boolean;
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

interface PendingEstimatePhoto {
    uri: string;
    width: number;
    height: number;
    base64: string;
    source: 'camera' | 'gallery';
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
    const { requestConsent } = useRemoteEstimateConsent();
    const scanRequestRef = useRef(0);
    const scanInFlightRef = useRef(false);
    const scanBase64Ref = useRef<string | null>(null);
    const pendingPhotoRef = useRef<PendingEstimatePhoto | null>(null);
    const scanMealTitleRef = useRef('');
    const mealRequestRef = useRef(0);
    const fromBarRef = useRef(false);
    const previousStateKeyRef = useRef(state.stateKey);
    const [renderedStateKey, setRenderedStateKey] = useState(state.stateKey);
    const stateTransitionRequestRef = useRef(0);
    const enteringStateRef = useRef(false);
    const stateOffset = useSharedValue(0);
    const stateOpacity = useSharedValue(1);
    fromBarRef.current = !!state.fromBar;

    const discardPendingPhoto = useCallback(() => {
        pendingPhotoRef.current = null;
        scanBase64Ref.current = null;
        scanMealTitleRef.current = '';
    }, []);

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
        if (!state.visible) discardPendingPhoto();
        previousStateKeyRef.current = state.stateKey;
    }, [discardPendingPhoto, state.stateKey, state.visible]);
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

    const queuePhotoForTitle = useCallback((
        asset: ImagePicker.ImagePickerAsset,
        base64: string,
        source: 'camera' | 'gallery',
    ) => {
        scanBase64Ref.current = base64;
        pendingPhotoRef.current = {
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            base64,
            source,
        };
        scanInFlightRef.current = false;
        setState((current) => ({
            ...current,
            stateKey: 'photo-title',
            pendingAction: source,
            estimationFailure: null,
        }));
    }, [setState]);

    const handleCamera = useCallback(async () => {
        if (scanInFlightRef.current) return;
        scanInFlightRef.current = true;
        const requestId = ++scanRequestRef.current;

        try {
            if (!serviceConfig.availability.gemini) {
                showScanError('unavailable', 'camera');
                return;
            }
            if (!await requestConsent()) {
                if (requestId === scanRequestRef.current) {
                    if (fromBarRef.current) resetToEntry();
                    else transitionTo('entry', { pushHistory: false });
                }
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
                quality: 1,
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
            const asset = result.assets[0];
            const base64 = await prepareFoodEstimateImage(asset.uri, asset.width, asset.height).catch((error) => {
                console.error('[FoodSheet] camera photo normalization failed', error);
                return null;
            });
            if (!base64) {
                showScanError('photo-unreadable', 'camera');
                return;
            }
            if (requestId !== scanRequestRef.current) return;
            queuePhotoForTitle(asset, base64, 'camera');
        } finally {
            if (requestId === scanRequestRef.current) scanInFlightRef.current = false;
        }
    }, [queuePhotoForTitle, requestConsent, transitionTo, resetToEntry, setState, showScanError]);

    const handleGallery = useCallback(async () => {
        if (scanInFlightRef.current) return;
        scanInFlightRef.current = true;
        const requestId = ++scanRequestRef.current;

        try {
            if (!serviceConfig.availability.gemini) {
                showScanError('unavailable', 'gallery');
                return;
            }
            if (!await requestConsent()) {
                if (requestId === scanRequestRef.current) {
                    if (fromBarRef.current) resetToEntry();
                    else transitionTo('entry', { pushHistory: false });
                }
                return;
            }

            transitionTo('scanning');
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 1,
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
            const asset = result.assets[0];
            const base64 = await prepareFoodEstimateImage(asset.uri, asset.width, asset.height).catch((error) => {
                console.error('[FoodSheet] gallery photo normalization failed', error);
                return null;
            });
            if (!base64) {
                showScanError('photo-unreadable', 'gallery');
                return;
            }
            if (requestId !== scanRequestRef.current) return;
            queuePhotoForTitle(asset, base64, 'gallery');
        } finally {
            if (requestId === scanRequestRef.current) scanInFlightRef.current = false;
        }
    }, [queuePhotoForTitle, requestConsent, transitionTo, resetToEntry, setState, showScanError]);

    const handlePhotoEstimate = useCallback(async (mealTitle: string) => {
        if (scanInFlightRef.current) return;
        const pendingPhoto = pendingPhotoRef.current;
        if (!pendingPhoto) {
            showScanError('photo-unreadable', state.pendingAction === 'gallery' ? 'gallery' : 'camera');
            return;
        }

        scanInFlightRef.current = true;
        const requestId = ++scanRequestRef.current;
        scanMealTitleRef.current = mealTitle.trim();
        transitionTo('scanning', { pushHistory: false });

        try {
            const scanResult = await scanFood(pendingPhoto.base64, mealTitle).catch((error) => {
                console.error('[FoodSheet] photo estimate failed unexpectedly', error);
                if (requestId === scanRequestRef.current) showScanError('provider', pendingPhoto.source);
                return null;
            });
            if (!scanResult || requestId !== scanRequestRef.current) return;
            if (!scanResult.ok) {
                showScanError(scanResult.kind, pendingPhoto.source);
                return;
            }
            const photoUri = await saveMealPhoto(
                pendingPhoto.uri,
                pendingPhoto.width,
                pendingPhoto.height,
            ).catch((error) => {
                console.error('[FoodSheet] meal photo save failed', error);
                return null;
            });
            if (requestId !== scanRequestRef.current) return;
            pendingPhotoRef.current = null;
            setState((current) => ({
                ...current,
                stateKey: 'review',
                describeResult: scanResult.result,
                photoUri,
                pendingAction: null,
                estimationFailure: null,
            }));
        } finally {
            if (requestId === scanRequestRef.current) scanInFlightRef.current = false;
        }
    }, [setState, showScanError, state.pendingAction, transitionTo]);

    const handlePhotoTitleBack = useCallback(() => {
        discardPendingPhoto();
        setState((current) => ({ ...current, pendingAction: null }));
        onGoBack();
    }, [discardPendingPhoto, onGoBack, setState]);

    const handleDescribe = useCallback(() => {
        discardPendingPhoto();
        transitionTo('describe');
    }, [discardPendingPhoto, transitionTo]);

    const handleDescribeResult = useCallback(
        (result: DescribeResult) => {
            scanBase64Ref.current = null;
            setState((s) => ({ ...s, photoUri: null }));
            transitionTo('review', { describeResult: result });
        },
        [transitionTo, setState],
    );

    const handleSearch = useCallback(() => {
        discardPendingPhoto();
        transitionTo('search');
    }, [discardPendingPhoto, transitionTo]);

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
            const components = logs.map((log, index) =>
                foodResultFromLog(log, `recent-meal-${meal.meal_id}-${index}`)
            );
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
        discardPendingPhoto();
        transitionTo('manual-input');
    }, [discardPendingPhoto, transitionTo]);

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
            previousLog: result.previousLog,
            previousExport: result.previousExport,
        });
    }, [onWeightLogged, setState]);

    const handleScanCancel = useCallback(() => {
        scanRequestRef.current += 1;
        scanInFlightRef.current = false;
        discardPendingPhoto();
        if (fromBarRef.current) {
            resetToEntry();
            return;
        }
        transitionTo('entry', { pushHistory: false });
    }, [discardPendingPhoto, transitionTo, resetToEntry]);

    const handleClarify = useCallback(
        async (input: MealClarificationInput): Promise<ClarificationOutcome<DescribeResult>> => {
            if (!await requestConsent()) return { result: null, consentDeclined: true };
            return {
                result: await clarifyMeal({ ...input, imageBase64: scanBase64Ref.current ?? undefined }),
                consentDeclined: false,
            };
        },
        [requestConsent],
    );

    const handleClarifyComponent = useCallback(
        async (input: ComponentClarificationInput): Promise<ClarificationOutcome<FoodResult>> => {
            if (!await requestConsent()) return { result: null, consentDeclined: true };
            return {
                result: await clarifyComponent({ ...input, imageBase64: scanBase64Ref.current ?? undefined }),
                consentDeclined: false,
            };
        },
        [requestConsent],
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
                {renderedStateKey === 'photo-title' && pendingPhotoRef.current && (
                    <PhotoMealTitleState
                        photoUri={pendingPhotoRef.current.uri}
                        onEstimate={(mealTitle) => { void handlePhotoEstimate(mealTitle); }}
                        onBack={handlePhotoTitleBack}
                    />
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
                            skipHistoryRef.current = true;
                            if (pendingPhotoRef.current) {
                                void handlePhotoEstimate(scanMealTitleRef.current);
                                return;
                            }
                            const action = state.pendingAction;
                            setState((s) => ({ ...s, stateKey: 'scanning', pendingAction: action, estimationFailure: null }));
                        }}
                        onSearch={() => {
                            discardPendingPhoto();
                            skipHistoryRef.current = true;
                            setState((s) => ({ ...s, stateKey: 'search', pendingAction: null, estimationFailure: null }));
                        }}
                        onDescribe={() => {
                            discardPendingPhoto();
                            skipHistoryRef.current = true;
                            setState((s) => ({ ...s, stateKey: 'describe', pendingAction: null, estimationFailure: null }));
                        }}
                        onManualEntry={() => {
                            discardPendingPhoto();
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
                        onClarifyComponent={handleClarifyComponent}
                        editMealId={state.editMealId}
                        initialMeal={state.pendingMeal}
                        logDate={state.logDate ?? null}
                        onGoBack={onGoBack}
                    />
                )}
                {renderedStateKey === 'search' && (
                    <SearchInputState
                        autoFocus
                        onSelectFood={handleSelectFood}
                        onManualEntry={handleManualEntry}
                        onEstimateResult={handleDescribeResult}
                        onQuickLogComplete={handleSingleLogComplete}
                        initialMeal={state.pendingMeal}
                        logDate={state.logDate ?? null}
                        onBack={onGoBack}
                    />
                )}
                {renderedStateKey === 'recent-foods' && (
                    <RecentMealsState
                        onSelectMeal={handleSelectLoggedMeal}
                        onBack={onGoBack}
                    />
                )}
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
            Alert.alert('Couldn’t open Settings', 'Open Android Settings and allow camera access for Eatlog.');
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
                    : kind === 'unrecognized'
                        ? 'Food not recognized'
                    : kind === 'consent-required'
                        ? 'Online estimates disabled'
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
                {kind !== 'unavailable' ? (
                    <Pressable onPress={onDescribe} accessibilityRole="button" accessibilityLabel="Describe the meal instead" className="min-h-[48px] justify-center px-4 active:opacity-60">
                        <Text className="text-m3-on-surface text-xs font-semibold">Describe instead</Text>
                    </Pressable>
                ) : null}
                <Pressable onPress={onManualEntry} accessibilityRole="button" accessibilityLabel="Enter food manually" className="min-h-[48px] justify-center px-4 active:opacity-60">
                    <Text className="text-m3-on-surface text-xs font-semibold">Enter manually</Text>
                </Pressable>
            </View>
        </View>
    );
}
