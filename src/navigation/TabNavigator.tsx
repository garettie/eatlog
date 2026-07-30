import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import DashboardScreen from '../screens/DashboardScreen';
import DiaryScreen from '../screens/DiaryScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import ProfileNavigator from './ProfileNavigator';
import LogToast, { type LogToastTone } from '../components/LogToast';
import Sheet from '../components/Sheet';
import AdaptiveInfoSheet from '../components/AdaptiveInfoSheet';
import FoodSheetContent, { type FoodSheetState, type FoodSheetStateKey, type LoggedEntryInfo, type WeightLoggedInfo } from '../components/sheet-states/FoodSheetContent';
import { type MealGroup } from '../components/JournalSection';
import { DiscardGuardContext, useDiscardGuard } from '../components/sheet-states/useDiscardGuard';
import { deleteFoodLog, deleteMeal, deleteWeightLog, saveWeightLog, MealType } from '../db/database';
import { formatDayHeader, todayISO } from '../utils/calendar';
import { type FoodResult, type DataType } from '../services/foodSearch';
import { type DescribeResult } from '../services/foodScan';
import MarcoTabBar from './MarcoTabBar';

function mealLabel(m: MealType): string {
    return m.charAt(0).toUpperCase() + m.slice(1);
}

export type TabParamList = {
    Today: undefined;
    Diary: undefined;
    Analytics: undefined;
    Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const INITIAL: FoodSheetState = {
    visible: false,
    stateKey: 'entry',
    describeResult: null,
    selectedFood: null,
    editMealId: null,
    logDate: null,
};

export default function TabNavigator() {
    const [sheet, setSheet] = useState<FoodSheetState>(INITIAL);
    const [adaptiveInfoVisible, setAdaptiveInfoVisible] = useState(false);
    const [toast, setToast] = useState<{ message: string; tone?: LogToastTone; undo?: () => void | Promise<void> } | null>(null);
    const [dataVersion, setDataVersion] = useState(0);
    const insets = useSafeAreaInsets();
    const discardGuard = useDiscardGuard();
    const tabBarBottomPadding = Math.max(insets.bottom, 12);
    const tabBarHeight = 80 + tabBarBottomPadding;

    const backHistoryRef = useRef<FoodSheetStateKey[]>([]);
    const activeTabRef = useRef('Today');
    const diaryDateRef = useRef(todayISO());
    const skipHistoryRef = useRef(false);
    const sheetCloseRef = useRef<() => void>(() => { });

    const openEntry = useCallback((logDate?: string) => {
        backHistoryRef.current = [];
        skipHistoryRef.current = false;
        setSheet({ ...INITIAL, visible: true, logDate: logDate ?? null });
    }, []);

    const openDescribe = useCallback((logDate?: string) => {
        backHistoryRef.current = [];
        skipHistoryRef.current = true;
        setSheet({ ...INITIAL, visible: true, stateKey: 'describe', fromBar: true, logDate: logDate ?? null });
    }, []);

    const openCamera = useCallback((logDate?: string) => {
        backHistoryRef.current = [];
        skipHistoryRef.current = true;
        setSheet({ ...INITIAL, visible: true, stateKey: 'scanning', pendingAction: 'camera', fromBar: true, logDate: logDate ?? null });
    }, []);

    const openGallery = useCallback((logDate?: string) => {
        backHistoryRef.current = [];
        skipHistoryRef.current = true;
        setSheet({ ...INITIAL, visible: true, stateKey: 'scanning', pendingAction: 'gallery', fromBar: true, logDate: logDate ?? null });
    }, []);

    const openWeight = useCallback(() => {
        backHistoryRef.current = [];
        skipHistoryRef.current = true;
        setSheet({ ...INITIAL, visible: true, stateKey: 'weight-input', fromBar: true });
    }, []);

    const openAdaptiveInfo = useCallback(() => {
        setAdaptiveInfoVisible(true);
    }, []);

    const handleDiaryDateChange = useCallback((date: string) => {
        diaryDateRef.current = date;
    }, []);

    const bumpDataVersion = useCallback(() => {
        setDataVersion((version) => version + 1);
    }, []);

    const openEditMeal = useCallback((mealGroup: MealGroup) => {
        backHistoryRef.current = [];
        skipHistoryRef.current = true;
        setSheet({
            ...INITIAL,
            visible: true,
            stateKey: 'review-loading',
            photoUri: mealGroup.photoUri ?? null,
            editMealId: mealGroup.id,
            pendingMeal: mealGroup.components[0]?.meal ?? null,
            logDate: mealGroup.components[0]?.log_date ?? null,
        });

        requestAnimationFrame(() => {
            const components: FoodResult[] = mealGroup.components.map((log, i) => {
                const grams = log.grams_logged && log.grams_logged > 0 ? log.grams_logged : 100;
                const per100gRatio = 100 / grams;
                return {
                id: `meal-edit-${mealGroup.id}-${i}`,
                name: log.name,
                source: log.source as FoodResult['source'],
                sourceFoodId: log.source_food_id ?? '',
                dataType: (log.data_type as DataType) || 'manual',
                brand: log.brand,
                preparation: log.preparation,
                normalizedName: log.name.toLowerCase(),
                caloriesPer100g: log.calories_per_100g ?? log.calories * per100gRatio,
                proteinPer100g: log.protein_g_per_100g ?? log.protein_g * per100gRatio,
                carbsPer100g: log.carbs_g_per_100g ?? log.carbs_g * per100gRatio,
                fatPer100g: log.fat_g_per_100g ?? log.fat_g * per100gRatio,
                servingSizeGrams: log.serving_size_g,
                servingLabel: log.serving_label,
                estimatedGrams: log.grams_logged ?? undefined,
                alternateSourceIds: [],
                };
            });
            if (!components.length) return;

            const result: DescribeResult = {
                mealName: mealGroup.name,
                components,
            };

            setSheet((current) => {
                if (!current.visible || current.stateKey !== 'review-loading' || current.editMealId !== mealGroup.id) {
                    return current;
                }
                return { ...current, stateKey: 'review', describeResult: result };
            });
        });
    }, []);

    const resetToEntry = useCallback(() => {
        setSheet((s) => ({ ...s, visible: false }));
    }, []);

    const canClose = useCallback(() => {
        return discardGuard.requestClose(() => {
            sheetCloseRef.current();
        });
    }, [discardGuard]);

    const canCloseRef = useRef(canClose);
    canCloseRef.current = canClose;

    const handleCloseSheet = useCallback(() => {
        setSheet((s) => ({ ...s, visible: false }));
    }, []);

    const handleSheetGoBack = useCallback(() => {
        const prev = backHistoryRef.current[backHistoryRef.current.length - 1];
        if (!prev) return false;
        const goBack = () => {
            backHistoryRef.current.pop();
            setSheet((s) => ({ ...s, stateKey: prev }));
        };
        if (discardGuard.requestClose(goBack)) goBack();
        return true;
    }, [discardGuard]);

    const wrappedSetSheet = useCallback(
        (updater: React.SetStateAction<FoodSheetState>) => {
            setSheet((prev) => {
                const next = typeof updater === 'function' ? updater(prev) : updater;
                if (prev.stateKey !== next.stateKey) {
                    if (!skipHistoryRef.current && prev.stateKey !== 'scanning') {
                        backHistoryRef.current.push(prev.stateKey);
                    }
                    skipHistoryRef.current = false;
                }
                return next;
            });
        },
        [],
    );

    const snapPoints = useMemo((): (string | number)[] => {
        switch (sheet.stateKey) {
            case 'entry':
                return ['60%'];
            case 'scanning':
            case 'permission-denied':
                return ['50%'];
            case 'describe':
                return ['30%'];
            case 'review-loading':
            case 'review':
                return ['92%'];
            case 'search':
            case 'recent-foods':
            case 'single-food-review':
                return ['92%'];
            case 'weight-input':
                return ['50%'];
            case 'manual-input':
                return ['40%', '92%'];
            default:
                return ['50%', '92%'];
        }
    }, [sheet.stateKey]);

    const enableDynamicSizing = useMemo(() => {
        const states: FoodSheetStateKey[] = ['scanning', 'permission-denied', 'single-food-review'];
        return states.includes(sheet.stateKey);
    }, [sheet.stateKey]);

    const handleMealLogged = useCallback(
        (info: LoggedEntryInfo) => {
            setDataVersion((v) => v + 1);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const dateSuffix = info.logDate && info.logDate !== todayISO()
                ? ` · ${formatDayHeader(info.logDate)}`
                : '';
            const verb = info.kind === 'meal' && info.wasUpdate ? 'Updated' : 'Logged';
            setToast({
                message: `${verb} ${info.name} · ${Math.round(info.calories).toLocaleString()} kcal · ${mealLabel(info.meal)}${dateSuffix}`,
                tone: 'success',
                undo: async () => {
                    try {
                        if (info.kind === 'meal') await deleteMeal(info.mealId);
                        else await deleteFoodLog(info.logId);
                        setDataVersion((v) => v + 1);
                        setToast(null);
                    } catch (e) {
                        setToast({ message: "Couldn't undo. Your entry is still logged.", tone: 'error' });
                        throw e;
                    }
                },
            });
        },
        [],
    );

    const handleWeightLogged = useCallback((info: WeightLoggedInfo) => {
        setDataVersion((version) => version + 1);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const dateSuffix = info.logDate === todayISO() ? 'Today' : formatDayHeader(info.logDate);
        setToast({
            message: `${info.wasUpdate ? 'Weight updated' : 'Weight logged'} · ${dateSuffix}`,
            tone: 'success',
            undo: async () => {
                try {
                    if (info.wasUpdate && info.previousScaleWeightKg != null) {
                        await saveWeightLog({ logDate: info.logDate, scaleWeightKg: info.previousScaleWeightKg });
                    } else {
                        await deleteWeightLog(info.logId);
                    }
                    setDataVersion((v) => v + 1);
                    setToast(null);
                } catch (e) {
                    setToast({ message: "Couldn't undo. Your weight entry is unchanged.", tone: 'error' });
                    throw e;
                }
            },
        });
    }, []);

    const handleDataChanged = useCallback((message: string) => {
        setDataVersion((version) => version + 1);
        setToast({ message, tone: 'success' });
    }, []);

    const showToast = useCallback((message: string, undo?: () => void) => {
        setToast({
            message,
            undo: undo
                ? () => {
                    undo();
                    setToast(null);
                }
                : undefined,
        });
    }, []);

    return (
        <DiscardGuardContext.Provider value={discardGuard}>
            <Tab.Navigator
                screenOptions={{ headerShown: false }}
                tabBar={(props) => (
                    <MarcoTabBar
                        {...props}
                        onAddEntry={() => openEntry(activeTabRef.current === 'Diary' ? diaryDateRef.current : undefined)}
                    />
                )}
            >
                <Tab.Screen
                    name="Today"
                    listeners={{ focus: () => { activeTabRef.current = 'Today'; } }}
                >
                    {({ navigation }) => (
                        <DashboardScreen
                            onOpenCamera={openCamera}
                            onOpenGallery={openGallery}
                            onOpenDescribe={openDescribe}
                            onOpenWeight={openWeight}
                            onOpenAdaptiveInfo={openAdaptiveInfo}
                            onOpenProfile={() => navigation.navigate('Profile')}
                            dataVersion={dataVersion}
                        />
                    )}
                </Tab.Screen>
                <Tab.Screen
                    name="Diary"
                    listeners={{ focus: () => { activeTabRef.current = 'Diary'; } }}
                >
                    {() => (
                        <DiaryScreen
                            onOpenEntry={openEntry}
                            onEditMeal={openEditMeal}
                            onSelectedDateChange={handleDiaryDateChange}
                            onDataChanged={bumpDataVersion}
                            dataVersion={dataVersion}
                            showToast={showToast}
                        />
                    )}
                </Tab.Screen>
                <Tab.Screen
                    name="Analytics"
                    listeners={{ focus: () => { activeTabRef.current = 'Analytics'; } }}
                >
                    {() => (
                        <AnalyticsScreen
                            onOpenWeight={openWeight}
                            dataVersion={dataVersion}
                            onDataChanged={handleDataChanged}
                        />
                    )}
                </Tab.Screen>
                <Tab.Screen
                    name="Profile"
                    listeners={{ focus: () => { activeTabRef.current = 'Profile'; } }}
                >
                    {() => <ProfileNavigator dataVersion={dataVersion} onDataChanged={bumpDataVersion} />}
                </Tab.Screen>
            </Tab.Navigator>

            <Sheet
                visible={sheet.visible}
                snapPoints={snapPoints}
                enableDynamicSizing={enableDynamicSizing}
                stateKey={sheet.stateKey}
                canCloseRef={canCloseRef}
                onGoBack={handleSheetGoBack}
                onSheetClosed={handleCloseSheet}
                sheetCloseRef={sheetCloseRef}
                forceClose={!!sheet.fromBar && sheet.stateKey !== 'weight-input'}
            >
                <FoodSheetContent
                    state={sheet}
                    setState={wrappedSetSheet}
                    resetToEntry={resetToEntry}
                    onMealLogged={handleMealLogged}
                    onWeightLogged={handleWeightLogged}
                    skipHistoryRef={skipHistoryRef}
                />
            </Sheet>

            <AdaptiveInfoSheet
                visible={adaptiveInfoVisible}
                onClosed={() => setAdaptiveInfoVisible(false)}
            />

            {toast && (
                <View className="absolute left-4 right-4" style={{ zIndex: 100, bottom: tabBarHeight + 12 }}>
                    <LogToast message={toast.message} tone={toast.tone} onUndo={toast.undo} onHide={() => setToast(null)} />
                </View>
            )}
        </DiscardGuardContext.Provider>
    );
}
