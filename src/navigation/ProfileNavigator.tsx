import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ProfileScreen from '../screens/ProfileScreen';
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

export default function ProfileNavigator({ dataVersion, onDataChanged }: ProfileNavigatorProps) {
  return (
    <Stack.Navigator screenOptions={{ contentStyle: { backgroundColor: '#111318' }, headerStyle: { backgroundColor: '#111318' }, headerTintColor: '#e2e2e9', headerTitleStyle: { fontFamily: 'Inter-SemiBold' } }}>
      <Stack.Screen name="ProfileHome" options={{ headerShown: false }}>
        {() => <ProfileScreen dataVersion={dataVersion} />}
      </Stack.Screen>
      <Stack.Screen name="PersonalDetails" component={PersonalDetailsScreen} options={{ title: 'Personal details' }} />
      <Stack.Screen name="GoalAndRate" component={GoalAndRateScreen} options={{ title: 'Goal and rate' }} />
      <Stack.Screen name="NutritionTargets" component={NutritionTargetsScreen} options={{ title: 'Nutrition targets' }} />
      <Stack.Screen name="Units" options={{ title: 'Units' }}>
        {(props) => <UnitsScreen {...props} onDataChanged={onDataChanged} />}
      </Stack.Screen>
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
      <Stack.Screen name="PlanPreview" options={{ title: 'Review changes' }}>
        {(props) => <PlanPreviewScreen {...props} onDataChanged={onDataChanged} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
