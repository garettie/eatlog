import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { LineChart } from 'react-native-gifted-charts';

import Card from '../components/Card';
import {
  getProfile,
  getLatestDailyTarget,
  getMostRecentEntry,
  getTodayMacros,
  getRecentWeightLogs,
  Profile,
  DailyTarget,
  LastEntry,
  WeightLog,
} from '../db/database';
import { todayISO } from '../utils/calculations';
import { M3 } from '../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedText = Animated.createAnimatedComponent(Text);

// ── Ring Constants ────────────────────────────────────────────────────────

const RING_SIZE = 140;
const RING_R = 60;
const STROKE = 8;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

// ── CircularProgress Component ────────────────────────────────────────────

function CircularProgress({ progress }: { progress: number }) {
  const reduced = useReducedMotion();
  const sv = useSharedValue(0);

  useEffect(() => {
    sv.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: reduced ? 0 : 350, easing: Easing.bezier(0.33, 1, 0.68, 1) });
  }, [progress, reduced]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - sv.value),
  }));

  return (
    <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        fill="none"
        stroke={M3.surfaceContainerHighest}
        strokeWidth={STROKE}
        opacity={0.5}
      />
      <AnimatedCircle
        animatedProps={animatedProps}
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        fill="none"
        stroke={M3.primary}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        rotation={-90}
        originX={RING_SIZE / 2}
        originY={RING_SIZE / 2}
      />
    </Svg>
  );
}

// ── MacroTile Component ───────────────────────────────────────────────────

interface MacroTileProps {
  label: string;
  consumed: number;
  target: number;
  textColorClass: string;
  progressColorClass: string;
}

function MacroTile({ label, consumed, target, textColorClass, progressColorClass }: MacroTileProps) {
  const reduced = useReducedMotion();
  const pct = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0;
  const barPctSV = useSharedValue(0);
  const trackWidthSV = useSharedValue(0);

  useEffect(() => {
    barPctSV.value = withTiming(pct, { duration: reduced ? 0 : 350, easing: Easing.bezier(0.33, 1, 0.68, 1) });
  }, [pct, reduced]);

  const barStyle = useAnimatedStyle(() => ({
    width: barPctSV.value * trackWidthSV.value,
  }));

  return (
    <View className="flex-1 bg-m3-surface-container-high rounded-2xl p-3">
      <View className="flex-row justify-between items-baseline mb-2">
        <Text className={`${textColorClass} text-xs font-semibold`}>{label}</Text>
        <Text className="text-m3-on-surface-variant text-[10px] tabular-nums font-medium">
          {Math.round(consumed)}g
        </Text>
      </View>
      <View
        className="h-1 bg-m3-surface-container-highest rounded-full overflow-hidden"
        onLayout={(e) => { trackWidthSV.value = e.nativeEvent.layout.width; }}
      >
        <Animated.View
          className={`h-full ${progressColorClass} rounded-full`}
          style={barStyle}
        />
      </View>
    </View>
  );
}

// ── Relative Time Helper ─────────────────────────────────────────────────

function getRelativeTime(loggedAtStr: string): string {
  try {
    const loggedAt = new Date(loggedAtStr);
    const now = new Date();
    const diffMs = now.getTime() - loggedAt.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (loggedAt.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return loggedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}

// ── DashboardScreen Component ─────────────────────────────────────────────

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const reduced = useReducedMotion();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState<DailyTarget | null>(null);
  const [recentFood, setRecentFood] = useState<LastEntry | null>(null);
  const [todayMacros, setTodayMacros] = useState<{
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRemaining, setShowRemaining] = useState(false);
  const [error, setError] = useState(false);
  const initialLoadDone = useRef(false);

  // ── Toggle animation ──
  const toggleValSV = useSharedValue(0);
  const toggleContainerWidthSV = useSharedValue(202);

  useEffect(() => {
    toggleValSV.value = withTiming(showRemaining ? 1 : 0, { duration: reduced ? 0 : 300, easing: Easing.bezier(0.33, 1, 0.68, 1) });
  }, [showRemaining, reduced]);

  const togglePillStyle = useAnimatedStyle(() => {
    const halfW = toggleContainerWidthSV.value / 2;
    const pillW = halfW - 2;
    return {
      transform: [{ translateX: toggleValSV.value * pillW }],
      width: pillW,
      top: 2,
      bottom: 2,
      left: 0,
    };
  });

  const consumedTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(toggleValSV.value, [0, 1], [M3.onPrimary, M3.onSurfaceVariant]),
  }));

  const remainingTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(toggleValSV.value, [0, 1], [M3.onSurfaceVariant, M3.onPrimary]),
  }));

  // ── Data loading ──

  const loadData = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const today = todayISO();
      const prof = await getProfile();
      const targ = await getLatestDailyTarget();
      const rFood = await getMostRecentEntry();
      const tMacros = await getTodayMacros(today);
      const wLogs = await getRecentWeightLogs(30);

      setProfile(prof);
      setTarget(targ);
      setRecentFood(rFood);
      setTodayMacros(tMacros);
      setWeightLogs([...wLogs].reverse());
      setError(false);
    } catch (e) {
      console.error('[Dashboard] loadData failed', e);
      setError(true);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const isInitial = !initialLoadDone.current;
      initialLoadDone.current = true;
      loadData(isInitial);
    }, [loadData])
  );

  // ── Loading / Empty / Error states ──

  if (loading && (!profile || !target)) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface items-center justify-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator color={M3.onSurfaceVariant} />
      </SafeAreaView>
    );
  }

  if (error && (!profile || !target)) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <MaterialIcons name="cloud-off" size={48} color={M3.onSurfaceVariant} />
          <Text className="text-m3-on-surface-variant text-sm font-medium text-center">
            Couldn't load your dashboard. Check your data and try again.
          </Text>
          <Pressable
            onPress={() => loadData(true)}
            className="bg-white rounded-full px-6 py-3.5 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Retry loading dashboard"
          >
            <Text className="text-m3-on-primary font-semibold text-sm">Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile || !target) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <MaterialIcons name="person-outline" size={48} color={M3.onSurfaceVariant} />
          <Text className="text-m3-on-surface-variant text-sm font-medium text-center">
            Set up your profile to see your dashboard
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Onboarding')}
            className="bg-white rounded-full px-6 py-3.5 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Go to onboarding"
          >
            <Text className="text-m3-on-primary font-semibold text-sm">Get started</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived data ──

  const initials = profile.display_name
    ? profile.display_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'JD';

  const goalLabels = {
    cut: 'Weight Loss',
    bulk: 'Weight Gain',
    maintain: 'Maintenance',
  };
  const goalLabel = goalLabels[profile.goal_type] || 'Maintenance';
  const goalSubtitle = profile.goal_type === 'maintain'
    ? `Goal: ${goalLabel}`
    : `Goal: ${goalLabel} (${profile.goal_rate_kg_per_week >= 0 ? '+' : ''}${profile.goal_rate_kg_per_week.toFixed(2)} kg/wk)`;

  let checkInText = 'Due today';
  if (profile.created_at) {
    const created = new Date(profile.created_at);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - created.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const rem = 7 - (diffDays % 7);
    if (rem > 0 && rem < 7) {
      checkInText = `Check-in in ${rem} days`;
    } else {
      checkInText = 'Due today';
    }
  }

  const consumedCals = Math.round(todayMacros.calories);
  const targetCals = Math.round(target.target_calories);
  const calsRemaining = targetCals - consumedCals;

  const proteinRemaining = target.target_protein_g - todayMacros.protein_g;
  const carbsRemaining = target.target_carbs_g - todayMacros.carbs_g;
  const fatRemaining = target.target_fat_g - todayMacros.fat_g;

  const ringValue = showRemaining ? calsRemaining : consumedCals;
  const ringProgress = targetCals > 0 ? Math.min(1, Math.max(0, ringValue / targetCals)) : 0;
  const flankingLeft = showRemaining ? consumedCals : calsRemaining;

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const chartData = weightLogs.map((log) => ({
    value: log.trend_weight_kg,
  }));
  const rawDotsData = weightLogs.map((log) => ({
    value: log.scale_weight_kg,
  }));

  const latestWeightLog = weightLogs[weightLogs.length - 1];
  const hasWeightData = weightLogs.length >= 2;
  const trendWeightDisplay = latestWeightLog
    ? latestWeightLog.trend_weight_kg.toFixed(1)
    : '--';
  const scaleWeightDisplay = latestWeightLog
    ? latestWeightLog.scale_weight_kg.toFixed(1)
    : '--';

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-6 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(200)}
          className="gap-4"
        >
          {/* ── Header ── */}
          <View className="flex-row justify-between items-center">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-white items-center justify-center">
                <Text className="text-m3-on-primary font-bold text-sm">{initials}</Text>
              </View>
              <View>
                <Text className="text-m3-on-surface font-bold text-base">{formattedDate}</Text>
                <Text className="text-m3-on-surface-variant text-xs">{goalSubtitle}</Text>
              </View>
            </View>
            <View className="bg-m3-surface-container rounded-full px-3 py-1.5 border border-m3-outline-variant/30">
              <Text className="text-m3-on-surface-variant text-[11px] font-semibold">{checkInText}</Text>
            </View>
          </View>

          {/* ── Calorie Ring Card ── */}
          <Card className="p-5 gap-4 items-center">
            {/* Ring + flanking numbers */}
            <View className="flex-row items-center justify-center w-full gap-3">
              {/* Left: flanking number */}
              <View className="items-center min-w-[56px]">
                <Text className="text-m3-on-surface-variant text-sm font-bold tabular-nums">
                  {flankingLeft.toLocaleString()}
                </Text>
                <Text className="text-m3-on-surface-variant text-[10px] font-medium">
                  {showRemaining ? 'Consumed' : 'Remaining'}
                </Text>
              </View>

              {/* Center: ring with value overlaid */}
              <View className="items-center justify-center">
                <CircularProgress progress={ringProgress} />
                <View className="absolute inset-0 items-center justify-center">
                  <Text className="text-m3-on-surface font-bold text-3xl tabular-nums">
                    {ringValue.toLocaleString()}
                  </Text>
                  <Text className="text-m3-on-surface-variant text-[11px] font-medium mt-0.5">
                    {showRemaining ? 'Remaining' : 'Consumed'}
                  </Text>
                </View>
              </View>

              {/* Right: target */}
              <View className="items-center min-w-[56px]">
                <Text className="text-m3-on-surface-variant text-sm font-bold tabular-nums">
                  {targetCals.toLocaleString()}
                </Text>
                <Text className="text-m3-on-surface-variant text-[10px] font-medium">Target</Text>
              </View>
            </View>

            {/* Toggle pill */}
            <View
              className="flex-row w-full bg-m3-surface-container-high rounded-full p-0.5 border border-m3-outline-variant/30 relative overflow-hidden"
              onLayout={(e) => { toggleContainerWidthSV.value = e.nativeEvent.layout.width; }}
            >
              <Animated.View
                style={togglePillStyle}
                className="absolute bg-white rounded-full"
              />
              <Pressable
                onPress={() => setShowRemaining(false)}
                className="flex-1 py-3.5 items-center z-10 active:opacity-60"
                accessibilityRole="button"
                accessibilityLabel="Show calories consumed"
              >
                <AnimatedText style={consumedTextStyle} className="text-xs font-bold">
                  Consumed
                </AnimatedText>
              </Pressable>
              <Pressable
                onPress={() => setShowRemaining(true)}
                className="flex-1 py-3.5 items-center z-10 active:opacity-60"
                accessibilityRole="button"
                accessibilityLabel="Show calories remaining"
              >
                <AnimatedText style={remainingTextStyle} className="text-xs font-bold">
                  Remaining
                </AnimatedText>
              </Pressable>
            </View>

            {/* Macro tiles */}
            <View className="flex-row gap-2 w-full">
              <MacroTile
                label="Protein"
                consumed={showRemaining ? proteinRemaining : todayMacros.protein_g}
                target={target.target_protein_g}
                textColorClass="text-m3-protein"
                progressColorClass="bg-m3-protein"
              />
              <MacroTile
                label="Carbs"
                consumed={showRemaining ? carbsRemaining : todayMacros.carbs_g}
                target={target.target_carbs_g}
                textColorClass="text-m3-carbs"
                progressColorClass="bg-m3-carbs"
              />
              <MacroTile
                label="Fat"
                consumed={showRemaining ? fatRemaining : todayMacros.fat_g}
                target={target.target_fat_g}
                textColorClass="text-m3-fat"
                progressColorClass="bg-m3-fat"
              />
            </View>
          </Card>

          {/* ── Last Logged Card ── */}
          <Pressable onPress={() => navigation.navigate('Diary')} className="active:opacity-80">
            <Card className="p-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <View className="w-10 h-10 rounded-full bg-m3-surface-container-high items-center justify-center">
                  <MaterialIcons name="restaurant" size={18} color={M3.onSurfaceVariant} />
                </View>
                {recentFood ? (
                  <View className="flex-1">
                    <Text className="text-m3-on-surface font-bold text-sm" numberOfLines={1}>
                      {recentFood.name}
                    </Text>
                    <Text className="text-m3-on-surface-variant text-xs mt-0.5">
                      {Math.round(recentFood.calories)} kcal · {getRelativeTime(recentFood.logged_at)}
                    </Text>
                  </View>
                ) : (
                  <View className="flex-1">
                    <Text className="text-m3-on-surface-variant text-sm font-medium">
                      Log your first entry to see it here
                    </Text>
                  </View>
                )}
              </View>
              <MaterialIcons name="chevron-right" size={20} color={M3.onSurfaceVariant} />
            </Card>
          </Pressable>

          {/* ── Weight Trend Card ── */}
          {/* TODO: navigate to analytics/history screen when built */}
          <Card className="p-5 gap-4">
            <View className="flex-row justify-between items-baseline">
              <Text className="text-m3-on-surface font-bold text-sm">Weight Trend</Text>
              <Text className="text-m3-expenditure text-xs font-bold tabular-nums">
                {profile.goal_rate_kg_per_week >= 0 ? '+' : ''}
                {profile.goal_rate_kg_per_week.toFixed(2)} kg/wk
              </Text>
            </View>

            {!hasWeightData ? (
              <View className="h-32 justify-center items-center">
                <Text className="text-m3-on-surface-variant text-sm font-medium text-center">
                  Log a few more check-ins to see your trend
                </Text>
              </View>
            ) : (
              <>
                <View className="h-32 justify-end py-2">
                  <LineChart
                    data={chartData}
                    data2={rawDotsData}
                    height={90}
                    thickness={2}
                    color={M3.expenditure}
                    hideRules
                    hideYAxisText
                    hideAxesAndRules
                    xAxisThickness={0}
                    yAxisThickness={0}
                    curved
                    initialSpacing={15}
                    endSpacing={15}
                    hideDataPoints={false}
                    dataPointsColor="rgba(196,198,208,0.8)"
                    dataPointsRadius={3}
                    hideDataPoints1
                    thickness2={0}
                    color2="transparent"
                    hideDataPoints2={false}
                    dataPointsColor2="rgba(196,198,208,0.8)"
                    dataPointsRadius2={3.5}
                  />
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1 bg-m3-surface-container-high rounded-2xl p-4 gap-1">
                    <Text className="text-m3-on-surface-variant text-xs font-semibold">Trend Weight</Text>
                    <Text className="text-m3-expenditure font-bold text-xl tabular-nums">
                      {trendWeightDisplay} kg
                    </Text>
                  </View>
                  <View className="flex-1 bg-m3-surface-container-high rounded-2xl p-4 gap-1">
                    <Text className="text-m3-on-surface-variant text-xs font-semibold">Scale Weight</Text>
                    <Text className="text-m3-on-surface font-bold text-xl tabular-nums">
                      {scaleWeightDisplay} kg
                    </Text>
                  </View>
                </View>
              </>
            )}
          </Card>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
