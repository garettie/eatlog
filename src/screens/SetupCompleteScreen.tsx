import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';

import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  ZoomIn,
  useReducedMotion,
} from 'react-native-reanimated';

import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { M3 } from '../theme/tokens';
import ResponsiveContent from '../components/ResponsiveContent';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';
import { WELLNESS_DISCLAIMER } from '../utils/nutritionSafety';

type Props = NativeStackScreenProps<RootStackParamList, 'SetupComplete'>;

export default function SetupCompleteScreen({ route, navigation }: Props) {
  const { displayName, tdee, targetCalories, targetProtein, targetFat, targetCarbs } =
    route.params;
  const reduced = useReducedMotion();
  const { isNarrow, horizontalPadding } = useResponsiveLayout();

  const macros = [
    { label: 'Protein', grams: targetProtein, textColor: 'text-m3-protein' },
    { label: 'Fat', grams: targetFat, textColor: 'text-m3-fat' },
    { label: 'Carbs', grams: targetCarbs, textColor: 'text-m3-carbs' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 48, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContent maxWidth={FORM_MAX_WIDTH}>
        <View className="gap-7">
          <View className="items-center gap-4">
            <Reanimated.View
              entering={reduced ? undefined : ZoomIn.duration(400).springify()}
              className="w-16 h-16 rounded-full bg-m3-primary-container items-center justify-center"
            >
              <MaterialIcons name="check" size={32} color={M3.primary} />
            </Reanimated.View>
            <View className="items-center gap-1.5">
              <Text accessibilityRole="header" className="text-m3-on-surface text-2xl font-bold text-center">
                You're all set{displayName ? `, ${displayName}` : ''}
              </Text>
              <Text className="text-m3-on-surface-variant text-sm text-center">
                Your starting plan is saved. Log meals and weight to build evidence for future updates.
              </Text>
            </View>
          </View>

          <Card className="overflow-hidden">
            <View className="items-center gap-1 px-6 pb-6 pt-7">
              <Text className="text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant">
                Daily target
              </Text>
              <Text className="text-5xl font-bold tabular-nums text-m3-on-surface">
                {targetCalories.toLocaleString()}
              </Text>
              <Text className="text-sm text-m3-on-surface-variant">kcal per day</Text>
            </View>
            <View className={`${isNarrow ? 'gap-4' : 'flex-row'} border-t border-m3-outline-variant/50 bg-m3-surface-container-high px-5 py-4`}>
              {macros.map((macro) => (
                <View key={macro.label} className="flex-1 gap-0.5">
                  <Text className={`${macro.textColor} text-xs font-semibold`}>{macro.label}</Text>
                  <Text className="text-base font-bold tabular-nums text-m3-on-surface">{Math.round(macro.grams)}g</Text>
                </View>
              ))}
            </View>
            <View className={`${isNarrow ? 'gap-1' : 'flex-row items-start justify-between gap-4'} border-t border-m3-outline-variant/50 px-5 py-4`}>
              <Text className="text-sm text-m3-on-surface-variant">Starting expenditure estimate</Text>
              <Text className={`${isNarrow ? 'self-start' : 'text-right'} text-sm font-bold tabular-nums text-m3-expenditure`}>{tdee.toLocaleString()} kcal</Text>
            </View>
          </Card>

          <View className="gap-5 px-1">
            <View className="flex-row items-start gap-3">
              <MaterialIcons name="photo-camera" size={20} color={M3.onSurfaceVariant} style={{ marginTop: 1 }} />
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-m3-on-surface">Log your first meal</Text>
                <Text className="text-sm text-m3-on-surface-variant">Scan, describe, reuse, search, or enter it manually. Review every estimate before saving.</Text>
              </View>
            </View>
            <View className="flex-row items-start gap-3">
              <MaterialIcons name="auto-graph" size={20} color={M3.expenditure} style={{ marginTop: 1 }} />
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-m3-on-surface">Improve from real history</Text>
                <Text className="text-sm text-m3-on-surface-variant">Consistent food and weight logs can support future target recommendations.</Text>
              </View>
            </View>
            <Text className="text-xs leading-4 text-m3-on-surface-variant">{WELLNESS_DISCLAIMER}</Text>
          </View>

          <PrimaryButton
            title="Log your first meal"
            icon="arrow-forward"
            onPress={() => navigation.replace('Tabs', { screen: 'Today', params: undefined, openEntry: true })}
          />
        </View>
        </ResponsiveContent>
      </ScrollView>
    </SafeAreaView>
  );
}
