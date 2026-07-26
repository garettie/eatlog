import React, { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import DashboardScreen from '../screens/DashboardScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import LogToast from '../components/LogToast';
import Sheet from '../components/Sheet';
import FoodSheetContent, { type FoodSheetState } from '../components/sheet-states/FoodSheetContent';
import { deleteMeal, MealType } from '../db/database';

function mealLabel(m: MealType): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

const Tab = createBottomTabNavigator();

const INITIAL: FoodSheetState = {
  visible: false,
  detent: 'half',
  stateKey: 'entry',
  describeResult: null,
  selectedFood: null,
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
  const canCloseRef = useRef<() => boolean>(() => true);
  const fabScale = useSharedValue(1);

  const setCanClose = useCallback((cb: () => boolean) => {
    canCloseRef.current = cb;
  }, []);

  const openEntry = useCallback(() => {
    setSheet({ ...INITIAL, visible: true });
  }, []);

  const resetToEntry = useCallback(() => {
    setSheet((s) => ({ ...s, visible: false }));
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSheet((s) => ({ ...s, visible: false }));
  }, []);

  const handleMealLogged = useCallback(
    ({ mealId, meal, name }: { mealId: number; logIds: number[]; meal: MealType; name: string }) => {
      setToast({
        message: `Logged ${name} to ${mealLabel(meal)}`,
        undo: async () => {
          await deleteMeal(mealId);
          setToast(null);
        },
      });
    },
    [],
  );

  return (
    <>
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
          {() => <PlaceholderScreen title="Diary" />}
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
        detent={sheet.detent}
        stateKey={sheet.stateKey}
        canCloseRef={canCloseRef}
        onClose={handleCloseSheet}
        fabScale={fabScale}
      >
        <FoodSheetContent
          state={sheet}
          setState={setSheet}
          resetToEntry={resetToEntry}
          registerCanClose={setCanClose}
          onMealLogged={handleMealLogged}
        />
      </Sheet>

      {toast && (
        <LogToast message={toast.message} onUndo={toast.undo} onHide={() => setToast(null)} />
      )}
    </>
  );
}