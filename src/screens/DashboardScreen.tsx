import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import Card from '../components/Card';
import LoggingHeatmap from '../components/LoggingHeatmap';
import SegmentedControl from '../components/SegmentedControl';
import * as Haptics from 'expo-haptics';
import {
  getProfile,
  getLatestDailyTarget,
  getMostRecentEntry,
  getTodayMacros,
  getWeightLogsByDateRange,
  getDailyCaloriesByDateRange,
  getDistinctLoggedDayCount,
  Profile,
  DailyTarget,
  LastEntry,
} from '../db/database';
import { addCalendarDays, todayISO } from '../utils/calendar';
import { foodIcon } from '../utils/foodIcons';
import { M3 } from '../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Ring Constants ────────────────────────────────────────────────────────

const RING_SIZE = 164;
const RING_R = 70;
const STROKE = 9;
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

// ── MacroProgress Component ───────────────────────────────────────────────

interface MacroProgressProps {
  label: string;
  consumed: number;
  target: number;
  progressColorClass: string;
}

function MacroProgress({ label, consumed, target, progressColorClass }: MacroProgressProps) {
  const reduced = useReducedMotion();
  const pct = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0;
  const overflowPct = target > 0 ? Math.min(1, Math.max(0, (consumed - target) / target)) : 0;
  const barPctSV = useSharedValue(0);
  const overflowPctSV = useSharedValue(0);

  useEffect(() => {
    barPctSV.value = withTiming(pct, { duration: reduced ? 0 : 350, easing: Easing.bezier(0.33, 1, 0.68, 1) });
    overflowPctSV.value = withTiming(overflowPct, { duration: reduced ? 0 : 350, easing: Easing.bezier(0.33, 1, 0.68, 1) });
  }, [pct, overflowPct, reduced]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: barPctSV.value }],
  }));
  const overflowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: overflowPctSV.value }],
  }));

  return (
    <View className="flex-1 gap-2 min-w-0">
      <Text className="text-m3-on-surface-variant text-sm font-medium text-center" numberOfLines={1}>{label}</Text>
      <View className="h-1.5 bg-m3-surface-container-highest rounded-full overflow-hidden">
        <Animated.View
          className={`absolute inset-0 ${progressColorClass} rounded-full`}
          style={[{ transformOrigin: 'left' }, barStyle]}
        />
        <Animated.View
          className="absolute inset-0 bg-black/25"
          style={[{ transformOrigin: 'right' }, overflowStyle]}
        />
      </View>
      <Text className="text-m3-on-surface text-sm font-semibold tabular-nums text-center" numberOfLines={1}>
        {Math.round(consumed)} / {Math.round(target)}g
      </Text>
    </View>
  );
}

// ── Relative Time Helper ─────────────────────────────────────────────────

function getRelativeTime(loggedAtStr: string): string {
  try {
    const loggedAt = new Date(loggedAtStr);
    if (Number.isNaN(loggedAt.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - loggedAt.getTime();
    if (diffMs < 0) return 'Just now';
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

interface DashboardScreenProps {
  onOpenCamera: () => void;
  onOpenGallery: () => void;
  onOpenDescribe: () => void;
  onOpenAdaptiveInfo: () => void;
  dataVersion: number;
}

function DashboardScreen({
  onOpenCamera,
  onOpenGallery,
  onOpenDescribe,
  onOpenAdaptiveInfo,
  dataVersion,
}: DashboardScreenProps) {
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
  const [weightLoggedDates, setWeightLoggedDates] = useState<string[]>([]);
  const [foodLoggedDates, setFoodLoggedDates] = useState<string[]>([]);
  const [distinctLoggedDays, setDistinctLoggedDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showRemaining, setShowRemaining] = useState(false);
  const [error, setError] = useState(false);
  const initialLoadDone = useRef(false);
  const loadQueueRef = useRef<Promise<void>>(Promise.resolve());

  // ── Data loading ──

  const loadData = useCallback((showLoading: boolean) => {
    if (showLoading) setLoading(true);
    const queued = loadQueueRef.current.catch(() => {}).then(async () => {
      try {
        const today = todayISO();
        const prof = await getProfile();
        const targ = await getLatestDailyTarget();
        const rFood = await getMostRecentEntry();
        const tMacros = await getTodayMacros(today);
        const historyStart = addCalendarDays(today, -29);
        const wLogs = await getWeightLogsByDateRange(historyStart, today);
        const calorieDays = await getDailyCaloriesByDateRange(historyStart, today);
        const ddCount = await getDistinctLoggedDayCount();

        setProfile(prof);
        setTarget(targ);
        setRecentFood(rFood);
        setTodayMacros(tMacros);
        setWeightLoggedDates(wLogs.map((log) => log.log_date));
        setFoodLoggedDates(calorieDays.map((day) => day.log_date));
        setDistinctLoggedDays(ddCount);
        setError(false);
      } catch (e) {
        console.error('[Dashboard] loadData failed', e);
        setError(true);
      } finally {
        if (showLoading) setLoading(false);
      }
    });
    loadQueueRef.current = queued;
    return queued;
  }, []);

  useFocusEffect(
    useCallback(() => {
      const isInitial = !initialLoadDone.current;
      initialLoadDone.current = true;
      loadData(isInitial);
    }, [loadData])
  );

  // The bottom sheet is an overlay, so focus does not change after a save.
  useEffect(() => {
    if (!initialLoadDone.current) return; // skip mount, useFocusEffect handles it
    loadData(false);
  }, [dataVersion, loadData]);

  const calorieSummary = useMemo(() => {
    const consumedCals = Math.round(todayMacros.calories);
    const targetCals = Math.round(target?.target_calories ?? 0);
    const calsRemaining = Math.max(0, targetCals - consumedCals);
    const calsOver = Math.max(0, consumedCals - targetCals);
    const ringValue = showRemaining ? calsRemaining : consumedCals;
    return {
      consumedCals,
      targetCals,
      calsRemaining,
      calsOver,
      proteinRemaining: Math.max(0, (target?.target_protein_g ?? 0) - todayMacros.protein_g),
      carbsRemaining: Math.max(0, (target?.target_carbs_g ?? 0) - todayMacros.carbs_g),
      fatRemaining: Math.max(0, (target?.target_fat_g ?? 0) - todayMacros.fat_g),
      ringValue,
      ringProgress: targetCals > 0 ? Math.min(1, Math.max(0, ringValue / targetCals)) : 0,
      flankingLeft: showRemaining ? consumedCals : calsRemaining,
    };
  }, [showRemaining, target, todayMacros]);

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
          <MaterialIcons name="error-outline" size={48} color={M3.onSurfaceVariant} />
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

  const hasRecentFood = !!recentFood;
  let headerChip: { label: string; locked: boolean } | null;
  if (!hasRecentFood) {
    headerChip = null; // empty-state hero carries the activation focus, no clutter
  } else if (distinctLoggedDays < 14) {
    headerChip = { label: `${distinctLoggedDays}/14 days logged`, locked: true };
  } else {
    headerChip = { label: 'Reviews unlocked', locked: false };
  }

  const {
    consumedCals,
    targetCals,
    calsRemaining,
    calsOver,
    proteinRemaining,
    carbsRemaining,
    fatRemaining,
    ringValue,
    ringProgress,
    flankingLeft,
  } = calorieSummary;

  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const consistencyEndDate = todayISO();

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-5 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(200)}
          className="gap-4"
        >
          {/* ── Header ── */}
          <View className="gap-3">
            <View className="flex-row justify-between items-start gap-3">
              <View className="flex-1 min-w-0 gap-0.5">
                <Text className="text-m3-on-surface-variant text-sm font-medium" numberOfLines={1}>{formattedDate}</Text>
                <Text className="text-m3-on-surface font-bold text-4xl tracking-tight">Dashboard</Text>
              </View>
            </View>
            {headerChip && (
              <View className="flex-row justify-end">
              <Pressable
                onPress={onOpenAdaptiveInfo}
                accessibilityRole="button"
                accessibilityLabel={`${headerChip.label}. What are adaptive targets?`}
                className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border active:opacity-70 ${
                  headerChip.locked
                    ? 'bg-m3-surface-container border-m3-outline-variant/30'
                    : 'bg-m3-expenditure/15 border-m3-expenditure/40'
                }`}
              >
                <MaterialIcons
                  name={headerChip.locked ? 'lock' : 'auto-awesome'}
                  size={11}
                  color={headerChip.locked ? M3.onSurfaceVariant : M3.expenditure}
                />
                <Text
                  className={`text-[10px] font-semibold ${
                    headerChip.locked ? 'text-m3-on-surface-variant' : 'text-m3-expenditure'
                  }`}
                  numberOfLines={1}
                >
                  {headerChip.label}
                </Text>
              </Pressable>
              </View>
            )}
          </View>

          {/* ── Calorie Ring Card ── */}
          <Card className="p-6 gap-5 items-center">
            <Text className="text-m3-on-surface text-2xl font-bold self-start">Daily nutrition</Text>
            {/* Ring + flanking numbers */}
            <View className="flex-row items-center justify-center w-full gap-2">
              {/* Left: flanking number */}
              <View className="items-center flex-1 min-w-0">
                <Text className="text-m3-on-surface text-xl font-bold tabular-nums">
                  {flankingLeft.toLocaleString()}
                </Text>
                <Text className="text-m3-on-surface-variant text-sm font-medium">
                  {showRemaining ? 'Consumed' : 'Remaining'}
                </Text>
              </View>

              {/* Center: ring with value overlaid */}
              <View className="items-center justify-center">
                <CircularProgress progress={ringProgress} />
                <View className="absolute inset-0 items-center justify-center">
                  <Text className="text-m3-on-surface font-bold text-4xl tabular-nums tracking-tight">
                    {ringValue.toLocaleString()}
                  </Text>
                  <Text className="text-m3-on-surface-variant text-sm font-medium mt-0.5">
                    {showRemaining ? 'Remaining' : 'Consumed'}
                  </Text>
                </View>
              </View>

              {/* Right: target */}
              <View className="items-center flex-1 min-w-0">
                <Text className="text-m3-on-surface text-xl font-bold tabular-nums">
                  {targetCals.toLocaleString()}
                </Text>
                <Text className="text-m3-on-surface-variant text-sm font-medium">Target</Text>
              </View>
            </View>

            {calsOver > 0 && (
              <Text className="text-m3-error text-xs font-semibold tabular-nums">
                +{calsOver.toLocaleString()} kcal over target
              </Text>
            )}

            {/* Macro progress */}
            <View className="flex-row gap-3 w-full">
              <MacroProgress
                label="Protein"
                consumed={showRemaining ? proteinRemaining : todayMacros.protein_g}
                target={target.target_protein_g}
                progressColorClass="bg-m3-protein"
              />
              <MacroProgress
                label="Carbs"
                consumed={showRemaining ? carbsRemaining : todayMacros.carbs_g}
                target={target.target_carbs_g}
                progressColorClass="bg-m3-carbs"
              />
              <MacroProgress
                label="Fat"
                consumed={showRemaining ? fatRemaining : todayMacros.fat_g}
                target={target.target_fat_g}
                progressColorClass="bg-m3-fat"
              />
            </View>

            {/* Toggle pill */}
            <View className="w-full mt-1">
              <SegmentedControl
                options={[
                  { value: 'consumed', label: 'Consumed' },
                  { value: 'remaining', label: 'Remaining' },
                ]}
                value={showRemaining ? 'remaining' : 'consumed'}
                onChange={(value) => {
                  setShowRemaining(value === 'remaining');
                  void Haptics.selectionAsync();
                }}
              />
            </View>
          </Card>

          {/* ── Last Logged Card OR First-Use Hero ── */}
          {recentFood ? (
            <Pressable
              onPress={() => navigation.navigate('Diary')}
              className="active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel={`Open ${recentFood.name} in diary`}
            >
              <Card className="p-4 flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1">
                  <View className="w-10 h-10 rounded-full bg-m3-surface-container-high items-center justify-center">
                    <MaterialCommunityIcons name={foodIcon(recentFood.name)} size={18} color={M3.onSurfaceVariant} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-m3-on-surface font-bold text-sm" numberOfLines={1}>
                      {recentFood.name}
                    </Text>
                    <Text className="text-m3-on-surface-variant text-xs mt-0.5">
                      {Math.round(recentFood.calories)} kcal · {getRelativeTime(recentFood.logged_at)}
                    </Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={M3.onSurfaceVariant} />
              </Card>
            </Pressable>
          ) : (
            <Card className="p-5 gap-3">
              <View className="flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-m3-surface-container-high items-center justify-center">
                  <MaterialIcons name="restaurant" size={16} color={M3.onSurfaceVariant} />
                </View>
                <Text className="text-m3-on-surface font-bold text-base">
                  Log your first meal
                </Text>
              </View>
              <Text className="text-m3-on-surface-variant text-sm">
                A photo is enough. Review the estimate before it reaches your diary.
              </Text>
              <Pressable
                onPress={onOpenCamera}
                accessibilityRole="button"
                accessibilityLabel="Scan a meal with camera"
                className="active:opacity-90"
              >
                <View className="bg-white rounded-full py-4 flex-row items-center justify-center gap-2">
                  <MaterialIcons name="photo-camera" size={18} color={M3.onPrimary} />
                  <Text className="text-m3-on-primary font-bold text-base">Scan a meal</Text>
                </View>
              </Pressable>
              <View className="flex-row items-center justify-between">
                <Pressable
                  onPress={onOpenGallery}
                  className="flex-row items-center gap-1.5 py-2 active:opacity-60"
                  accessibilityRole="button"
                  accessibilityLabel="Upload a photo from gallery"
                >
                  <MaterialIcons name="photo-library" size={16} color={M3.onSurfaceVariant} />
                  <Text className="text-m3-on-surface-variant font-medium text-sm">Upload photo</Text>
                </Pressable>
                <Pressable
                  onPress={onOpenDescribe}
                  className="flex-row items-center gap-1.5 py-2 active:opacity-60"
                  accessibilityRole="button"
                  accessibilityLabel="Describe a meal in words"
                >
                  <Text className="text-m3-on-surface-variant font-medium text-sm">Describe</Text>
                  <MaterialIcons name="arrow-forward" size={14} color={M3.onSurfaceVariant} />
                </Pressable>
              </View>
            </Card>
          )}

          {/* ── Analytics Card ── */}
          <Card className="p-5 gap-4 overflow-hidden">
            <Pressable
              onPress={() => navigation.navigate('Analytics')}
              className="min-h-[48px] flex-row justify-between items-center gap-3 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Open analytics"
            >
              <View className="flex-1 min-w-0">
                <Text className="text-m3-on-surface font-semibold text-base">Analytics</Text>
                <Text className="text-m3-on-surface-variant text-[10px] font-medium mt-0.5" numberOfLines={1}>
                  Logging consistency · Last 30 days
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={M3.onSurfaceVariant} />
            </Pressable>

            <View className="flex-row gap-4">
              <LoggingHeatmap
                kind="weight"
                loggedDates={weightLoggedDates}
                endDate={consistencyEndDate}
                compact
              />
              <View className="w-px bg-m3-outline-variant/50" />
              <LoggingHeatmap
                kind="food"
                loggedDates={foodLoggedDates}
                endDate={consistencyEndDate}
                compact
              />
            </View>
          </Card>
        </Animated.View>
      </ScrollView>

    </SafeAreaView>
  );
}

export default React.memo(DashboardScreen);
