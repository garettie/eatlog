import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ProfileScreen from '../screens/ProfileScreen';

export type ProfileStackParamList = {
  ProfileHome: undefined;
};

interface ProfileNavigatorProps {
  dataVersion: number;
}

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileNavigator({ dataVersion }: ProfileNavigatorProps) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#111318' } }}>
      <Stack.Screen name="ProfileHome">
        {() => <ProfileScreen dataVersion={dataVersion} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
