import './global.css';

import React, { useEffect, useState } from 'react';
import { InteractionManager, View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { initDatabase, getActiveMealPhotoUris } from './src/db/database';
import { cleanupOrphanMealPhotos } from './src/utils/mealPhotos';
import RootNavigator from './src/navigation/RootNavigator';
import { AnimatedSplashScreen } from './src/components/AnimatedSplashScreen';
import { M3 } from './src/theme/tokens';

// Keep the splash screen visible while we load fonts + DB
SplashScreen.preventAutoHideAsync();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: M3.primary,
    background: M3.surface,
    card: M3.surface,
    text: M3.onSurface,
    border: M3.outlineVariant,
    notification: M3.error,
  },
};

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
        setAppReady(true);
        const cleanupStartedAt = Date.now();
        InteractionManager.runAfterInteractions(() => {
          void getActiveMealPhotoUris()
            .then((uris) => cleanupOrphanMealPhotos(uris, cleanupStartedAt))
            .catch((e) => console.error('Meal photo cleanup error:', e));
        });
      } catch (e) {
        console.error('DB init error:', e);
        setDbError(String(e));
        setAppReady(true);
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, []);

  if (!appReady || (!fontsLoaded && !fontError)) {
    return null; // Native splash screen stays visible
  }

  if (fontError || dbError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111318', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#ffb4ab', fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
          {fontError
            ? "Marco couldn't load its interface fonts. Restart the app and try again."
            : "Marco couldn't open its local data. Restart the app and try again."}
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#111318' }}>
      <StatusBar style="light" />
      <NavigationContainer theme={navigationTheme}>
        <RootNavigator />
      </NavigationContainer>
      
      {!splashAnimationFinished && (
        <AnimatedSplashScreen onAnimationFinish={() => setSplashAnimationFinished(true)} />
      )}
    </GestureHandlerRootView>
  );
}
