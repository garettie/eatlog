import './global.css';

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { initDatabase } from './src/db/database';
import RootNavigator from './src/navigation/RootNavigator';
import { AnimatedSplashScreen } from './src/components/AnimatedSplashScreen';

// Keep the splash screen visible while we load fonts + DB
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [splashAnimationFinished, setSplashAnimationFinished] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('./assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('./assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
  });

  useEffect(() => {
    async function prepare() {
      try {
        await initDatabase();
      } catch (e) {
        console.error('DB init error:', e);
        setDbError(String(e));
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, []);

  if (!appReady || (!fontsLoaded && !fontError)) {
    return null; // Native splash screen stays visible
  }

  if (dbError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111318', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#ffb4ab', fontSize: 14, textAlign: 'center' }}>
          Database error: {dbError}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#111318' }}>
      <StatusBar style="light" />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
      
      {!splashAnimationFinished && (
        <AnimatedSplashScreen onAnimationFinish={() => setSplashAnimationFinished(true)} />
      )}
    </View>
  );
}
