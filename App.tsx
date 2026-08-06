import './global.css';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, Pressable, View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Onest_400Regular } from '@expo-google-fonts/onest/400Regular';
import { Onest_500Medium } from '@expo-google-fonts/onest/500Medium';
import { Onest_600SemiBold } from '@expo-google-fonts/onest/600SemiBold';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { initDatabase, getActiveMealPhotoUris } from './src/db/database';
import { cleanupOrphanMealPhotos } from './src/utils/mealPhotos';
import RootNavigator from './src/navigation/RootNavigator';
import { M3, TYPE } from './src/theme/tokens';
import { DataMaintenanceContext, type MaintenanceTask } from './src/context/DataMaintenanceContext';
import type { OwnershipProgressEvent, OwnershipResult } from './src/services/dataOwnership.types';
import ResponsiveContent from './src/components/ResponsiveContent';

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
  const databaseInitRef = useRef<Promise<void> | null>(null);
  const [dataEpoch, setDataEpoch] = useState(0);
  const [maintenance, setMaintenance] = useState<{
    label: string;
    task: MaintenanceTask;
    resolve: (result: OwnershipResult) => void;
    reject: (error: unknown) => void;
  } | null>(null);
  const [maintenanceProgress, setMaintenanceProgress] = useState<OwnershipProgressEvent | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceResult, setMaintenanceResult] = useState<OwnershipResult | null>(null);
  const maintenanceStartedRef = useRef(false);

  const [fontsLoaded, fontError] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
  });

  const prepare = useCallback(async () => {
    if (databaseInitRef.current) return databaseInitRef.current;
    const initialization = (async () => {
      try {
        setDbError(null);
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
      }
    })();
    databaseInitRef.current = initialization;
    try {
      await initialization;
    } finally {
      databaseInitRef.current = null;
    }
  }, []);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  useEffect(() => {
    if (appReady && (fontsLoaded || fontError)) {
      void SplashScreen.hideAsync();
    }
  }, [appReady, fontError, fontsLoaded]);

  const runDataMaintenance = useCallback((label: string, task: MaintenanceTask) => (
    new Promise<OwnershipResult>((resolve, reject) => {
      setMaintenanceError(null);
      setMaintenanceResult(null);
      setMaintenanceProgress(null);
      maintenanceStartedRef.current = false;
      setMaintenance({ label, task, resolve, reject });
    })
  ), []);

  useEffect(() => {
    if (!maintenance || maintenanceStartedRef.current) return;
    maintenanceStartedRef.current = true;
    void maintenance.task(setMaintenanceProgress).then((result) => {
      maintenance.resolve(result);
      setDataEpoch((value) => value + 1);
      setMaintenanceResult(result);
      setMaintenance(null);
      setMaintenanceProgress(null);
    }).catch((error) => {
      maintenance.reject(error);
      setMaintenanceError(error instanceof Error ? error.message : 'The operation could not be completed.');
    });
  }, [maintenance]);

  const maintenanceContext = useMemo(() => ({ runDataMaintenance }), [runDataMaintenance]);

  if (!appReady || (!fontsLoaded && !fontError)) {
    return null; // Native splash screen stays visible
  }

  if (fontError || dbError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111318', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ResponsiveContent maxWidth={520} className="items-center">
        <Text style={{ color: '#ffb4ab', fontFamily: TYPE.family.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
          {fontError
            ? "Eatlog couldn't load its interface fonts. Restart the app and try again."
            : "Eatlog couldn't open its local data. Restart the app and try again."}
        </Text>
        {dbError && !fontError && (
          <Pressable onPress={() => void prepare()} accessibilityRole="button" className="mt-5 min-h-[48px] justify-center rounded-full bg-m3-surface-container-high px-6">
            <Text className="font-semibold text-sm text-m3-on-surface">Retry database</Text>
          </Pressable>
        )}
        </ResponsiveContent>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#111318' }}>
      <StatusBar style="light" />
      <DataMaintenanceContext.Provider value={maintenanceContext}>
        {maintenance ? (
          <View className="flex-1 items-center justify-center bg-m3-surface px-8">
            <ResponsiveContent maxWidth={520} className="items-center">
            {maintenanceError ? (
              <>
                <Text className="text-center font-semibold text-lg text-m3-on-surface">{maintenance.label} failed</Text>
                <Text accessibilityLiveRegion="assertive" className="mt-3 text-center text-sm text-m3-error">{maintenanceError}</Text>
                <Text className="mt-3 text-center text-sm text-m3-on-surface-variant">Eatlog stopped the operation. Return to verify your local data before trying again.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { setMaintenance(null); setMaintenanceError(null); setDataEpoch((value) => value + 1); }}
                  className="mt-6 min-h-[48px] justify-center rounded-full bg-m3-primary px-6"
                >
                  <Text className="font-semibold text-sm text-m3-on-primary">Return to Eatlog</Text>
                </Pressable>
              </>
            ) : (
              <>
                <ActivityIndicator color={M3.primary} size="large" />
                <Text className="mt-5 text-center font-semibold text-lg text-m3-on-surface">{maintenance.label}</Text>
                <Text accessibilityLiveRegion="polite" className="mt-2 text-center text-sm text-m3-on-surface-variant">
                  {maintenanceProgress?.message ?? 'Preparing your local data'}
                </Text>
              </>
            )}
            </ResponsiveContent>
          </View>
        ) : maintenanceResult ? (
          <View className="flex-1 items-center justify-center bg-m3-surface px-8">
            <ResponsiveContent maxWidth={520} className="items-center">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-m3-primary-container">
              <Text className="font-bold text-xl text-m3-on-primary-container">✓</Text>
            </View>
            <Text className="mt-5 text-center font-semibold text-lg text-m3-on-surface">Operation complete</Text>
            <Text accessibilityLiveRegion="polite" className="mt-2 text-center text-sm text-m3-on-surface-variant">{maintenanceResult.summary}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMaintenanceResult(null)}
              className="mt-6 min-h-[48px] justify-center rounded-full bg-m3-primary px-6"
            >
              <Text className="font-semibold text-sm text-m3-on-primary">Continue</Text>
            </Pressable>
            </ResponsiveContent>
          </View>
        ) : (
          <NavigationContainer key={dataEpoch} theme={navigationTheme}>
            <RootNavigator />
          </NavigationContainer>
        )}
      </DataMaintenanceContext.Provider>
    </GestureHandlerRootView>
  );
}
