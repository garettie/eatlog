import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import DashboardScreen from '../screens/DashboardScreen';
import DiaryScreen from '../screens/DiaryScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import LogToast from '../components/LogToast';
import Sheet from '../components/Sheet';
import FoodSheetContent, { type FoodSheetState, type FoodSheetStateKey } from '../components/sheet-states/FoodSheetContent';
import { DiscardGuardContext, useDiscardGuard } from '../components/sheet-states/useDiscardGuard';
import { deleteMeal, MealType, getMealComponents, getMealsByIds } from '../db/database';
import { type FoodResult, type DataType } from '../services/foodSearch';
import { type DescribeResult } from '../services/foodScan';

function mealLabel(m: MealType): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

const Tab = createBottomTabNavigator();

const INITIAL: FoodSheetState = {
  visible: false,
  stateKey: 'entry',
  describeResult: null,
  selectedFood: null,
  editMealId: null,
};

function FabIcon({ scale }: { scale: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      style={[
        {
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#ffffff',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        },
        style,
      ]}
    >
      <MaterialIcons name="add" size={28} color="#111318" />
    </Animated.View>
  );
}

export default function TabNavigator() {
  const [sheet, setSheet] = useState<FoodSheetState>(INITIAL);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [logVersion, setLogVersion] = useState(0);
  const fabScale = useSharedValue(1);
  const discardGuard = useDiscardGuard();

  const backHistoryRef = useRef<FoodSheetStateKey[]>([]);
  const skipHistoryRef = useRef(false);
  const sheetCloseRef = useRef<() => void>(() => {});

  const openEntry = useCallback(() => {
    backHistoryRef.current = [];
    skipHistoryRef.current = false;
    setSheet({ ...INITIAL, visible: true });
  }, []);

  const openEntryForMeal = useCallback((meal: MealType) => {
    backHistoryRef.current = [];
    skipHistoryRef.current = false;
    setSheet({ ...INITIAL, visible: true, pendingMeal: meal });
  }, []);

  const openDescribe = useCallback(() => {
    backHistoryRef.current = [];
    skipHistoryRef.current = true;
    setSheet({ ...INITIAL, visible: true, stateKey: 'describe', fromBar: true });
  }, []);

  const openSearch = useCallback(() => {
    backHistoryRef.current = [];
    skipHistoryRef.current = true;
    setSheet({ ...INITIAL, visible: true, stateKey: 'search', fromBar: true });
  }, []);

  const openCamera = useCallback(() => {
    backHistoryRef.current = [];
    skipHistoryRef.current = true;
    setSheet({ ...INITIAL, visible: true, stateKey: 'scanning', pendingAction: 'camera', fromBar: true });
  }, []);

  const openGallery = useCallback(() => {
    backHistoryRef.current = [];
    skipHistoryRef.current = true;
    setSheet({ ...INITIAL, visible: true, stateKey: 'scanning', pendingAction: 'gallery', fromBar: true });
  }, []);

  const openEditMeal = useCallback(async (mealId: number) => {
    const [logs, meals] = await Promise.all([
      getMealComponents(mealId),
      getMealsByIds([mealId]),
    ]);
    const mealName = meals[0]?.name ?? 'Meal';
    const components: FoodResult[] = logs
      .filter((log) => log.calories_per_100g != null)
      .map((log, i) => ({
        id: `meal-edit-${mealId}-${i}`,
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
      }));
    if (!components.length) return;

    const result: DescribeResult = {
      mealName,
      components,
    };

    backHistoryRef.current = [];
    skipHistoryRef.current = true;
    setSheet({
      ...INITIAL,
      visible: true,
      stateKey: 'review',
      describeResult: result,
      editMealId: mealId,
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
    const prev = backHistoryRef.current.pop();
    if (!prev) return false;
    setSheet((s) => ({ ...s, stateKey: prev }));
    return true;
  }, []);

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
      case 'scanning':
      case 'permission-denied':
        return ['50%'];
      case 'describe':
        return ['35%'];
      case 'review':
        return ['92%'];
      case 'search':
      case 'single-food-review':
        return ['92%'];
      case 'manual-input':
        return ['40%', '92%'];
      default:
        return ['50%', '92%'];
    }
  }, [sheet.stateKey]);

  const enableDynamicSizing = useMemo(() => {
    const states: FoodSheetStateKey[] = ['entry', 'scanning', 'permission-denied', 'single-food-review'];
    return states.includes(sheet.stateKey);
  }, [sheet.stateKey]);

  const handleMealLogged = useCallback(
    ({ mealId, meal, name }: { mealId: number; logIds: number[]; meal: MealType; name: string }) => {
      setLogVersion((v) => v + 1);
      setToast({
        message: `Logged ${name} to ${mealLabel(meal)}`,
        undo: async () => {
          await deleteMeal(mealId);
          setLogVersion((v) => v + 1);
          setToast(null);
        },
      });
    },
    [],
  );

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
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#1d2024',
            borderTopColor: '#2b2d35',
            borderTopWidth: 1,
            height: 80,
            paddingTop: 8,
            paddingBottom: 24,
          },
          tabBarActiveTintColor: '#ffffff',
          tabBarInactiveTintColor: '#c4c6d0',
          tabBarLabelStyle: {
            fontSize: 12,
            fontFamily: 'Inter-Medium',
          },
        }}
      >
        <Tab.Screen
          name="Today"
          component={DashboardScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="grid-view" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Diary"
          options={{
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="menu-book" size={size} color={color} />
            ),
          }}
        >
          {() => (
            <DiaryScreen
              onOpenEntry={openEntry}
              onOpenEntryForMeal={openEntryForMeal}
              onCamera={openCamera}
              onGallery={openGallery}
              onDescribe={openDescribe}
              onSearch={openSearch}
              onEditMeal={openEditMeal}
              logVersion={logVersion}
              showToast={showToast}
            />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="AddEntry"
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              openEntry();
            },
          }}
          options={{
            tabBarLabel: () => null,
            tabBarIcon: () => <FabIcon scale={fabScale} />,
          }}
        >
          {() => <View />}
        </Tab.Screen>
        <Tab.Screen
          name="Analytics"
          options={{
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="monitor" size={size} color={color} />
            ),
          }}
        >
          {() => <PlaceholderScreen title="Analytics" />}
        </Tab.Screen>
        <Tab.Screen
          name="Sync"
          options={{
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="sync" size={size} color={color} />
            ),
          }}
        >
          {() => <PlaceholderScreen title="Sync" />}
        </Tab.Screen>
      </Tab.Navigator>

      <Sheet
        visible={sheet.visible}
        snapPoints={snapPoints}
        enableDynamicSizing={enableDynamicSizing}
        stateKey={sheet.stateKey}
        canCloseRef={canCloseRef}
        fabScale={fabScale}
        onGoBack={handleSheetGoBack}
        onSheetClosed={handleCloseSheet}
        sheetCloseRef={sheetCloseRef}
        forceClose={!!sheet.fromBar}
      >
        <FoodSheetContent
          state={sheet}
          setState={wrappedSetSheet}
          resetToEntry={resetToEntry}
          onMealLogged={handleMealLogged}
          skipHistoryRef={skipHistoryRef}
        />
      </Sheet>

      {toast && (
        <View className="absolute bottom-6 left-4 right-4" style={{ zIndex: 100 }}>
          <LogToast message={toast.message} onUndo={toast.undo} onHide={() => setToast(null)} />
        </View>
      )}
    </DiscardGuardContext.Provider>
  );
}
