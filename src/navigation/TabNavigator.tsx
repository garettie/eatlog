import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import DashboardScreen from '../screens/DashboardScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import QuickActionSheet from '../components/QuickActionSheet';
import MealReviewSheet from '../components/MealReviewSheet';
import DescribeSheet from '../components/DescribeSheet';
import LogToast from '../components/LogToast';
import { scanFood, DescribeResult } from '../services/foodScan';
import { deleteMeal, MealType } from '../db/database';

function mealLabel(m: MealType): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const [quickActionVisible, setQuickActionVisible] = useState(false);
  const [mealReviewVisible, setMealReviewVisible] = useState(false);
  const [describeVisible, setDescribeVisible] = useState(false);
  const [describeResult, setDescribeResult] = useState<DescribeResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);

  const handleCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is needed to scan labels.');
      return;
    }
    setQuickActionVisible(false);
    setScanning(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const scanResult = await scanFood(result.assets[0].base64);
      if (!scanResult) {
        Alert.alert('Scan Failed', 'Could not extract nutritional info. Try again or enter manually.');
        return;
      }
      setDescribeResult(scanResult);
      setMealReviewVisible(true);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleGallery = useCallback(async () => {
    setQuickActionVisible(false);
    setScanning(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.5,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const scanResult = await scanFood(result.assets[0].base64);
      if (!scanResult) {
        Alert.alert('Scan Failed', 'Could not extract nutritional info. Try again or enter manually.');
        return;
      }
      setDescribeResult(scanResult);
      setMealReviewVisible(true);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleDescribeResult = useCallback((result: DescribeResult) => {
    setDescribeResult(result);
    setMealReviewVisible(true);
  }, []);

  const handleMealLog = useCallback(
    ({ mealId, meal, name }: { mealId: number; logIds: number[]; meal: MealType; name: string }) => {
      setMealReviewVisible(false);
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
              setQuickActionVisible(true);
            },
          }}
          options={{
            tabBarLabel: () => null,
            tabBarIcon: () => (
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: '#ffffff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <MaterialIcons name="add" size={28} color="#111318" />
              </View>
            ),
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

      <QuickActionSheet
        visible={quickActionVisible}
        onClose={() => setQuickActionVisible(false)}
        onCamera={handleCamera}
        onGallery={handleGallery}
        onDescribe={() => setDescribeVisible(true)}
      />
      <MealReviewSheet
        result={describeResult}
        visible={mealReviewVisible}
        onClose={() => setMealReviewVisible(false)}
        onLogComplete={handleMealLog}
      />
      <DescribeSheet
        visible={describeVisible}
        onClose={() => setDescribeVisible(false)}
        onResult={handleDescribeResult}
      />
      {toast && (
        <LogToast message={toast.message} onUndo={toast.undo} onHide={() => setToast(null)} />
      )}
      {scanning && (
        <View className="absolute inset-0 bg-black/60 items-center justify-center z-50">
          <View className="bg-m3-surface-container-high rounded-2xl px-8 py-6 items-center gap-3">
            <ActivityIndicator size="large" color="#ffffff" />
            <Text className="text-m3-on-surface text-sm font-semibold">Analyzing your photo…</Text>
            <Text className="text-m3-on-surface-variant text-xs">This takes a few seconds</Text>
          </View>
        </View>
      )}
    </>
  );
}
