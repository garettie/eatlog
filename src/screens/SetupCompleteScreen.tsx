import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';

import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  Easing,
  FadeInDown,
  ZoomIn,
  runOnJS,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'SetupComplete'>;

/** UI-thread-driven count-up; snaps to target under reduced motion. */
function useCountUp(target: number, duration = 900): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? target : 0);
  const sv = useSharedValue(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(target);
      return;
    }
    sv.value = 0;
    sv.value = withTiming(target, { duration, easing: Easing.out(Easing.cubic) });
  }, [target]);

  useAnimatedReaction(
    () => Math.round(sv.value),
    (v) => runOnJS(setDisplay)(v)
  );

  return display;
}

export default function SetupCompleteScreen({ route, navigation }: Props) {
  const { displayName, tdee, targetCalories, targetProtein, targetFat, targetCarbs } =
    route.params;
  const reduced = useReducedMotion();

  const calories = useCountUp(targetCalories);

  const enter = (delay: number) =>
    reduced ? undefined : FadeInDown.duration(300).delay(delay);

  const macros = [
    { label: 'Protein', grams: targetProtein, textColor: 'text-m3-protein', cpg: 4 },
    { label: 'Fat', grams: targetFat, textColor: 'text-m3-fat', cpg: 9 },
    { label: 'Carbs', grams: targetCarbs, textColor: 'text-m3-carbs', cpg: 4 },
  ];

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-12 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5">
          {/* ── Success header ── */}
          <View className="items-center gap-4 mb-2">
            <Reanimated.View
              entering={reduced ? undefined : ZoomIn.duration(400).springify()}
              className="w-16 h-16 rounded-full bg-m3-primary-container items-center justify-center"
            >
              <MaterialIcons name="check" size={32} color="#ffffff" />
            </Reanimated.View>
            <Reanimated.View entering={enter(150)} className="items-center gap-1.5">
              <Text className="text-m3-on-surface text-2xl font-bold text-center">
                You're all set{displayName ? `, ${displayName}` : ''}
              </Text>
              <Text className="text-m3-on-surface-variant text-sm text-center">
                Your metabolic plan is calculated and saved.
              </Text>
            </Reanimated.View>
          </View>

          {/* ── Calorie target ── */}
          <Reanimated.View entering={enter(280)}>
            <Card className="p-6">
              <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-3">
                Daily Calorie Target
              </Text>
              <View className="bg-m3-surface-container-high rounded-2xl p-5 mb-3 items-center">
                <Text className="text-m3-on-surface font-bold text-5xl tabular-nums">
                  {calories.toLocaleString()}
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
          </Reanimated.View>

          {/* ── Macro split — staggered ── */}
          <View className="flex-row gap-3">
            {macros.map((macro, i) => {
              const kcal = Math.round(macro.grams * macro.cpg);
              const pct = Math.round((kcal / targetCalories) * 100);
              return (
                <Reanimated.View key={macro.label} entering={enter(420 + i * 90)} className="flex-1">
                  <Card className="p-4 items-center gap-0.5">
                    <Text className={`${macro.textColor} text-xs font-semibold`}>
                      {macro.label}
                    </Text>
                    <Text className="text-m3-on-surface text-lg font-bold tabular-nums">
                      {Math.round(macro.grams)}g
                    </Text>
                    <Text className="text-m3-on-surface-variant text-xs">
                      {kcal} kcal ({pct}%)
                    </Text>
                  </Card>
                </Reanimated.View>
              );
            })}
          </View>

          {/* ── Adaptive engine ── */}
          <Reanimated.View entering={enter(700)}>
            <Card className="p-6">
              <View className="flex-row items-start gap-3">
                <MaterialIcons name="auto-graph" size={20} color="#c4c6d0" style={{ marginTop: 1 }} />
                <View className="flex-1">
                  <Text className="text-m3-on-surface text-sm font-semibold mb-1">
                    Built for better calibration
                  </Text>
                  <Text className="text-m3-on-surface-variant text-sm">
                    These starting targets use the Mifflin-St Jeor formula. Consistent food and
                    weight logs build the history needed for more personalized adjustments.
                  </Text>
                </View>
              </View>
            </Card>
          </Reanimated.View>

          {/* ── Scanner-first hint ── */}
          <Reanimated.View entering={enter(820)}>
            <Card className="p-6">
              <View className="flex-row items-start gap-3">
                <MaterialIcons name="photo-camera" size={20} color="#c4c6d0" style={{ marginTop: 1 }} />
                <View className="flex-1">
                  <Text className="text-m3-on-surface text-sm font-semibold mb-1">
                    Log your first meal
                  </Text>
                  <Text className="text-m3-on-surface-variant text-sm">
                    Point the camera at any meal — Marco estimates the macros for you.
                    You can review every estimate before it reaches your diary.
                  </Text>
                </View>
              </View>
            </Card>
          </Reanimated.View>

          {/* ── Get Started ── */}
          <Reanimated.View entering={enter(940)}>
            <PrimaryButton
              title="Get Started"
              icon="arrow-forward"
              onPress={() => navigation.replace('Tabs')}
            />
          </Reanimated.View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
