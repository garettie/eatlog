import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';

import OnboardingScreen from '../screens/OnboardingScreen';
import SetupCompleteScreen from '../screens/SetupCompleteScreen';
import TabNavigator from './TabNavigator';
import { getProfile } from '../db/database';

// ─── Route param types ────────────────────────────────────────────────────

export type RootStackParamList = {
  Onboarding: undefined;
  SetupComplete: {
    displayName: string;
    tdee: number;
    targetCalories: number;
    targetProtein: number;
    targetFat: number;
    targetCarbs: number;
  };
  Tabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type InitialRoute = 'Onboarding' | 'SetupComplete' | 'Tabs';

export default function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState<InitialRoute | null>(null);
  const [initialParams, setInitialParams] =
    useState<RootStackParamList['SetupComplete'] | undefined>(undefined);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const profile = await getProfile();
        if (!profile) {
          setInitialRoute('Onboarding');
          return;
        }
        setInitialRoute('Tabs');
      } catch (e) {
        console.error('[Navigation] onboarding check failed', e);
        setInitialRoute('Onboarding');
      }
    }
    checkOnboarding();
  }, []);

  if (!initialRoute) {
    // DB check still running — render blank dark screen (splash is covering it)
    return <View style={{ flex: 1, backgroundColor: '#111318' }} />;
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#111318' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen
        name="SetupComplete"
        component={SetupCompleteScreen}
        initialParams={initialParams}
      />
      <Stack.Screen name="Tabs" component={TabNavigator} />
    </Stack.Navigator>
  );
}
