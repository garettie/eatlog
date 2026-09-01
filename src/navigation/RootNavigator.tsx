import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import OnboardingScreen from '../screens/OnboardingScreen';
import ProfileCorrectionScreen from '../screens/ProfileCorrectionScreen';
import SetupCompleteScreen from '../screens/SetupCompleteScreen';
import TabNavigator, { type TabParamList } from './TabNavigator';
import { getDailyTargetForDate, getLatestWeightLogOnOrBefore, getProfile } from '../db/database';
import { todayISO } from '../utils/calendar';
import { validateWeightKg } from '../utils/nutritionSafety';
import { resolveProfileSafetyRoute } from '../utils/profileSafetyGate';
import PaywallScreen from '../screens/PaywallScreen';
import PrimaryButton from '../components/PrimaryButton';
import { M3 } from '../theme/tokens';

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
  Tabs: (NavigatorScreenParams<TabParamList> & { openEntry?: boolean }) | undefined;
  Paywall: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type InitialRoute = 'Onboarding' | 'ProfileCorrection' | 'SetupComplete' | 'Tabs';
type BootState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; route: InitialRoute };

export default function RootNavigator() {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const [retryToken, setRetryToken] = useState(0);
  const [initialParams, setInitialParams] =
    useState<RootStackParamList['SetupComplete'] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setBoot({ status: 'loading' });
    async function checkOnboarding() {
      try {
        const profile = await getProfile();
        if (!profile) {
          if (!cancelled) setBoot({ status: 'ready', route: 'Onboarding' });
          return;
        }
        const today = todayISO();
        const weight = await getLatestWeightLogOnOrBefore(today);
        const currentWeightKg = weight?.trend_weight_kg != null && !validateWeightKg(weight.trend_weight_kg, 'Trend weight')
          ? weight.trend_weight_kg
          : weight?.scale_weight_kg != null && !validateWeightKg(weight.scale_weight_kg, 'Scale weight')
            ? weight.scale_weight_kg
            : null;
        const target = await getDailyTargetForDate(today);
        const route = resolveProfileSafetyRoute({
          profile,
          currentWeightKg,
          target,
          referenceDate: today,
        });
        if (!cancelled) setBoot({ status: 'ready', route });
      } catch (e) {
        console.error('[Navigation] onboarding check failed', e);
        if (!cancelled) setBoot({ status: 'error' });
      }
    }
    void checkOnboarding();
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  if (boot.status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: M3.surface }} />;
  }

  if (boot.status === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface" accessibilityLiveRegion="assertive">
        <View className="flex-1 justify-center gap-4 px-6">
          <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">
            Couldn't open your logbook
          </Text>
          <Text className="text-sm text-m3-on-surface-variant">
            Eatlog couldn't read data on this device. Your diary is still on this phone. Try again.
          </Text>
          <PrimaryButton title="Try again" onPress={() => setRetryToken((token) => token + 1)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={boot.route}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: M3.surface },
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
      <Stack.Screen
        name="Paywall"
        component={PaywallScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
