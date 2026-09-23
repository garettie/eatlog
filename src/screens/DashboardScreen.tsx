import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Animated, {
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
import {
  getProfile,
  getDailyTargetForDate,
  getMostRecentEntry,
  getTodayMacros,
  getWeightLogsByDateRange,
  getDailyCaloriesByDateRange,
  type Profile,
  type DailyTarget,
  type LastEntry,
} from '../db/database';
import { addCalendarDays, todayISO } from '../utils/calendar';
import { parseSqliteUtcTimestamp } from '../utils/sqliteTimestamp';
import { targetOverflowProgress } from '../utils/calculations';
import { useToday } from '../hooks/useToday';
import { foodIcon } from '../utils/foodIcons';
import { M3, TYPE } from '../theme/tokens';
import ResponsiveContent from '../components/ResponsiveContent';
import UpdateBanner from '../components/UpdateBanner';
import { APP_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';
import { DURATION, EASING } from '../theme/motion';
import { useMealPhotoThumbnail } from '../utils/mealPhotoThumbnails';
import { haptics } from '../utils/haptics';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function formatGrouped(n: number): string {
  'worklet';
  const value = Math.round(Math.max(0, n));
  const source = String(value);
  let result = '';
  let count = 0;
  for (let index = source.length - 1; index >= 0; index--) {
    result = source.charAt(index) + result;
    count += 1;
    if (count % 3 === 0 && index > 0) result = ',' + result;
  }
  return result;
}

function CountUpNumber({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const animatedValue = useSharedValue(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current || reduced) {
      animatedValue.value = value;
      mounted.current = true;
      return;
    }
    animatedValue.value = withTiming(value, {
      duration: DURATION.ring,
      easing: EASING.decelerate,
    });
  }, [animatedValue, reduced, value]);

  const animatedProps = useAnimatedProps(() => ({
    text: formatGrouped(animatedValue.value),
  }) as any);

  return (
    <AnimatedTextInput
      editable={false}
      caretHidden
      underlineColorAndroid="transparent"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      defaultValue={formatGrouped(value)}
      animatedProps={animatedProps}
      style={{
        fontFamily: TYPE.family.bold,
        fontWeight: '400',
        fontSize: 36,
        lineHeight: 40,
        color: M3.onSurface,
        letterSpacing: -0.5,
        fontVariant: ['tabular-nums'],
        padding: 0,
        margin: 0,
        textAlign: 'center',
        ...(Platform.OS === 'android'
          ? { includeFontPadding: false, textAlignVertical: 'center' as const }
          : null),
      }}
    />
  );
}

// ── Ring Constants ────────────────────────────────────────────────────────

const RING_SIZE = 164;
const RING_R = 70;
const STROKE = 9;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

// ── CircularProgress Component ────────────────────────────────────────────

function CircularProgress({ progress, overflow }: { progress: number; overflow: number }) {
  const reduced = useReducedMotion();
  const progressSv = useSharedValue(0);
  const overflowSv = useSharedValue(0);

  useEffect(() => {
    const timing = { duration: reduced ? 0 : DURATION.ring, easing: EASING.decelerate };
    progressSv.value = withTiming(Math.min(1, Math.max(0, progress)), timing);
    overflowSv.value = withTiming(Math.min(1, Math.max(0, overflow)), timing);
  }, [overflow, overflowSv, progress, progressSv, reduced]);

  const progressProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progressSv.value),
  }));
  const overflowProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - overflowSv.value),
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
        animatedProps={progressProps}
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
      <AnimatedCircle
        animatedProps={overflowProps}
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        fill="none"
        stroke={M3.onSurface}
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
  showRemaining: boolean;
  progressColor: string;
  overflowColor: string;
}

function MacroProgress({
  label,
  consumed,
  target,
  showRemaining,
  progressColor,
  overflowColor,
}: MacroProgressProps) {
  const reduced = useReducedMotion();
  const remaining = Math.max(0, target - consumed);
  const displayedValue = showRemaining ? remaining : consumed;
  const pct = target > 0 ? Math.min(1, Math.max(0, displayedValue / target)) : 0;
  const over = Math.max(0, consumed - target);
  const overflowPct = targetOverflowProgress(consumed, target);
  const barPctSV = useSharedValue(0);
  const overflowPctSV = useSharedValue(0);

  useEffect(() => {
    const timing = { duration: reduced ? 0 : DURATION.bar, easing: EASING.decelerate };
    barPctSV.value = withTiming(pct, timing);
    overflowPctSV.value = withTiming(overflowPct, timing);
  }, [barPctSV, overflowPct, overflowPctSV, pct, reduced]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: barPctSV.value }],
  }));
  const overflowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: overflowPctSV.value }],
  }));
  const roundedConsumed = Math.round(consumed);
  const roundedTarget = Math.round(target);
  const roundedRemaining = Math.round(remaining);
  const roundedOver = Math.round(over);
  const hasVisibleOverage = roundedOver > 0;
  const accessibilityValue = hasVisibleOverage
    ? `${label}, ${roundedConsumed} of ${roundedTarget} grams, ${roundedOver} grams over`
    : showRemaining
      ? `${label}, ${roundedRemaining} grams remaining, ${roundedConsumed} of ${roundedTarget} grams consumed`
      : `${label}, ${roundedConsumed} of ${roundedTarget} grams consumed`;

  return (
    <View className="flex-1 gap-2 min-w-0" accessible accessibilityLabel={accessibilityValue}>
      <Text className="text-m3-on-surface-variant text-sm font-medium text-center" numberOfLines={1}>{label}</Text>
      <View className="h-1.5 bg-m3-surface-container-highest rounded-full overflow-hidden">
        <Animated.View
          className="absolute inset-0 rounded-full"
          style={[{ backgroundColor: progressColor, transformOrigin: 'left' }, barStyle]}
        />
        <Animated.View
          className="absolute inset-0 rounded-full"
          style={[{ backgroundColor: overflowColor, transformOrigin: 'left' }, overflowStyle]}
        />
      </View>
      <Text className="text-m3-on-surface text-sm font-semibold tabular-nums text-center" numberOfLines={1}>
        {showRemaining ? `${roundedRemaining}g left` : `${roundedConsumed}g / ${roundedTarget}g`}
      </Text>
      <View className="min-h-[14px] items-center">
        {hasVisibleOverage && (
          <Text className="text-compact font-semibold tabular-nums" style={{ color: overflowColor }} numberOfLines={1}>
            +{roundedOver}g over
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Relative Time Helper ─────────────────────────────────────────────────

function getRelativeTime(loggedAtStr: string): string {
  try {
    const loggedAt = parseSqliteUtcTimestamp(loggedAtStr);
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
  onOpenDiaryDate: (date: string) => void;
  dataVersion: number;
}

function DashboardScreen({
  onOpenCamera,
  onOpenGallery,
  onOpenDescribe,
  onOpenDiaryDate,
  dataVersion,
}: DashboardScreenProps) {
  const navigation = useNavigation<any>();
  const reduced = useReducedMotion();
  const today = useToday();
  const { isNarrow, isTwoPane, horizontalPadding } = useResponsiveLayout();
  const { width, fontScale } = useWindowDimensions();
  const stackNutritionSummary = isNarrow || width < 400 || fontScale >= 1.2;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState<DailyTarget | null>(null);
  const [recentFood, setRecentFood] = useState<LastEntry | null>(null);
  const [failedRecentPhotoUri, setFailedRecentPhotoUri] = useState<string | null>(null);
  const recentPhotoUri = useMealPhotoThumbnail(recentFood?.photoUri ?? null);
  const [todayMacros, setTodayMacros] = useState<{
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [weightLoggedDates, setWeightLoggedDates] = useState<string[]>([]);
  const [foodLoggedDates, setFoodLoggedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);
  const [error, setError] = useState(false);
  const initialLoadDone = useRef(false);
  const previousDataVersionRef = useRef(dataVersion);
  const loadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const refreshRequestCountRef = useRef(0);

  // ── Data loading ──

  const loadData = useCallback((showLoading: boolean) => {
    if (showLoading) {
      setLoading(true);
    } else {
      refreshRequestCountRef.current += 1;
      setRefreshing(true);
    }
    const queued = loadQueueRef.current.catch(() => {}).then(async () => {
      try {
        const today = todayISO();
        const historyStart = addCalendarDays(today, -29);
        const [prof, targ, rFood, tMacros, wLogs, calorieDays] = await Promise.all([
          getProfile(),
          getDailyTargetForDate(today),
          getMostRecentEntry(),
          getTodayMacros(today),
          getWeightLogsByDateRange(historyStart, today),
          getDailyCaloriesByDateRange(historyStart, today),
        ]);

        setProfile(prof);
        setTarget(targ);
        setRecentFood(rFood);
        setTodayMacros(tMacros);
        setWeightLoggedDates(wLogs.map((log) => log.log_date));
        setFoodLoggedDates(calorieDays.map((day) => day.log_date));
        setError(false);
      } catch (e) {
        console.error('[Dashboard] loadData failed', e);
        setError(true);
      } finally {
        if (showLoading) {
          setLoading(false);
        } else {
          refreshRequestCountRef.current = Math.max(0, refreshRequestCountRef.current - 1);
          if (refreshRequestCountRef.current === 0) setRefreshing(false);
        }
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
    if (previousDataVersionRef.current === dataVersion) return;
    previousDataVersionRef.current = dataVersion;
    if (!initialLoadDone.current) return;
    loadData(false);
  }, [dataVersion, loadData]);

  const previousTodayRef = useRef(today);
  useEffect(() => {
    if (previousTodayRef.current === today) return;
    previousTodayRef.current = today;
    loadData(false);
  }, [loadData, today]);

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
      ringValue,
      ringProgress: targetCals > 0 ? Math.min(1, Math.max(0, ringValue / targetCals)) : 0,
      ringOverflowProgress: targetOverflowProgress(consumedCals, targetCals),
      flankingLeft: showRemaining ? consumedCals : calsRemaining,
    };
  }, [showRemaining, target, todayMacros]);

  // ── Loading / Empty / Error states ──

  if (loading && (!profile || !target)) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface items-center justify-center" edges={['top', 'left', 'right']}>
        <View className="items-center gap-3" accessibilityLiveRegion="polite">
          <ActivityIndicator color={M3.onSurfaceVariant} />
          <Text className="text-m3-on-surface-variant text-sm font-medium">Loading today's nutrition</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && (!profile || !target)) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <MaterialIcons name="error-outline" size={48} color={M3.onSurfaceVariant} />
          <View className="items-center gap-1" accessibilityRole="alert">
            <Text className="text-m3-on-surface text-base font-semibold text-center">
              Couldn't load today's totals
            </Text>
            <Text className="text-m3-on-surface-variant text-sm font-medium text-center">
              Your diary is still on this device. Try again.
            </Text>
          </View>
          <Pressable
            onPress={() => loadData(true)}
            className="bg-white rounded-full px-6 min-h-[48px] items-center justify-center active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Retry loading today's totals"
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
            Set up your profile to see today's targets
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

  const {
    consumedCals,
    targetCals,
    calsRemaining,
    calsOver,
    ringValue,
    ringProgress,
    ringOverflowProgress,
    flankingLeft,
  } = calorieSummary;

  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const consistencyEndDate = todayISO();
  const profileInitial = profile.display_name.trim().charAt(0).toUpperCase() || 'P';

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void loadData(false); }}
            colors={[M3.primary]}
            progressBackgroundColor={M3.surfaceContainerHigh}
            tintColor={M3.primary}
          />
        )}
      >
        <ResponsiveContent maxWidth={APP_MAX_WIDTH}>
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(DURATION.short)}
          className="gap-4"
        >
          {/* ── Header ── */}
          <View className="gap-3">
            <View className="flex-row justify-between items-start gap-3">
              <View className="flex-1 min-w-0 gap-0.5">
                <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
                  <Text className="text-m3-on-surface-variant text-sm font-medium" numberOfLines={1}>{formattedDate}</Text>
                  {refreshing && <ActivityIndicator size="small" color={M3.onSurfaceVariant} accessibilityLabel="Refreshing today's totals" />}
                </View>
                <Text className="text-m3-on-surface font-bold text-4xl tracking-tight leading-[44px]">Today</Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate('Profile')}
                className="h-12 w-12 rounded-full bg-m3-surface-container-high items-center justify-center active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel="Open profile"
              >
                <Text className="text-m3-on-surface font-bold text-base">{profileInitial}</Text>
              </Pressable>
            </View>
          </View>

          <UpdateBanner />

          {error && (
            <View
              className="bg-m3-error-container rounded-2xl px-4 py-3 flex-row items-center gap-3"
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              <MaterialIcons name="sync-problem" size={22} color={M3.onErrorContainer} />
              <Text className="text-m3-on-error-container text-sm font-medium flex-1">
                Today's totals couldn't refresh. The values below may be out of date.
              </Text>
              <Pressable
                onPress={() => { void loadData(false); }}
                disabled={refreshing}
                className="min-h-[48px] px-3 items-center justify-center rounded-full active:opacity-70 disabled:opacity-50"
                accessibilityRole="button"
                accessibilityLabel="Retry refreshing today's totals"
              >
                <Text className="text-m3-on-error-container text-sm font-semibold">Retry</Text>
              </Pressable>
            </View>
          )}

          <View className={isTwoPane ? 'flex-row items-start gap-4' : 'gap-4'}>
          <View className={isTwoPane ? 'flex-[3] min-w-0' : 'w-full'}>
          {/* ── Calorie Ring Card ── */}
          <Card className="p-6 gap-5 items-center">
            <Text className="text-m3-on-surface text-2xl font-bold self-start">Daily nutrition</Text>
            {/* Ring + flanking numbers */}
            <View className={`${stackNutritionSummary ? 'gap-3' : 'flex-row'} items-center justify-center w-full`}>
              {/* Left: flanking number */}
              {!stackNutritionSummary && (
                <View
                  className="items-center flex-1 min-w-0"
                  accessible
                  accessibilityLabel={`${flankingLeft.toLocaleString()} kilocalories ${showRemaining ? 'consumed' : 'remaining'}`}
                >
                  <View className="flex-row items-baseline gap-1">
                    <Text className="text-m3-on-surface text-xl font-bold tabular-nums">
                      {flankingLeft.toLocaleString()}
                    </Text>
                  </View>
                  <Text className="text-m3-on-surface-variant text-sm font-medium">
                    {showRemaining ? 'Consumed' : 'Remaining'}
                  </Text>
                </View>
              )}

              {/* Center: ring with value overlaid */}
              <View className="items-center justify-center">
                <CircularProgress progress={ringProgress} overflow={ringOverflowProgress} />
                <View
                  className="absolute inset-0 items-center justify-center"
                  accessible
                  accessibilityLabel={`${ringValue.toLocaleString()} kilocalories ${showRemaining ? 'remaining' : 'consumed'}`}
                >
                  <View className="flex-row items-baseline gap-1">
                    <CountUpNumber value={ringValue} />
                  </View>
                  <Text className="text-m3-on-surface-variant text-sm font-medium mt-0.5">
                    {showRemaining ? 'Remaining' : 'Consumed'}
                  </Text>
                </View>
              </View>

              {/* Right: target */}
              {!stackNutritionSummary && (
                <View
                  className="items-center flex-1 min-w-0"
                  accessible
                  accessibilityLabel={`${targetCals.toLocaleString()} kilocalories target`}
                >
                  <View className="flex-row items-baseline gap-1">
                    <Text className="text-m3-on-surface text-xl font-bold tabular-nums">
                      {targetCals.toLocaleString()}
                    </Text>
                  </View>
                  <Text className="text-m3-on-surface-variant text-sm font-medium">Target</Text>
                </View>
              )}

              {stackNutritionSummary && (
                <View className="w-full flex-row gap-4">
                  <View
                    className="items-center flex-1 min-w-0"
                    accessible
                    accessibilityLabel={`${flankingLeft.toLocaleString()} kilocalories ${showRemaining ? 'consumed' : 'remaining'}`}
                  >
                    <View className="flex-row items-baseline gap-1">
                      <Text className="text-m3-on-surface text-lg font-bold tabular-nums">
                        {flankingLeft.toLocaleString()}
                      </Text>
                    </View>
                    <Text className="text-m3-on-surface-variant text-sm font-medium">
                      {showRemaining ? 'Consumed' : 'Remaining'}
                    </Text>
                  </View>
                  <View className="w-px bg-m3-outline-variant/50" />
                  <View
                    className="items-center flex-1 min-w-0"
                    accessible
                    accessibilityLabel={`${targetCals.toLocaleString()} kilocalories target`}
                  >
                    <View className="flex-row items-baseline gap-1">
                      <Text className="text-m3-on-surface text-lg font-bold tabular-nums">
                        {targetCals.toLocaleString()}
                      </Text>
                    </View>
                    <Text className="text-m3-on-surface-variant text-sm font-medium">Target</Text>
                  </View>
                </View>
              )}
            </View>

            {calsOver > 0 && (
              <Text className="text-xs font-semibold tabular-nums" style={{ color: M3.caloriesOverflow }} accessibilityLiveRegion="polite">
                +{calsOver.toLocaleString()} kcal over target
              </Text>
            )}

            {/* Macro progress */}
            <View className="flex-row gap-3 w-full">
              <MacroProgress
                label="Protein"
                consumed={todayMacros.protein_g}
                target={target.target_protein_g}
                showRemaining={showRemaining}
                progressColor={M3.protein}
                overflowColor={M3.proteinOverflow}
              />
              <MacroProgress
                label="Carbs"
                consumed={todayMacros.carbs_g}
                target={target.target_carbs_g}
                showRemaining={showRemaining}
                progressColor={M3.carbs}
                overflowColor={M3.carbsOverflow}
              />
              <MacroProgress
                label="Fat"
                consumed={todayMacros.fat_g}
                target={target.target_fat_g}
                showRemaining={showRemaining}
                progressColor={M3.fat}
                overflowColor={M3.fatOverflow}
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
                  haptics.select();
                }}
              />
            </View>
          </Card>
          </View>

          <View className={isTwoPane ? 'flex-[2] min-w-0 gap-4' : 'gap-4'}>

          {/* ── Last Logged Card OR First-Use Hero ── */}
          {recentFood ? (
            <Pressable
              onPress={() => {
                onOpenDiaryDate(recentFood.logDate);
                navigation.navigate('Diary', { date: recentFood.logDate, requestId: Date.now() });
              }}
              className="active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel={`Open ${recentFood.name} in diary on ${recentFood.logDate}`}
            >
              <Card className="p-4 flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1 min-w-0">
                  <View className="w-10 h-10 rounded-full bg-m3-surface-container-high items-center justify-center shrink-0 overflow-hidden">
                    {/* Same media rule as the Diary: the meal's own photo, with the food icon as fallback. */}
                    {recentPhotoUri && recentPhotoUri !== failedRecentPhotoUri ? (
                      <Image
                        source={{ uri: recentPhotoUri }}
                        style={{ width: 40, height: 40 }}
                        resizeMode="cover"
                        fadeDuration={reduced ? 0 : DURATION.enter}
                        onError={() => setFailedRecentPhotoUri(recentPhotoUri)}
                      />
                    ) : (
                      <MaterialCommunityIcons name={foodIcon(recentFood.name)} size={18} color={M3.onSurfaceVariant} />
                    )}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-m3-on-surface font-bold text-sm leading-4" numberOfLines={2}>
                      {recentFood.name}
                    </Text>
                    <Text className="mt-0.5 text-m3-on-surface-variant text-xs leading-4" numberOfLines={1}>
                      Last logged · {Math.round(recentFood.calories)} kcal · {getRelativeTime(recentFood.logged_at)}
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
                onPress={() => onOpenCamera()}
                accessibilityRole="button"
                accessibilityLabel="Scan a meal with camera"
                className="active:opacity-90"
              >
                <View className="bg-white rounded-full py-4 flex-row items-center justify-center gap-2">
                  <MaterialIcons name="photo-camera" size={18} color={M3.onPrimary} />
                  <Text className="text-m3-on-primary font-bold text-base">Scan a meal</Text>
                </View>
              </Pressable>
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Pressable
                  onPress={() => onOpenGallery()}
                  className="min-h-[48px] px-2 flex-row items-center justify-center gap-1.5 active:opacity-60"
                  accessibilityRole="button"
                  accessibilityLabel="Upload a photo from gallery"
                >
                  <MaterialIcons name="photo-library" size={16} color={M3.onSurfaceVariant} />
                  <Text className="text-m3-on-surface-variant font-medium text-sm">Upload photo</Text>
                </Pressable>
                <Pressable
                  onPress={() => onOpenDescribe()}
                  className="min-h-[48px] px-2 flex-row items-center justify-center gap-1.5 active:opacity-60"
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
          <Card className="p-5 gap-2 overflow-hidden">
            <Pressable
              onPress={() => navigation.navigate('Analytics')}
              hitSlop={{ top: 13, bottom: 13, left: 8, right: 8 }}
              className="flex-row justify-between items-center gap-3 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Open analytics"
            >
              <View className="flex-1 min-w-0 gap-0.5">
                <Text className="text-m3-on-surface font-semibold text-base">Analytics</Text>
                <Text className="text-m3-on-surface-variant text-compact">Last 30 days</Text>
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
          </View>
          </View>
        </Animated.View>
        </ResponsiveContent>
      </ScrollView>

    </SafeAreaView>
  );
}

export default React.memo(DashboardScreen);
