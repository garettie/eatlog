import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';

import OnboardingScreen from '../screens/OnboardingScreen';
import ProfileCorrectionScreen from '../screens/ProfileCorrectionScreen';
import SetupCompleteScreen from '../screens/SetupCompleteScreen';
import TabNavigator from './TabNavigator';
import { getDailyTargetForDate, getLatestWeightLogOnOrBefore, getProfile } from '../db/database';
import { todayISO } from '../utils/calendar';
import { profileSafetyIssues, targetSafetyIssues, validateWeightKg } from '../utils/nutritionSafety';

// ─── Route param types ────────────────────────────────────────────────────

export type RootStackParamList = {
  Onboarding: undefined;
  ProfileCorrection: undefined;
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

type InitialRoute = 'Onboarding' | 'ProfileCorrection' | 'SetupComplete' | 'Tabs';

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
        const today = todayISO();
        const weight = await getLatestWeightLogOnOrBefore(today);
        const currentWeightKg = weight?.trend_weight_kg != null && !validateWeightKg(weight.trend_weight_kg, 'Trend weight')
          ? weight.trend_weight_kg
          : weight?.scale_weight_kg != null && !validateWeightKg(weight.scale_weight_kg, 'Scale weight')
            ? weight.scale_weight_kg
            : null;
        const profileIssues = profileSafetyIssues(profile, {
          currentWeightKg,
          requireCurrentWeight: true,
          checkGoalDirection: false,
        });
        const target = await getDailyTargetForDate(today);
        const targetIssues = target
          ? targetSafetyIssues(target, { goalType: profile.goal_type, referenceWeightKg: currentWeightKg })
          : ['An active nutrition target is required.'];
        setInitialRoute(profileIssues.length === 0 && targetIssues.length === 0 ? 'Tabs' : 'ProfileCorrection');
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
      <Stack.Screen name="ProfileCorrection" component={ProfileCorrectionScreen} />
      <Stack.Screen
        name="SetupComplete"
        component={SetupCompleteScreen}
        initialParams={initialParams}
      />
      <Stack.Screen name="Tabs" component={TabNavigator} />
    </Stack.Navigator>
  );
}
