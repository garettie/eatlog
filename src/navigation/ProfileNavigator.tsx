import React, { useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import ProfileScreen from '../screens/ProfileScreen';
import { TYPE } from '../theme/tokens';
import {
  GoalAndRateScreen,
  NutritionTargetsScreen,
  PersonalDetailsScreen,
  PlanPreviewScreen,
  UnitsScreen,
  PrivacyScreen,
  type ProfileStackParamList,
} from '../screens/ProfilePlanScreens';

interface ProfileNavigatorProps {
  dataVersion: number;
  onDataChanged: () => void;
}

const Stack = createNativeStackNavigator<ProfileStackParamList>();
const PROFILE_SCREEN_OPTIONS = {
  contentStyle: { backgroundColor: '#111318' },
  headerStyle: { backgroundColor: '#111318' },
  headerTintColor: '#e2e2e9',
  headerTitleStyle: { fontFamily: TYPE.family.semibold, fontSize: 18 },
} as const;
const PROFILE_HOME_OPTIONS = { headerShown: false } as const;
const PERSONAL_DETAILS_OPTIONS = { title: 'Personal details' } as const;
const GOAL_AND_RATE_OPTIONS = { title: 'Goal and rate' } as const;
const NUTRITION_TARGETS_OPTIONS = { title: 'Nutrition targets' } as const;
const UNITS_OPTIONS = { title: 'Units' } as const;
const PRIVACY_OPTIONS = { title: 'Privacy' } as const;
const PLAN_PREVIEW_OPTIONS = { title: 'Review changes' } as const;

function ProfileNavigator({ dataVersion, onDataChanged }: ProfileNavigatorProps) {
  const renderProfileHome = useCallback(
    () => <ProfileScreen dataVersion={dataVersion} />,
    [dataVersion],
  );
  const renderUnits = useCallback(
    () => <UnitsScreen onDataChanged={onDataChanged} />,
    [onDataChanged],
  );
  const renderPlanPreview = useCallback(
    (props: NativeStackScreenProps<ProfileStackParamList, 'PlanPreview'>) => (
      <PlanPreviewScreen {...props} onDataChanged={onDataChanged} />
    ),
    [onDataChanged],
  );

  return (
    <Stack.Navigator screenOptions={PROFILE_SCREEN_OPTIONS}>
      <Stack.Screen name="ProfileHome" options={PROFILE_HOME_OPTIONS}>
        {renderProfileHome}
      </Stack.Screen>
      <Stack.Screen name="PersonalDetails" component={PersonalDetailsScreen} options={PERSONAL_DETAILS_OPTIONS} />
      <Stack.Screen name="GoalAndRate" component={GoalAndRateScreen} options={GOAL_AND_RATE_OPTIONS} />
      <Stack.Screen name="NutritionTargets" component={NutritionTargetsScreen} options={NUTRITION_TARGETS_OPTIONS} />
      <Stack.Screen name="Units" options={UNITS_OPTIONS}>
        {renderUnits}
      </Stack.Screen>
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={PRIVACY_OPTIONS} />
      <Stack.Screen name="PlanPreview" options={PLAN_PREVIEW_OPTIONS}>
        {renderPlanPreview}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export default React.memo(ProfileNavigator);
