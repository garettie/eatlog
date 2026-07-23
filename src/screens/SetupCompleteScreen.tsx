import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';

import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'SetupComplete'>;

export default function SetupCompleteScreen({ route, navigation }: Props) {
  const { displayName, tdee, targetCalories, targetProtein, targetFat, targetCarbs } =
    route.params;

  const macroKcal = (g: number, perGram: number) => Math.round(g * perGram);

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-8 pb-10 gap-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6">
          {/* ── Success header ── */}
      <View className="items-center mb-8">
        <View className="w-16 h-16 rounded-full bg-m3-primary-container items-center justify-center mb-4">
          <MaterialIcons name="check" size={32} color="#ffffff" />
        </View>
        <Text className="text-m3-on-surface text-2xl font-bold mb-2 text-center">
          You're all set, {displayName}!
        </Text>
        <Text className="text-m3-on-surface-variant text-sm text-center">
          Your metabolic plan has been calculated and saved.
        </Text>
      </View>

      {/* ── Calorie target card ── */}
      <Card className="p-6 mb-4">
        <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-3">
          Target Calories
        </Text>
        <View className="bg-m3-surface-container-high rounded-2xl p-5 mb-3 items-center">
          <Text className="text-m3-on-surface font-bold text-5xl tabular-nums">
            {targetCalories.toLocaleString()}
          </Text>
          <Text className="text-m3-on-surface-variant text-sm mt-1">kcal / day</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-m3-on-surface-variant text-sm">TDEE estimate</Text>
          <Text className="text-m3-expenditure font-bold text-sm tabular-nums">
            {tdee.toLocaleString()} kcal
          </Text>
        </View>
      </Card>

      {/* ── Macros — 3-column grid ── */}
      <Card className="p-6 mb-4">
        <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-3">
          Macronutrient Split
        </Text>
        <View className="flex-row gap-3 mt-3">
          {[
            {
              label: 'Protein',
              grams: targetProtein,
              textColor: 'text-m3-protein',
              calsPerGram: 4,
            },
            {
              label: 'Fat',
              grams: targetFat,
              textColor: 'text-m3-fat',
              calsPerGram: 9,
            },
            {
              label: 'Carbs',
              grams: targetCarbs,
              textColor: 'text-m3-carbs',
              calsPerGram: 4,
            },
          ].map((macro) => {
            const kcal = macroKcal(macro.grams, macro.calsPerGram);
            const pct = Math.round((kcal / targetCalories) * 100);
            return (
              <View
                key={macro.label}
                className="flex-1 bg-m3-surface-container rounded-2xl p-3 items-center"
              >
                <Text className={`${macro.textColor} text-xs font-semibold`}>
                  {macro.label}
                </Text>
                <Text className="text-m3-on-surface text-sm font-bold tabular-nums mt-0.5">
                  {Math.round(macro.grams)}g
                </Text>
                <Text className="text-m3-on-surface-variant text-xs mt-0.5">{kcal} kcal ({pct}%)</Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* ── Adaptive engine card ── */}
      <Card className="p-6 mb-6">
        <View className="flex-row items-start gap-3">
          <MaterialIcons name="auto-graph" size={20} color="#c4c6d0" style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text className="text-m3-on-surface text-sm font-semibold mb-1">
              Adaptive Recalibration Engine
            </Text>
            <Text className="text-m3-on-surface-variant text-xs leading-5">
              These starting targets use the Mifflin-St Jeor formula. Log your food and weight
              daily — after at least 7 days with consistent data the app will calculate your
              actual TDEE from real weight changes and offer updated weekly targets.
            </Text>
          </View>
        </View>
      </Card>

      {/* ── Get Started button ── */}
      <Pressable
        onPress={() => navigation.replace('Tabs')}
        className="bg-m3-primary rounded-full py-5 flex-row items-center justify-center gap-2 active:opacity-70"
      >
        <MaterialIcons name="arrow-forward" size={18} color="#0f1117" />
        <Text className="text-m3-on-primary font-semibold text-base">Get Started</Text>
      </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
