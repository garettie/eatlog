import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import LoggingHeatmap from '../components/LoggingHeatmap';
import SegmentedControl from '../components/SegmentedControl';
import WeightChart from '../components/WeightChart';
import WeightChartLegend from '../components/WeightChartLegend';
import {
  DailyTarget,
  Profile,
  WeightLog,
  getDailyCaloriesByDateRange,
  getDailyTargetForDate,
  getProfile,
  getWeightLogsByDateRange,
  setAnalyticsIntroDismissed,
} from '../db/database';
import {
  AdaptiveReviewState,
  acceptAdaptiveReview,
  getAdaptiveReviewState,
  keepAdaptiveReview,
} from '../services/adaptiveReviews';
import { M3 } from '../theme/tokens';
import {
  addCalendarDays,
  addCalendarMonths,
  calendarDaysBetween,
  parseLocalISO,
  todayISO,
} from '../utils/calendar';
import { computeNormalizedWeeklyRate } from '../utils/weightTrend';
import { formatWeight } from '../utils/weightUnits';
import ResponsiveContent from '../components/ResponsiveContent';
import { APP_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';

type RangeKey = '1M' | '3M' | '6M' | '1Y';

interface AnalyticsScreenProps {
  onOpenWeight: () => void;
  dataVersion: number;
  onDataChanged: (message: string) => void;
}

interface AnalyticsData {
  profile: Profile;
  chartWeights: WeightLog[];
  dailyCalories: Array<{ log_date: string; calories: number }>;
  target: DailyTarget;
  endDate: string;
}

type ProgressKind =
  | 'insufficient'
  | 'on-pace'
  | 'moving-away'
  | 'faster'
  | 'slower'
  | 'outside-maintenance';

const RANGE_OPTIONS = [
  { value: '1M' as const, label: '1M' },
  { value: '3M' as const, label: '3M' },
  { value: '6M' as const, label: '6M' },
  { value: '1Y' as const, label: '1Y' },
];

function rangeDates(range: RangeKey, endDate: string) {
  const months = range === '1M' ? -1 : range === '3M' ? -3 : range === '6M' ? -6 : -12;
  return { startDate: addCalendarDays(addCalendarMonths(endDate, months), 1), endDate };
}

function displayDate(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function signedWeight(valueKg: number, unit: Profile['weight_unit']): string {
  const sign = valueKg > 0 ? '+' : valueKg < 0 ? '-' : '';
  return `${sign}${formatWeight(Math.abs(valueKg), unit)} ${unit}`;
}

function signedRate(valueKg: number, unit: Profile['weight_unit']): string {
  return `${signedWeight(valueKg, unit)}/wk`;
}

function classifyProgress(
  profile: Profile,
  actualRate: number | null,
  observationCount: number,
  endpointSpanDays: number,
): ProgressKind {
  if (actualRate == null || observationCount < 2 || endpointSpanDays < 7) return 'insufficient';
  if (profile.goal_type === 'maintain') {
    return Math.abs(actualRate) <= 0.1 ? 'on-pace' : 'outside-maintenance';
  }

  const desiredRate = profile.goal_rate_kg_per_week;
  const tolerance = Math.max(0.1, Math.abs(desiredRate) * 0.25);
  const sameDirection = Math.sign(actualRate) === Math.sign(desiredRate);
  if (sameDirection && Math.abs(actualRate - desiredRate) <= tolerance) return 'on-pace';
  if (!sameDirection && Math.abs(actualRate) > 0.1) return 'moving-away';
  if (sameDirection && Math.abs(actualRate) > Math.abs(desiredRate) + tolerance) return 'faster';
  return 'slower';
}

function progressCopy(kind: ProgressKind, goal: Profile['goal_type']) {
  switch (kind) {
    case 'insufficient':
      return {
        title: 'More data needed',
        body: 'Two check-ins spanning at least seven days are needed to compare your trend.',
      };
    case 'on-pace':
      return {
        title: 'On pace',
        body: goal === 'maintain'
          ? 'Your trend is within the maintenance range.'
          : `Your trend is close to your planned ${goal === 'cut' ? 'loss' : 'gain'} rate.`,
      };
    case 'moving-away':
      return {
        title: 'Moving away from plan',
        body: 'Your measured trend is moving in the opposite direction from your planned rate.',
      };
    case 'faster':
      return {
        title: 'Faster than planned',
        body: 'Your measured trend is changing faster than your planned rate.',
      };
    case 'outside-maintenance':
      return {
        title: 'Outside maintenance range',
        body: 'Your measured trend is changing by more than 0.10 kg per week.',
      };
    default:
      return {
        title: 'Slower than planned',
        body: 'Your measured trend is changing more slowly than your planned rate.',
      };
  }
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View className="flex-1 min-w-[136px] bg-m3-surface-container-high rounded-2xl p-4 gap-1">
      <Text className="text-m3-on-surface-variant text-xs font-semibold">{label}</Text>
      <Text className="text-m3-on-surface text-lg font-bold tabular-nums">{value}</Text>
      {detail ? (
        <Text className="text-m3-on-surface-variant text-compact font-medium">{detail}</Text>
      ) : null}
    </View>
  );
}

function MacroRow({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  return (
    <View className="flex-row gap-2">
      <View className="flex-1 bg-m3-protein/10 rounded-xl px-2 py-2.5 items-center">
        <Text className="text-m3-protein text-compact font-semibold">Protein</Text>
        <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{Math.round(protein)}g</Text>
      </View>
      <View className="flex-1 bg-m3-carbs/10 rounded-xl px-2 py-2.5 items-center">
        <Text className="text-m3-carbs text-compact font-semibold">Carbs</Text>
        <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{Math.round(carbs)}g</Text>
      </View>
      <View className="flex-1 bg-m3-fat/10 rounded-xl px-2 py-2.5 items-center">
        <Text className="text-m3-fat text-compact font-semibold">Fat</Text>
        <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{Math.round(fat)}g</Text>
      </View>
    </View>
  );
}

function AnalyticsScreen({
  onOpenWeight,
  dataVersion,
  onDataChanged,
}: AnalyticsScreenProps) {
  const reduced = useReducedMotion();
  const { isTwoPane, horizontalPadding } = useResponsiveLayout();
  const [selectedRange, setSelectedRange] = useState<RangeKey>('1M');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [recommendation, setRecommendation] = useState<AdaptiveReviewState | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState(false);
  const [recommendationError, setRecommendationError] = useState(false);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [resolving, setResolving] = useState<'accept' | 'keep' | null>(null);
  const [staleMessage, setStaleMessage] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);

  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);
  const hasDataRef = useRef(false);
  const selectedRangeRef = useRef<RangeKey>('1M');
  const loadedDateRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const dataVersionRef = useRef(dataVersion);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const enqueue = useCallback((operation: () => Promise<void>): Promise<void> => {
    const result = operationQueueRef.current.catch(() => undefined).then(operation);
    operationQueueRef.current = result.catch(() => undefined);
    return result;
  }, []);

  const loadData = useCallback(async (options: { initial?: boolean } = {}) => {
    const requestId = ++requestRef.current;
    if (options.initial) {
      setInitialLoading(true);
      setInitialError(false);
    }
    await enqueue(async () => {
      if (!mountedRef.current || requestId !== requestRef.current) return;
      try {
        const endDate = todayISO();

        // Keep these reads sequential; concurrent statements can race on Android.
        const profile = await getProfile();
        if (!profile) throw new Error('Profile is required');
        const chartStartDate = rangeDates('1Y', endDate).startDate;
        const chartWeights = await getWeightLogsByDateRange(chartStartDate, endDate);
        const calorieHistoryStart = rangeDates('1Y', endDate).startDate;
        const dailyCalories = await getDailyCaloriesByDateRange(calorieHistoryStart, endDate);
        const target = await getDailyTargetForDate(endDate);
        if (!target) throw new Error('Daily target is required');

        let nextRecommendation: AdaptiveReviewState | null = null;
        let nextRecommendationError = false;
        try {
          nextRecommendation = await getAdaptiveReviewState(endDate);
        } catch (error) {
          console.error('[Analytics] recommendation load failed', error);
          nextRecommendationError = true;
        }

        if (!mountedRef.current || requestId !== requestRef.current) return;
        setData({ profile, chartWeights, dailyCalories, target, endDate });
        hasDataRef.current = true;
        loadedDateRef.current = endDate;
        setRecommendation(nextRecommendation);
        setRecommendationError(nextRecommendationError);
        setStaleMessage(false);
        setInitialError(false);
      } catch (error) {
        console.error('[Analytics] loadData failed', error);
        if (!mountedRef.current || requestId !== requestRef.current) return;
        if (!hasDataRef.current) setInitialError(true);
      } finally {
        if (!mountedRef.current || requestId !== requestRef.current) return;
        setInitialLoading(false);
      }
    });
  }, [enqueue]);

  useFocusEffect(
    useCallback(() => {
      const initial = !initialLoadDoneRef.current && !hasDataRef.current;
      initialLoadDoneRef.current = true;
      if (!hasDataRef.current || loadedDateRef.current !== todayISO()) {
        void loadData({ initial });
      }
    }, [loadData]),
  );

  useEffect(() => {
    if (dataVersionRef.current === dataVersion) return;
    dataVersionRef.current = dataVersion;
    if (initialLoadDoneRef.current) void loadData();
  }, [dataVersion, loadData]);

  const analyticsDerived = useMemo(() => {
    if (!data) return null;
    const chartDates = rangeDates(selectedRange, data.endDate);
    const dailyCalories = data.dailyCalories.filter((day) => day.log_date >= chartDates.startDate && day.log_date <= chartDates.endDate);
    const rangeWeights = data.chartWeights.filter((log) => log.log_date >= chartDates.startDate && log.log_date <= chartDates.endDate);
    const earliestWeight = rangeWeights[0];
    const latestWeight = rangeWeights[rangeWeights.length - 1];
    const endpointSpanDays = earliestWeight && latestWeight
      ? calendarDaysBetween(earliestWeight.log_date, latestWeight.log_date)
      : 0;
    const trendChange = rangeWeights.length > 1 && earliestWeight && latestWeight
      ? latestWeight.trend_weight_kg - earliestWeight.trend_weight_kg
      : null;
    const weeklyRate = rangeWeights.length > 1 && earliestWeight && latestWeight
      ? computeNormalizedWeeklyRate(
        { logDate: earliestWeight.log_date, trendWeightKg: earliestWeight.trend_weight_kg },
        { logDate: latestWeight.log_date, trendWeightKg: latestWeight.trend_weight_kg },
      )
      : null;
    const averageCalories = dailyCalories.length
      ? dailyCalories.reduce((sum, day) => sum + day.calories, 0) / dailyCalories.length
      : null;
    const progressKind = classifyProgress(data.profile, weeklyRate, rangeWeights.length, endpointSpanDays);
    return {
      chartDates,
      dailyCalories,
      latestWeight,
      endpointSpanDays,
      trendChange,
      weeklyRate,
      averageCalories,
      progress: progressCopy(progressKind, data.profile.goal_type),
      sufficientProgress: progressKind !== 'insufficient',
    };
  }, [data, selectedRange]);

  const handleRangeChange = useCallback((range: RangeKey) => {
    if (range === selectedRangeRef.current) return;
    selectedRangeRef.current = range;
    setSelectedRange(range);
  }, []);

  const dismissIntro = useCallback(() => {
    setIntroDismissed(true);
    void setAnalyticsIntroDismissed().catch((e) =>
      console.error('[Analytics] intro dismiss persist failed', e),
    );
  }, []);

  const retryRecommendation = useCallback(async () => {
    if (recommendationLoading) return;
    setRecommendationLoading(true);
    await enqueue(async () => {
      try {
        const next = await getAdaptiveReviewState(todayISO());
        if (!mountedRef.current) return;
        setRecommendation(next);
        setRecommendationError(false);
        setStaleMessage(false);
      } catch (error) {
        console.error('[Analytics] recommendation retry failed', error);
        if (mountedRef.current) setRecommendationError(true);
      } finally {
        if (mountedRef.current) setRecommendationLoading(false);
      }
    });
  }, [enqueue, recommendationLoading]);

  const resolveRecommendation = useCallback(async (action: 'accept' | 'keep') => {
    if (resolving || recommendation?.kind !== 'ready') return;
    setResolving(action);
    setStaleMessage(false);
    let resolved = false;

    try {
      await enqueue(async () => {
        const result = action === 'accept'
          ? await acceptAdaptiveReview(recommendation.review.id)
          : await keepAdaptiveReview(recommendation.review.id);
        if (result.status === 'stale') {
          const refreshed = await getAdaptiveReviewState(todayISO());
          if (mountedRef.current) {
            setRecommendation(refreshed);
            setRecommendationError(false);
            setStaleMessage(true);
          }
        } else {
          resolved = true;
        }
      });

      if (resolved) {
        onDataChanged(action === 'accept' ? 'New targets accepted' : 'Current targets kept');
      }
    } catch (error) {
      console.error('[Analytics] recommendation resolution failed', error);
      if (mountedRef.current) setRecommendationError(true);
    } finally {
      if (mountedRef.current) setResolving(null);
    }
  }, [enqueue, onDataChanged, recommendation, resolving]);

  if (initialLoading && !data) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface items-center justify-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator color={M3.onSurfaceVariant} accessibilityLabel="Loading analytics" />
      </SafeAreaView>
    );
  }

  if (initialError && !data) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <MaterialIcons name="error-outline" size={48} color={M3.onSurfaceVariant} />
          <Text className="text-m3-on-surface-variant text-sm font-medium text-center">
            Couldn't load analytics. Check your data and try again.
          </Text>
          <Pressable
            onPress={() => void loadData({ initial: true })}
            className="min-h-[48px] bg-white rounded-full px-6 items-center justify-center active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Retry loading analytics"
            accessibilityState={{ disabled: initialLoading, busy: initialLoading }}
            disabled={initialLoading}
          >
            <Text className="text-m3-on-primary font-semibold text-sm">Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) return null;

  const {
    profile,
    chartWeights,
    target,
  } = data;
  const {
    chartDates,
    dailyCalories,
    latestWeight,
    endpointSpanDays,
    trendChange,
    weeklyRate,
    averageCalories,
    progress,
    sufficientProgress,
  } = analyticsDerived!;
  const foodLoggedDates = data.dailyCalories.map((day) => day.log_date);
  const weightLoggedDates = chartWeights.map((log) => log.log_date);

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        disableScrollViewPanResponder
      >
        <ResponsiveContent maxWidth={APP_MAX_WIDTH}>
        <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} className="gap-4">
          <View className="gap-1">
            <Text className="text-m3-on-surface text-2xl font-bold">Analytics</Text>
            <Text className="text-m3-on-surface-variant text-sm">
              Weight, consistency, and target calibration
            </Text>
          </View>

          <View>
            <SegmentedControl
              options={RANGE_OPTIONS}
              value={selectedRange}
              onChange={handleRangeChange}
            />
          </View>

          {!profile.analytics_intro_dismissed && !introDismissed && (
            <View className="flex-row items-start gap-3 rounded-2xl bg-m3-surface-container-high px-4 py-3 border border-m3-outline-variant/30">
              <MaterialIcons name="info-outline" size={16} color={M3.onSurfaceVariant} style={{ marginTop: 2 }} />
              <Text className="flex-1 text-m3-on-surface-variant text-sm">
                Trend weight smooths daily water swings; scale weight is the raw number. Weekly reviews compare your intake with that trend and propose targets — only Accept changes them.
              </Text>
              <Pressable
                onPress={dismissIntro}
                accessibilityRole="button"
                accessibilityLabel="Dismiss explanation"
                className="w-12 h-12 -m-3 items-center justify-center active:opacity-60"
              >
                <MaterialIcons name="close" size={16} color={M3.onSurfaceVariant} />
              </Pressable>
            </View>
          )}

          <View className={isTwoPane ? 'flex-row items-start gap-4' : 'gap-4'}>
          <View className={isTwoPane ? 'flex-[3] min-w-0 gap-4' : 'gap-4'}>
          <Card className="p-5 gap-4">
            <View className="flex-row items-baseline justify-between gap-3">
              <View>
                <Text className="text-m3-on-surface font-bold text-base">Weight</Text>
                <Text className="text-m3-on-surface-variant text-xs mt-0.5">
                  {displayDate(chartDates.startDate)} – {displayDate(chartDates.endDate)}
                </Text>
              </View>
              <Text className="text-m3-on-surface-variant text-xs font-bold">{profile.weight_unit}</Text>
            </View>

            {chartWeights.length === 0 ? (
              <View className="py-5 items-center gap-2">
                <MaterialIcons name="monitor-weight" size={30} color={M3.onSurfaceVariant} />
                <Text className="text-m3-on-surface font-bold text-sm">No weight check-ins in the past year</Text>
                <Text className="text-m3-on-surface-variant text-sm text-center">
                  Log weight to start your trend.
                </Text>
                <Pressable
                  onPress={onOpenWeight}
                  className="min-h-[48px] bg-white rounded-full px-6 mt-2 items-center justify-center active:opacity-80"
                  accessibilityRole="button"
                  accessibilityLabel="Log weight"
                  accessibilityState={{ disabled: false, busy: false }}
                >
                  <Text className="text-m3-on-primary font-bold text-sm">Log Weight</Text>
                </Pressable>
              </View>
            ) : (
              <View className="gap-4">
                <WeightChart
                  logs={chartWeights}
                  startDate={chartDates.startDate}
                  endDate={chartDates.endDate}
                  height={176}
                  showXAxisLabels
                  targetWeightKg={profile.target_weight_kg}
                  unit={profile.weight_unit}
                />
                <WeightChartLegend showGoal={profile.target_weight_kg != null} />
                {latestWeight ? (
                  <View className="gap-3">
                    <View className="flex-row flex-wrap gap-3">
                      <Metric
                        label="Latest trend"
                        value={`${formatWeight(latestWeight.trend_weight_kg, profile.weight_unit)} ${profile.weight_unit}`}
                        detail={trendChange == null ? undefined : `${signedWeight(trendChange, profile.weight_unit)} in this range`}
                      />
                      <Metric
                        label="Latest scale"
                        value={`${formatWeight(latestWeight.scale_weight_kg, profile.weight_unit)} ${profile.weight_unit}`}
                        detail={displayDate(latestWeight.log_date)}
                      />
                    </View>

                    <View className="bg-m3-surface-container-high rounded-2xl p-4 gap-3">
                      <View className="flex-row items-start gap-3">
                        <View className="w-8 h-8 rounded-full bg-m3-expenditure/15 items-center justify-center">
                          <MaterialIcons name="trending-up" size={18} color={M3.expenditure} />
                        </View>
                        <View className="flex-1 min-w-0 gap-0.5">
                          <Text className="text-m3-expenditure font-semibold text-sm">{progress.title}</Text>
                          <Text className="text-m3-on-surface-variant text-xs">{progress.body}</Text>
                        </View>
                      </View>
                      <View className="h-px bg-m3-outline-variant/50" />
                      <View className="flex-row flex-wrap gap-3">
                        <View className="flex-1 min-w-[88px] gap-1">
                          <Text className="text-m3-on-surface-variant text-compact font-semibold">Actual rate</Text>
                          <Text className="text-m3-on-surface text-sm font-bold tabular-nums">
                            {sufficientProgress && weeklyRate != null ? signedRate(weeklyRate, profile.weight_unit) : '—'}
                          </Text>
                          <Text className="text-m3-on-surface-variant text-compact font-medium">
                            {sufficientProgress ? `${endpointSpanDays} days observed` : 'At least 7 days required'}
                          </Text>
                        </View>
                        <View className="flex-1 min-w-[88px] gap-1">
                          <Text className="text-m3-on-surface-variant text-compact font-semibold">Planned rate</Text>
                          <Text className="text-m3-on-surface text-sm font-bold tabular-nums">
                            {signedRate(profile.goal_rate_kg_per_week, profile.weight_unit)}
                          </Text>
                          <Text className="text-m3-on-surface-variant text-compact font-medium">
                            {profile.goal_type === 'maintain' ? 'Maintenance' : profile.goal_type === 'cut' ? 'Weight loss' : 'Weight gain'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className="rounded-2xl bg-m3-surface-container-high px-4 py-3">
                    <Text className="text-m3-on-surface-variant text-sm text-center">
                      No check-ins in this range. Your full history is still available.
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={onOpenWeight}
                  className="min-h-[48px] bg-white rounded-full px-6 items-center justify-center active:opacity-80"
                  accessibilityRole="button"
                  accessibilityLabel="Add weight check-in"
                  accessibilityState={{ disabled: false, busy: false }}
                >
                  <Text className="text-m3-on-primary font-bold text-sm">Add check-in</Text>
                </Pressable>
              </View>
            )}
          </Card>

          <Card className="p-5 gap-4">
            <View>
              <Text className="text-m3-on-surface font-bold text-base">Logging consistency</Text>
              <Text className="text-m3-on-surface-variant text-xs mt-0.5">Last 30 days</Text>
            </View>
            <View className="flex-row gap-4">
              <LoggingHeatmap
                kind="weight"
                loggedDates={weightLoggedDates}
                endDate={data.endDate}
              />
              <View className="w-px bg-m3-outline-variant/50" />
              <LoggingHeatmap
                kind="food"
                loggedDates={foodLoggedDates}
                endDate={data.endDate}
              />
            </View>
          </Card>

          </View>
          <View className={isTwoPane ? 'flex-[2] min-w-0 gap-4' : 'gap-4'}>

          <Card className="p-5 gap-4">
            <View>
              <Text className="text-m3-on-surface font-bold text-base">Energy</Text>
              <Text className="text-m3-on-surface-variant text-xs mt-0.5">
                Logged-day average for the selected range
              </Text>
            </View>
            <View className="bg-m3-surface-container-high rounded-2xl p-4 gap-1">
              <Text className="text-m3-on-surface-variant text-xs font-semibold">Average intake</Text>
              <Text className="text-m3-on-surface text-xl font-bold tabular-nums">
                {averageCalories == null ? '—' : `${Math.round(averageCalories).toLocaleString()} kcal`}
              </Text>
              <Text className="text-m3-on-surface-variant text-compact font-medium">
                {averageCalories == null ? 'No food-logged days' : `${dailyCalories.length} food-logged days`}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-3">
              <Metric label="Current target" value={`${Math.round(target.target_calories).toLocaleString()} kcal`} />
              <Metric label="TDEE estimate" value={`${Math.round(target.tdee_estimate).toLocaleString()} kcal`} />
            </View>
          </Card>

          <Card className="p-5 gap-4">
            <View>
              <Text className="text-m3-on-surface font-bold text-base">Recommendation</Text>
              <Text className="text-m3-on-surface-variant text-xs mt-0.5">Weekly review of logged evidence</Text>
            </View>

            {recommendationError ? (
              <View className="py-3 items-center gap-3">
                <MaterialIcons name="error-outline" size={28} color={M3.error} />
                <Text className="text-m3-on-surface-variant text-sm text-center">
                  Couldn't load your recommendation. Other analytics are still available.
                </Text>
                <Pressable
                  onPress={() => void retryRecommendation()}
                  disabled={recommendationLoading}
                  className={`min-h-[48px] rounded-full px-6 items-center justify-center ${recommendationLoading ? 'bg-m3-surface-container-high opacity-60' : 'bg-white active:opacity-80'}`}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading recommendation"
                  accessibilityState={{ disabled: recommendationLoading, busy: recommendationLoading }}
                >
                  {recommendationLoading ? (
                    <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
                  ) : (
                    <Text className="text-m3-on-primary font-semibold text-sm">Retry</Text>
                  )}
                </Pressable>
              </View>
            ) : recommendation?.kind === 'collecting' ? (
              <View className="gap-3">
                <View className="bg-m3-surface-container-high rounded-2xl p-4 gap-1">
                  <Text className="text-m3-on-surface font-bold text-sm">Collecting data</Text>
                  <Text className="text-m3-on-surface-variant text-xs tabular-nums">
                    {recommendation.eligibility.intakeDayCount} / {recommendation.eligibility.requiredIntakeDayCount} intake days · {recommendation.eligibility.weightLogCount} / {recommendation.eligibility.requiredWeightLogCount} weights
                  </Text>
                </View>
                {recommendation.eligibility.intakeDayCount < recommendation.eligibility.requiredIntakeDayCount ? (
                  <Text className="text-m3-on-surface-variant text-xs">
                    • {recommendation.eligibility.requiredIntakeDayCount - recommendation.eligibility.intakeDayCount} more food-logged days needed
                  </Text>
                ) : null}
                {recommendation.eligibility.weightLogCount < recommendation.eligibility.requiredWeightLogCount ? (
                  <Text className="text-m3-on-surface-variant text-xs">
                    • {recommendation.eligibility.requiredWeightLogCount - recommendation.eligibility.weightLogCount} more weight check-ins needed
                  </Text>
                ) : null}
                {!recommendation.eligibility.hasEarlyWeight ? (
                  <Text className="text-m3-on-surface-variant text-xs">• One weight is needed in the first 4 days of the window</Text>
                ) : null}
                {!recommendation.eligibility.hasLateWeight ? (
                  <Text className="text-m3-on-surface-variant text-xs">• One weight is needed in the final 4 days of the window</Text>
                ) : null}
                {recommendation.eligibility.endpointSpanDays < recommendation.eligibility.requiredEndpointSpanDays ? (
                  <Text className="text-m3-on-surface-variant text-xs tabular-nums">
                    • Check-ins span {recommendation.eligibility.endpointSpanDays} of the required {recommendation.eligibility.requiredEndpointSpanDays} days
                  </Text>
                ) : null}
              </View>
            ) : recommendation?.kind === 'ready' ? (
              <View className="gap-4">
                <View className="gap-1">
                  <Text className="text-m3-on-surface font-bold text-sm">Ready for review</Text>
                  <Text className="text-m3-on-surface-variant text-xs">
                    Analysis window {displayDate(recommendation.review.window_start)} – {displayDate(recommendation.review.window_end)}
                  </Text>
                </View>
                {staleMessage ? (
                  <View className="bg-m3-expenditure/10 border border-m3-expenditure/30 rounded-2xl p-3">
                    <Text className="text-m3-expenditure text-xs font-semibold">
                      Your data changed. Review the updated recommendation, then choose again.
                    </Text>
                  </View>
                ) : null}
                <View className="bg-m3-surface-container-high rounded-2xl p-4 gap-3">
                  <View className="flex-row justify-between items-baseline gap-3">
                    <Text className="text-m3-on-surface-variant text-xs font-semibold">Current</Text>
                    <Text className="text-m3-on-surface text-xl font-bold tabular-nums">
                      {Math.round(recommendation.review.previous_target_calories).toLocaleString()} kcal
                    </Text>
                  </View>
                  <MacroRow
                    protein={recommendation.review.previous_target_protein_g}
                    carbs={recommendation.review.previous_target_carbs_g}
                    fat={recommendation.review.previous_target_fat_g}
                  />
                </View>
                <View className="bg-m3-surface-container-high rounded-2xl p-4 gap-3 border border-m3-expenditure/40">
                  <View className="flex-row justify-between items-baseline gap-3">
                    <Text className="text-m3-expenditure text-xs font-semibold">Proposed</Text>
                    <Text className="text-m3-expenditure text-xl font-bold tabular-nums">
                      {Math.round(recommendation.review.proposed_target_calories).toLocaleString()} kcal
                    </Text>
                  </View>
                  <MacroRow
                    protein={recommendation.review.proposed_target_protein_g}
                    carbs={recommendation.review.proposed_target_carbs_g}
                    fat={recommendation.review.proposed_target_fat_g}
                  />
                </View>
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => void resolveRecommendation('keep')}
                    disabled={resolving !== null}
                    className={`flex-1 min-h-[48px] rounded-full border border-m3-outline-variant/60 items-center justify-center ${resolving !== null ? 'opacity-50' : 'active:opacity-70'}`}
                    accessibilityRole="button"
                    accessibilityLabel="Keep current targets"
                    accessibilityState={{ disabled: resolving !== null, busy: resolving === 'keep' }}
                  >
                    <Text className="text-m3-on-surface font-semibold text-sm">
                      {resolving === 'keep' ? 'Keeping…' : 'Keep Current'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void resolveRecommendation('accept')}
                    disabled={resolving !== null}
                    className={`flex-1 min-h-[48px] rounded-full items-center justify-center ${resolving !== null ? 'bg-m3-surface-container-high opacity-50' : 'bg-white active:opacity-80'}`}
                    accessibilityRole="button"
                    accessibilityLabel="Accept proposed targets"
                    accessibilityState={{ disabled: resolving !== null, busy: resolving === 'accept' }}
                  >
                    <Text className={resolving !== null ? 'text-m3-on-surface-variant font-semibold text-sm' : 'text-m3-on-primary font-semibold text-sm'}>
                      {resolving === 'accept' ? 'Accepting…' : 'Accept'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : recommendation?.kind === 'next-review' ? (
              <View className="gap-3">
                <View className="bg-m3-surface-container-high rounded-2xl p-4 gap-1">
                  <Text className="text-m3-on-surface font-bold text-sm">Next review</Text>
                  <Text className="text-m3-expenditure text-xl font-bold tabular-nums">
                    {displayDate(recommendation.nextReviewDate)}
                  </Text>
                </View>
                <Text className="text-m3-on-surface-variant text-xs">
                  Latest decision: {recommendation.latestDecision.status === 'accepted' ? 'New targets accepted' : 'Current targets kept'} on {displayDate(recommendation.latestDecision.review_date)}.
                </Text>
              </View>
            ) : (
              <ActivityIndicator color={M3.onSurfaceVariant} accessibilityLabel="Loading recommendation" />
            )}
          </Card>
          </View>
          </View>
        </Animated.View>
        </ResponsiveContent>
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(AnalyticsScreen);
