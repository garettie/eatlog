import React, { useCallback, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import DashboardScreen from '../screens/DashboardScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import QuickActionSheet from '../components/QuickActionSheet';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const navigation = useNavigation<any>();
  const quickActionRef = useRef<BottomSheetModal>(null);

  const handleAddPress = useCallback(() => {
    quickActionRef.current?.present();
  }, []);

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
            handleAddPress();
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
      <QuickActionSheet ref={quickActionRef} />
    </>
  );
}
