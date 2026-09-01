import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useEntitlement } from '../context/EntitlementContext';

import Card from '../components/Card';
import EnergyChart from '../components/EnergyChart';
import LoggingHeatmap from '../components/LoggingHeatmap';
import MonthlyCalorieCalendar from '../components/MonthlyCalorieCalendar';
import SegmentedControl from '../components/SegmentedControl';
import WeightChart from '../components/WeightChart';
import WeightChartLegend from '../components/WeightChartLegend';
import {
  DailyTarget,
  Profile,
  WeightLog,
  getDailyCaloriesByDateRange,
  getDailyTargetForDate,
  getDailyTargetsByDateRange,
  getFoodLoggedDatesThrough,
  getProfile,
  getWeightLogsByDateRange,
} from '../db/database';
import {
  AdaptiveReviewState,
  acceptAdaptiveReview,
  confirmAdaptiveIntakeDay,
  getAdaptiveReviewState,
  keepAdaptiveReview,
} from '../services/adaptiveReviews';
import { M3 } from '../theme/tokens';
import {
  addCalendarDays,
  addCalendarMonths,
  calendarDaysBetween,
  formatLocalISO,
  formatMonthLabel,
  getMonthGrid,
  getMonthStart,
  parseLocalISO,
  todayISO,
} from '../utils/calendar';
import { computeNormalizedWeeklyRate } from '../utils/weightTrend';
import { formatWeight } from '../utils/weightUnits';
import ResponsiveContent from '../components/ResponsiveContent';
import { APP_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';
import { useToday } from '../hooks/useToday';
import { buildCalorieCalendar, CalorieCalendarMonth } from '../utils/energyHistory';

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
  foodLoggedDates: string[];
  targetHistory: DailyTarget[];
  target: DailyTarget;
  endDate: string;
}

type ProgressKind =
  | 'insufficient'
  | 'on-pace'
  | 'moving-away'
  | 'faster'
  | 'slower'
  | 'outside-maintenance'
  | 'reached';

type AdaptivePauseReason = Extract<AdaptiveReviewState, { kind: 'paused' }>['reason'];

const ADAPTIVE_PAUSE_COPY: Record<AdaptivePauseReason, { title: string; detail: string }> = {
  tdee_floor_conflict: {
    title: 'Plan recalculation needed',
    detail: 'Recalculate your plan in Profile before using adaptive updates.',
  },
  macro_target_infeasible: {
    title: 'No safe macro split could be calculated',
    detail: 'Review your nutrition targets or profile before trying again.',
  },
  target_out_of_policy: {
    title: 'No safe target could be calculated',
    detail: 'Review your profile or consult a qualified professional.',
  },
};

const RANGE_OPTIONS = [
  { value: '1M' as const, label: '1M', accessibilityLabel: '1 month' },
  { value: '3M' as const, label: '3M', accessibilityLabel: '3 months' },
  { value: '6M' as const, label: '6M', accessibilityLabel: '6 months' },
  { value: '1Y' as const, label: '1Y', accessibilityLabel: '1 year' },
];

const RANGE_LABELS: Record<RangeKey, string> = {
  '1M': '1 month',
  '3M': '3 months',
  '6M': '6 months',
  '1Y': '1 year',
};

function rangeDates(range: RangeKey, endDate: string) {
  const months = range === '1M' ? -1 : range === '3M' ? -3 : range === '6M' ? -6 : -12;
  return { startDate: addCalendarDays(addCalendarMonths(endDate, months), 1), endDate };
}

function monthStartISO(dateISO: string): string {
  return formatLocalISO(getMonthStart(parseLocalISO(dateISO)));
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

interface GoalProgress {
  reached: boolean;
  distance: string | null;
  expectedDate: string | null;
}

function goalProgress(
  profile: Profile,
  latestWeight: WeightLog | undefined,
): GoalProgress {
  if (profile.target_weight_kg == null || !latestWeight) {
    return { reached: false, distance: null, expectedDate: null };
  }
  const difference = latestWeight.trend_weight_kg - profile.target_weight_kg;
  const distance = `${formatWeight(Math.abs(difference), profile.weight_unit)} ${profile.weight_unit}`;
  if (profile.goal_type === 'maintain') {
    return { reached: false, distance, expectedDate: null };
  }

  const remainingKg = profile.goal_type === 'cut' ? difference : -difference;
  if (remainingKg <= 0) {
    return { reached: true, distance: `0 ${profile.weight_unit}`, expectedDate: displayDate(latestWeight.log_date) };
  }

  const weeklyRate = Math.abs(profile.goal_rate_kg_per_week);
  if (weeklyRate === 0) {
    return { reached: false, distance, expectedDate: null };
  }

  const daysRemaining = Math.ceil(remainingKg / weeklyRate * 7);
  return {
    reached: false,
    distance,
    expectedDate: displayDate(addCalendarDays(latestWeight.log_date, daysRemaining)),
  };
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

function progressCopy(kind: ProgressKind) {
  switch (kind) {
    case 'insufficient':
      return {
        title: 'More data needed',
        icon: 'hourglass-empty' as const,
        color: M3.onSurfaceVariant,
      };
    case 'on-pace':
      return {
        title: 'On pace',
        icon: 'check-circle-outline' as const,
        color: M3.goalRateSafe,
      };
    case 'moving-away':
      return {
        title: 'Moving away from plan',
        icon: 'warning-amber' as const,
        color: M3.goalRateCaution,
      };
    case 'faster':
      return {
        title: 'Faster than planned',
        icon: 'speed' as const,
        color: M3.goalRateCaution,
      };
    case 'outside-maintenance':
      return {
        title: 'Outside maintenance range',
        icon: 'swap-vert' as const,
        color: M3.goalRateCaution,
      };
    case 'reached':
      return {
        title: 'Goal reached',
        icon: 'flag' as const,
        color: M3.goalRateSafe,
      };
    default:
      return {
        title: 'Slower than planned',
        icon: 'trending-flat' as const,
        color: M3.goalRateCaution,
      };
  }
}

function InlineMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View className="flex-1 min-w-[112px] gap-1">
      <Text className="text-m3-on-surface-variant text-xs font-semibold">{label}</Text>
      <Text className="text-m3-on-surface text-base font-bold tabular-nums">{value}</Text>
      {detail ? <Text className="text-m3-on-surface-variant text-xs">{detail}</Text> : null}
    </View>
  );
}

function EvidenceTile({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? Math.min(100, value / total * 100) : 0;
  return (
    <View className="flex-1 min-w-0 gap-2">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="text-m3-on-surface-variant text-xs font-semibold">{label}</Text>
        <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{value}/{total}</Text>
      </View>
      <View className="h-1 rounded-full bg-m3-surface-container-highest overflow-hidden">
        <View className="h-full rounded-full bg-m3-expenditure" style={{ width: `${percent}%` }} />
      </View>
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
  const today = useToday();
  const navigation = useNavigation<any>();
  const { ensurePaidAccess, hasPaidFeatures, status: entitlementStatus } = useEntitlement();
  const { isNarrow, isTwoPane, horizontalPadding } = useResponsiveLayout();
  const [selectedRange, setSelectedRange] = useState<RangeKey>('1M');
  const [selectedCalorieMonthStart, setSelectedCalorieMonthStart] = useState(() => monthStartISO(todayISO()));
  const [calorieMonth, setCalorieMonth] = useState<CalorieCalendarMonth | null>(null);
  const [calorieMonthLoading, setCalorieMonthLoading] = useState(true);
  const [calorieMonthError, setCalorieMonthError] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [recommendation, setRecommendation] = useState<AdaptiveReviewState | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState(false);
  const [recommendationError, setRecommendationError] = useState(false);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [resolving, setResolving] = useState<'accept' | 'keep' | null>(null);
  const [confirmingIntakeDate, setConfirmingIntakeDate] = useState<string | null>(null);
  const [staleMessage, setStaleMessage] = useState(false);

  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);
  const hasDataRef = useRef(false);
  const selectedRangeRef = useRef<RangeKey>('1M');
  const loadedDateRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const dataVersionRef = useRef(dataVersion);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const selectedCalorieMonthRef = useRef(selectedCalorieMonthStart);
  const calorieMonthRequestRef = useRef(0);
  const calorieMonthGenerationRef = useRef(0);
  const calorieMonthCacheRef = useRef(new Map<string, CalorieCalendarMonth>());
  const calorieMonthLoadPromiseRef = useRef(new Map<string, Promise<CalorieCalendarMonth>>());
  const previousTodayRef = useRef(today);

  selectedCalorieMonthRef.current = selectedCalorieMonthStart;

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const enqueue = useCallback((operation: () => Promise<void>): Promise<void> => {
    const result = operationQueueRef.current.catch(() => undefined).then(operation);
    operationQueueRef.current = result.catch(() => undefined);
    return result;
  }, []);

  const fetchCalorieMonth = useCallback((monthStart: string): Promise<CalorieCalendarMonth> => {
    const normalizedMonthStart = monthStartISO(monthStart);
    const cached = calorieMonthCacheRef.current.get(normalizedMonthStart);
    if (cached) return Promise.resolve(cached);

    const pending = calorieMonthLoadPromiseRef.current.get(normalizedMonthStart);
    if (pending) return pending;

    const cacheGeneration = calorieMonthGenerationRef.current;
    const grid = getMonthGrid(parseLocalISO(normalizedMonthStart));
    const gridStart = formatLocalISO(grid[0][0]);
    const gridEnd = formatLocalISO(grid[grid.length - 1][6]);
    const request = (async () => {
      const initialTarget = await getDailyTargetForDate(gridStart);
      const targetChanges = await getDailyTargetsByDateRange(gridStart, gridEnd);
      const totals = await getDailyCaloriesByDateRange(gridStart, gridEnd);
      const targetHistory = (initialTarget
        ? [initialTarget, ...targetChanges.filter((item) => item.id !== initialTarget.id)]
        : targetChanges
      ).map(({ id, effective_date, target_calories, tdee_estimate }) => ({
        id,
        effective_date,
        target_calories,
        tdee_estimate,
      }));
      const model = buildCalorieCalendar(normalizedMonthStart, todayISO(), totals, targetHistory);
      if (cacheGeneration === calorieMonthGenerationRef.current && mountedRef.current) {
        calorieMonthCacheRef.current.set(normalizedMonthStart, model);
      }
      return model;
    })().finally(() => {
      if (calorieMonthLoadPromiseRef.current.get(normalizedMonthStart) === request) {
        calorieMonthLoadPromiseRef.current.delete(normalizedMonthStart);
      }
    });
    calorieMonthLoadPromiseRef.current.set(normalizedMonthStart, request);
    return request;
  }, []);

  const loadCalorieMonth = useCallback((monthStart: string) => {
    const normalizedMonthStart = monthStartISO(monthStart);
    const requestId = ++calorieMonthRequestRef.current;
    const cached = calorieMonthCacheRef.current.get(normalizedMonthStart);
    if (cached) {
      setCalorieMonth(cached);
      setCalorieMonthError(false);
      setCalorieMonthLoading(false);
      return Promise.resolve();
    }

    setCalorieMonthLoading(true);
    setCalorieMonthError(false);
    return enqueue(async () => {
      try {
        const model = await fetchCalorieMonth(normalizedMonthStart);
        if (!mountedRef.current || requestId !== calorieMonthRequestRef.current) return;
        setCalorieMonth(model);
        setCalorieMonthError(false);
      } catch (error) {
        console.error('[Analytics] calorie calendar load failed', error);
        if (mountedRef.current && requestId === calorieMonthRequestRef.current) {
          setCalorieMonthError(true);
        }
      } finally {
        if (mountedRef.current && requestId === calorieMonthRequestRef.current) {
          setCalorieMonthLoading(false);
        }
      }
    });
  }, [enqueue, fetchCalorieMonth]);

  const invalidateCalorieMonthLoads = useCallback(() => {
    calorieMonthGenerationRef.current += 1;
    calorieMonthRequestRef.current += 1;
    calorieMonthCacheRef.current.clear();
    calorieMonthLoadPromiseRef.current.clear();
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
        const foodLoggedDates = await getFoodLoggedDatesThrough(endDate);
        const targetAtHistoryStart = await getDailyTargetForDate(chartStartDate);
        const targetsInHistory = await getDailyTargetsByDateRange(chartStartDate, endDate);
        const targetHistory = targetAtHistoryStart
          ? [targetAtHistoryStart, ...targetsInHistory.filter((item) => item.id !== targetAtHistoryStart.id)]
          : targetsInHistory;
        const target = await getDailyTargetForDate(endDate);
        if (!target) throw new Error('Daily target is required');

        let nextRecommendation: AdaptiveReviewState | null = null;
        let nextRecommendationError = false;
        try {
          nextRecommendation = hasPaidFeatures ? await getAdaptiveReviewState(endDate) : null;
        } catch (error) {
          console.error('[Analytics] recommendation load failed', error);
          nextRecommendationError = true;
        }

        if (!mountedRef.current || requestId !== requestRef.current) return;
        setData({ profile, chartWeights, dailyCalories, foodLoggedDates, targetHistory, target, endDate });
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
  }, [enqueue, hasPaidFeatures]);

  useFocusEffect(
    useCallback(() => {
      const initial = !initialLoadDoneRef.current && !hasDataRef.current;
      initialLoadDoneRef.current = true;
      const needsDataRefresh = !hasDataRef.current || loadedDateRef.current !== todayISO();
      if (needsDataRefresh) {
        void loadData({ initial });
        void loadCalorieMonth(selectedCalorieMonthRef.current);
      }
    }, [loadCalorieMonth, loadData]),
  );

  useEffect(() => {
    if (dataVersionRef.current === dataVersion) return;
    dataVersionRef.current = dataVersion;
    invalidateCalorieMonthLoads();
    if (initialLoadDoneRef.current) {
      void loadData();
      void loadCalorieMonth(selectedCalorieMonthRef.current);
    }
  }, [dataVersion, invalidateCalorieMonthLoads, loadCalorieMonth, loadData]);

  useEffect(() => {
    const previous = previousTodayRef.current;
    previousTodayRef.current = today;
    if (previous === today) return;
    invalidateCalorieMonthLoads();
    void loadData();
    void loadCalorieMonth(selectedCalorieMonthRef.current);
  }, [invalidateCalorieMonthLoads, loadCalorieMonth, loadData, today]);

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
      progress: progressCopy(progressKind),
      sufficientProgress: progressKind !== 'insufficient',
    };
  }, [data, selectedRange]);

  const handleRangeChange = useCallback((range: RangeKey) => {
    if (range === selectedRangeRef.current) return;
    selectedRangeRef.current = range;
    setSelectedRange(range);
  }, []);

  const shiftCalorieMonth = useCallback((delta: number) => {
    const selected = selectedCalorieMonthRef.current;
    const current = monthStartISO(todayISO());
    if (delta > 0 && selected >= current) return;

    const next = monthStartISO(addCalendarMonths(selected, delta));
    selectedCalorieMonthRef.current = next;
    setSelectedCalorieMonthStart(next);
    setCalorieMonthError(false);
    const cached = calorieMonthCacheRef.current.get(next);
    if (cached) {
      setCalorieMonth(cached);
      setCalorieMonthLoading(false);
      return;
    }

    setCalorieMonthLoading(true);
    void loadCalorieMonth(next);
  }, [loadCalorieMonth]);

  const retryCalorieMonth = useCallback(() => {
    void loadCalorieMonth(selectedCalorieMonthRef.current);
  }, [loadCalorieMonth]);

  const retryRecommendation = useCallback(async () => {
    if (recommendationLoading) return;
    const decision = await ensurePaidAccess();
    if (decision === 'free') {
      navigation.navigate('Paywall');
      return;
    }
    if (decision === 'unavailable') {
      setRecommendationError(true);
      return;
    }
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
  }, [enqueue, ensurePaidAccess, navigation, recommendationLoading]);

  const resolveRecommendation = useCallback(async (action: 'accept' | 'keep') => {
    if (resolving || recommendation?.kind !== 'ready') return;
    const decision = await ensurePaidAccess();
    if (decision === 'free') {
      navigation.navigate('Paywall');
      return;
    }
    if (decision === 'unavailable') {
      setRecommendationError(true);
      return;
    }
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
  }, [enqueue, ensurePaidAccess, navigation, onDataChanged, recommendation, resolving]);

  const confirmIntakeDay = useCallback(async (
    logDate: string,
    status: 'complete' | 'partial' | 'intentional_fast',
  ) => {
    if (confirmingIntakeDate || recommendation?.kind !== 'holding') return;
    const decision = await ensurePaidAccess();
    if (decision === 'free') {
      navigation.navigate('Paywall');
      return;
    }
    if (decision === 'unavailable') {
      setRecommendationError(true);
      return;
    }
    setConfirmingIntakeDate(logDate);
    try {
      await enqueue(async () => {
        const next = await confirmAdaptiveIntakeDay(recommendation.reviewDate, logDate, status);
        if (!mountedRef.current) return;
        setRecommendation(next);
        setRecommendationError(false);
      });
    } catch (error) {
      console.error('[Analytics] intake confirmation failed', error);
      if (mountedRef.current) setRecommendationError(true);
    } finally {
      if (mountedRef.current) setConfirmingIntakeDate(null);
    }
  }, [confirmingIntakeDate, enqueue, ensurePaidAccess, navigation, recommendation]);

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
            Analytics couldn't load. Your data is still on this device.
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
  const foodLoggedDates = data.foodLoggedDates;
  const weightLoggedDates = chartWeights.map((log) => log.log_date);
  const goal = goalProgress(profile, latestWeight);
  const progressDisplay = goal.reached
    ? progressCopy('reached')
    : progress;
  const averageTargetDelta = averageCalories == null
    ? null
    : Math.round(averageCalories - target.target_calories);
  const averageTargetDeltaCopy = averageTargetDelta == null
    ? null
    : averageTargetDelta === 0
      ? 'On target'
      : `${averageTargetDelta > 0 ? '+' : ''}${averageTargetDelta.toLocaleString()} kcal vs target`;
  const recommendationDelta = recommendation?.kind === 'ready'
    ? Math.round(recommendation.review.proposed_target_calories - recommendation.review.previous_target_calories)
    : null;
  const confirmationDay = recommendation?.kind === 'holding'
    && recommendation.reason === 'intake_confirmation_required'
    ? recommendation.confirmationDays[0]
    : undefined;
  const compactPlanLine = recommendationError
    ? 'Plan update unavailable.'
    : recommendation?.kind === 'holding'
      ? recommendation.reason === 'insufficient_evidence'
        ? 'Gathering evidence for your next plan update.'
        : 'Checking recent intake before your next plan update.'
      : recommendation?.kind === 'paused'
        ? `${ADAPTIVE_PAUSE_COPY[recommendation.reason].title}.`
        : recommendation?.kind === 'next-review'
          ? `Next plan check ${displayDate(recommendation.nextReviewDate)}.`
          : null;
  const recommendationCard = entitlementStatus === 'checking' ? (
    <Card className="min-h-[112px] items-center justify-center gap-3">
      <ActivityIndicator color={M3.onSurfaceVariant} />
      <Text accessibilityLiveRegion="polite" className="text-m3-on-surface-variant text-sm">Checking your plan…</Text>
    </Card>
  ) : !hasPaidFeatures ? (
    <Card className="p-5 gap-3">
      <View className="flex-row items-center gap-3">
        <View className="w-10 h-10 rounded-full bg-m3-surface-container-highest items-center justify-center">
          <MaterialIcons name="lock-outline" size={20} color={M3.onSurfaceVariant} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-m3-on-surface font-bold text-base">Adaptive plan</Text>
          <Text className="text-m3-on-surface-variant text-sm">Weekly target updates are included with Manok and Itik.</Text>
        </View>
      </View>
      <Pressable
        onPress={() => navigation.navigate('Paywall')}
        accessibilityRole="button"
        accessibilityLabel="View Eatlog plans"
        className="min-h-[48px] rounded-full bg-white items-center justify-center active:opacity-80"
      >
        <Text className="text-m3-on-primary text-sm font-semibold">View plans</Text>
      </Pressable>
    </Card>
  ) : (
    <Card className="p-5 gap-4">
      {recommendationError ? (
        <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
          <MaterialIcons name="error-outline" size={22} color={M3.error} />
          <Text className="flex-1 text-m3-on-surface font-semibold text-sm">Plan update unavailable</Text>
          <Pressable
            onPress={() => void retryRecommendation()}
            disabled={recommendationLoading}
            className="min-h-[48px] rounded-full px-4 items-center justify-center active:bg-m3-surface-container-high"
            accessibilityRole="button"
            accessibilityLabel="Retry plan update"
            accessibilityState={{ disabled: recommendationLoading, busy: recommendationLoading }}
          >
            {recommendationLoading ? (
              <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
            ) : (
              <Text className="text-m3-on-surface font-semibold text-sm">Retry</Text>
            )}
          </Pressable>
        </View>
      ) : recommendation?.kind === 'holding' && confirmationDay ? (
        <View className="gap-4" accessibilityLiveRegion="polite">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 min-w-0 gap-1">
              <Text className="text-m3-on-surface text-lg font-bold">Quick check</Text>
              <Text className="text-m3-on-surface-variant text-sm tabular-nums">
                {displayDate(confirmationDay.date)} · {Math.round(confirmationDay.calories).toLocaleString()} kcal
              </Text>
            </View>
            {recommendation.confirmationDays.length > 1 ? (
              <View className="rounded-full bg-m3-surface-container-high px-3 py-1.5">
                <Text className="text-m3-on-surface-variant text-xs font-semibold tabular-nums">
                  {recommendation.confirmationDays.length} days left
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-m3-on-surface text-base font-semibold">Was this day fully logged?</Text>
          <View className="gap-2">
            {([
              ['complete', 'Yes, complete'],
              ['partial', 'Only partly'],
              ['intentional_fast', 'I fasted'],
            ] as const).map(([status, label]) => {
              const busy = confirmingIntakeDate === confirmationDay.date;
              return (
                <Pressable
                  key={status}
                  onPress={() => void confirmIntakeDay(confirmationDay.date, status)}
                  disabled={confirmingIntakeDate !== null}
                  className={`min-h-[48px] rounded-full border border-m3-outline-variant/60 px-4 items-center justify-center ${confirmingIntakeDate !== null ? 'opacity-50' : 'bg-m3-surface-container-high active:opacity-70'}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} for ${displayDate(confirmationDay.date)}`}
                  accessibilityState={{ disabled: confirmingIntakeDate !== null, busy }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
                  ) : (
                    <Text className="text-m3-on-surface font-semibold text-sm">{label}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : recommendation?.kind === 'ready' ? (
        <View className="gap-4">
          <View className="flex-row items-center justify-between gap-3" accessibilityLiveRegion="polite">
            <Text className="flex-1 min-w-0 text-m3-on-surface text-lg font-bold">New target ready</Text>
            <View className="rounded-full bg-m3-expenditure/10 px-3 py-1.5">
              <Text className="text-m3-expenditure text-xs font-semibold tabular-nums">
                {recommendationDelta != null && recommendationDelta >= 0 ? '+' : ''}{recommendationDelta} kcal/day
              </Text>
            </View>
          </View>
          {staleMessage ? (
            <Text className="text-m3-expenditure text-sm font-semibold">
              Your data changed. Check the updated target before choosing.
            </Text>
          ) : null}
          <View className="flex-row items-baseline gap-2">
            <Text className="text-m3-on-surface text-3xl font-bold tabular-nums">
              {Math.round(recommendation.review.proposed_target_calories).toLocaleString()}
            </Text>
            <Text className="text-m3-on-surface-variant text-sm font-semibold">kcal/day</Text>
          </View>
          <MacroRow
            protein={recommendation.review.proposed_target_protein_g}
            carbs={recommendation.review.proposed_target_carbs_g}
            fat={recommendation.review.proposed_target_fat_g}
          />
          <View className="h-px bg-m3-outline-variant/50" />
          <View className="flex-row flex-wrap gap-5">
            <InlineMetric
              label="Today’s target"
              value={`${Math.round(recommendation.review.previous_target_calories).toLocaleString()} kcal`}
            />
            <InlineMetric label="Starts" value="Today" detail="Past entries stay unchanged" />
          </View>
          <View className={isNarrow ? 'gap-2' : 'flex-row gap-3'}>
            <Pressable
              onPress={() => void resolveRecommendation('keep')}
              disabled={resolving !== null}
              className={`${isNarrow ? 'w-full' : 'flex-1'} min-h-[48px] rounded-full border border-m3-outline-variant/60 px-3 items-center justify-center ${resolving !== null ? 'opacity-50' : 'active:opacity-70'}`}
              accessibilityRole="button"
              accessibilityLabel="Keep current target"
              accessibilityState={{ disabled: resolving !== null, busy: resolving === 'keep' }}
            >
              <Text className="text-m3-on-surface font-semibold text-sm text-center">
                {resolving === 'keep' ? 'Keeping…' : 'Keep current'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void resolveRecommendation('accept')}
              disabled={resolving !== null}
              className={`${isNarrow ? 'w-full' : 'flex-1'} min-h-[48px] rounded-full px-3 items-center justify-center ${resolving !== null ? 'bg-m3-surface-container-high opacity-50' : 'bg-white active:opacity-80'}`}
              accessibilityRole="button"
              accessibilityLabel="Use new target"
              accessibilityState={{ disabled: resolving !== null, busy: resolving === 'accept' }}
            >
              <Text className={`${resolving !== null ? 'text-m3-on-surface-variant' : 'text-m3-on-primary'} font-semibold text-sm text-center`}>
                {resolving === 'accept' ? 'Updating…' : 'Use new target'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : recommendation?.kind === 'next-review' ? (
        <View className="flex-row items-center gap-3">
          <View className="w-9 h-9 rounded-full bg-m3-expenditure/10 items-center justify-center">
            <MaterialIcons name="event" size={19} color={M3.expenditure} />
          </View>
          <View className="flex-1 min-w-0 gap-0.5">
            <Text className="text-m3-on-surface font-bold text-sm">Next plan check</Text>
            <Text className="text-m3-on-surface-variant text-xs tabular-nums">
              {displayDate(recommendation.nextReviewDate)} · {Math.round(target.target_calories).toLocaleString()} kcal/day
            </Text>
          </View>
        </View>
      ) : (
        <ActivityIndicator color={M3.onSurfaceVariant} accessibilityLabel="Loading adaptive review" />
      )}
    </Card>
  );

  const requestedCalorieMonthLabel = formatMonthLabel(parseLocalISO(selectedCalorieMonthStart));
  const displayedCalorieMonthLabel = calorieMonth
    ? formatMonthLabel(parseLocalISO(calorieMonth.monthStart))
    : requestedCalorieMonthLabel;
  const calorieCalendar = (
    <MonthlyCalorieCalendar
      month={calorieMonth}
      monthLabel={displayedCalorieMonthLabel}
      requestedMonthLabel={requestedCalorieMonthLabel}
      isCurrentMonth={selectedCalorieMonthStart === monthStartISO(today)}
      loading={calorieMonthLoading}
      error={calorieMonthError}
      onPreviousMonth={() => shiftCalorieMonth(-1)}
      onNextMonth={() => shiftCalorieMonth(1)}
      onRetry={retryCalorieMonth}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        disableScrollViewPanResponder
      >
        <ResponsiveContent maxWidth={APP_MAX_WIDTH}>
        <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} className="gap-6">
          <View className="gap-4">
            <Text className="text-m3-on-surface text-2xl font-bold">Analytics</Text>
            <SegmentedControl
              options={RANGE_OPTIONS}
              value={selectedRange}
              onChange={handleRangeChange}
            />
          </View>

          {recommendationCard}
          {compactPlanLine != null ? (
            <Text className="text-m3-on-surface-variant text-sm -mt-3" accessibilityLiveRegion="polite">
              {compactPlanLine}
            </Text>
          ) : null}

          <View className={isTwoPane ? 'flex-row items-start gap-4' : 'gap-4'}>
          <View className={isTwoPane ? 'flex-[3] min-w-0 gap-4' : 'gap-4'}>
          <Card className="p-5 gap-4">
            <Text className="text-m3-on-surface font-bold text-base">Weight trend</Text>

            {chartWeights.length === 0 ? (
              <View className="py-5 items-center gap-3">
                <MaterialIcons name="monitor-weight" size={30} color={M3.onSurfaceVariant} />
                <Text className="text-m3-on-surface font-bold text-sm">No weigh-ins yet</Text>
                <Pressable
                  onPress={onOpenWeight}
                  className="min-h-[48px] bg-white rounded-full px-6 items-center justify-center active:opacity-80"
                  accessibilityRole="button"
                  accessibilityLabel="Log weight"
                >
                  <Text className="text-m3-on-primary font-bold text-sm">Log weight</Text>
                </Pressable>
              </View>
            ) : (
              <View className="gap-4">
                {latestWeight ? (
                  <View className="flex-row flex-wrap gap-5">
                    <InlineMetric
                      label="Trend"
                      value={`${formatWeight(latestWeight.trend_weight_kg, profile.weight_unit)} ${profile.weight_unit}`}
                      detail={trendChange == null ? undefined : signedWeight(trendChange, profile.weight_unit)}
                    />
                    <InlineMetric
                      label="Scale"
                      value={`${formatWeight(latestWeight.scale_weight_kg, profile.weight_unit)} ${profile.weight_unit}`}
                      detail={displayDate(latestWeight.log_date)}
                    />
                  </View>
                ) : null}
                <WeightChart
                  logs={chartWeights}
                  startDate={chartDates.startDate}
                  endDate={chartDates.endDate}
                  height={176}
                  showXAxisLabels
                  targetWeightKg={profile.target_weight_kg}
                  plannedRateKgPerWeek={profile.goal_rate_kg_per_week}
                  planEffectiveDate={target.effective_date}
                  unit={profile.weight_unit}
                />
                <WeightChartLegend
                  showGoal={profile.target_weight_kg != null}
                  showPlan={target.effective_date < chartDates.endDate && latestWeight != null}
                />
                {latestWeight ? (
                  <>
                    <View className="h-px bg-m3-outline-variant/50" />
                    <View className="gap-1">
                      <View className="flex-row items-center gap-2">
                        <MaterialIcons name={progressDisplay.icon} size={19} color={progressDisplay.color} />
                        <Text className="font-semibold text-sm" style={{ color: progressDisplay.color }}>{progressDisplay.title}</Text>
                      </View>
                      {goal.reached ? (
                        <Text className="text-m3-on-surface-variant text-sm">
                          Reached {goal.expectedDate}. Open your plan to set a new goal.
                        </Text>
                      ) : goal.distance != null ? (
                        <Text className="text-m3-on-surface-variant text-sm tabular-nums">
                          {goal.distance} to goal{goal.expectedDate != null ? ` · ${goal.expectedDate} at plan pace` : ''}
                        </Text>
                      ) : null}
                    </View>
                    {goal.reached ? (
                      <Pressable
                        onPress={() => navigation.navigate('Profile', { screen: 'GoalAndRate' })}
                        className="self-start min-h-[48px] rounded-full px-4 flex-row items-center gap-2 active:bg-m3-surface-container-high"
                        accessibilityRole="button"
                        accessibilityLabel="Open goal and rate settings"
                      >
                        <MaterialIcons name="tune" size={18} color={M3.onSurface} />
                        <Text className="text-m3-on-surface text-sm font-semibold">Open plan settings</Text>
                      </Pressable>
                    ) : (
                      <View className="flex-row flex-wrap gap-5">
                        <InlineMetric
                          label="Actual"
                          value={sufficientProgress && weeklyRate != null ? signedRate(weeklyRate, profile.weight_unit) : 'Not enough data'}
                        />
                        <InlineMetric
                          label="Plan"
                          value={signedRate(profile.goal_rate_kg_per_week, profile.weight_unit)}
                        />
                      </View>
                    )}
                  </>
                ) : (
                  <Text className="text-m3-on-surface-variant text-sm text-center">No weigh-ins in this range.</Text>
                )}
                <Pressable
                  onPress={onOpenWeight}
                  className="min-h-[48px] bg-white rounded-full px-6 items-center justify-center active:opacity-80"
                  accessibilityRole="button"
                  accessibilityLabel="Add weight check-in"
                >
                  <Text className="text-m3-on-primary font-bold text-sm">Add weigh-in</Text>
                </Pressable>
              </View>
            )}
          </Card>

          </View>
          <View className={isTwoPane ? 'flex-[2] min-w-0 gap-4' : 'gap-4'}>

          <Card className="p-5 gap-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 min-w-0 gap-0.5">
                <Text className="text-m3-on-surface font-bold text-base">Calories</Text>
                <Text className="text-m3-on-surface-variant text-xs">Trend period · {RANGE_LABELS[selectedRange]}</Text>
              </View>
              {averageTargetDeltaCopy ? (
                <View className="rounded-full bg-m3-calories/10 px-3 py-1.5">
                  <Text className="text-m3-calories text-xs font-semibold tabular-nums" numberOfLines={1}>
                    {averageTargetDeltaCopy}
                  </Text>
                </View>
              ) : null}
            </View>
            <View className="flex-row flex-wrap gap-5">
              <InlineMetric
                label="Average intake"
                value={averageCalories == null ? '—' : `${Math.round(averageCalories).toLocaleString()} kcal`}
                detail="Logged days only"
              />
              <InlineMetric label="Target" value={`${Math.round(target.target_calories).toLocaleString()} kcal`} />
              <InlineMetric
                label="TDEE"
                value={`${Math.round(target.tdee_estimate).toLocaleString()} kcal`}
              />
            </View>
            {dailyCalories.length === 0 ? (
              <View className="py-6 items-center gap-2">
                <MaterialIcons name="restaurant" size={28} color={M3.onSurfaceVariant} />
                <Text className="text-m3-on-surface font-bold text-sm">No food logged in this range</Text>
                <Text className="text-m3-on-surface-variant text-sm">Log a meal to start your intake trend.</Text>
              </View>
            ) : (
              <EnergyChart
                range={selectedRange}
                startDate={chartDates.startDate}
                endDate={chartDates.endDate}
                dailyCalories={data.dailyCalories}
                targetHistory={data.targetHistory}
                height={176}
              />
            )}
            </Card>
            <Card className="p-5">
              {calorieCalendar}
            </Card>

          </View>
          </View>
          <Card className="p-5 gap-3">
            <View>
              <Text className="text-m3-on-surface font-bold text-base">Logging consistency</Text>
              <Text className="text-m3-on-surface-variant text-xs mt-0.5">Last 30 days</Text>
            </View>
            <View className="flex-row gap-4">
              <LoggingHeatmap kind="weight" loggedDates={weightLoggedDates} endDate={data.endDate} />
              <View className="w-px bg-m3-outline-variant/50" />
              <LoggingHeatmap kind="food" loggedDates={foodLoggedDates} endDate={data.endDate} />
            </View>
          </Card>
        </Animated.View>
        </ResponsiveContent>
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(AnalyticsScreen);
