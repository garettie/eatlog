import React, { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  getFoodLogsByDate,
  getFoodLogsByDateRange,
  getDailyTargetForDate,
  getDailyTargetsByDateRange,
  getMealsByIds,
  updateFoodLog,
  deleteFoodLog,
  deleteMeal,
  insertFoodLog,
  insertMeal,
  FoodLog,
  DailyTarget,
  DayMacros,
  MealType,
  MealRow,
} from '../db/database';
import { todayISO, isoFromDate, getMonthStart, getMonthDates, isToday, isFuture, formatDayHeader, formatMonthLabel } from '../utils/calendar';
import { useToday } from '../hooks/useToday';
import { M3 } from '../theme/tokens';
import WeekStrip from '../components/WeekStrip';
import { warmMealPhotoThumbnails } from '../utils/mealPhotoThumbnails';
import MacroRail from '../components/MacroRail';
import { JournalEntryKind, JournalEntryRow, JournalSectionHeader, MealGroup } from '../components/JournalSection';
import DiaryEditSheet, { portionRatio } from '../components/DiaryEditSheet';
import { DURATION, EASING } from '../theme/motion';
import ResponsiveContent from '../components/ResponsiveContent';
import { READING_MAX_WIDTH } from '../theme/layout';
import {
  buildMealShareData,
  type MealShareData,
} from '../utils/shareCards';

/** How far day content travels along the time axis when the selected day changes. */
const DAY_SHIFT = 24;

const MEAL_ORDER: { meal: MealType; label: string }[] = [
  { meal: 'breakfast', label: 'Breakfast' },
  { meal: 'lunch', label: 'Lunch' },
  { meal: 'snack', label: 'Snack' },
  { meal: 'dinner', label: 'Dinner' },
];

interface EditState {
  food: FoodLog | null;
  saving: boolean;
}

interface MonthSummary {
  macros: DayMacros[];
  targets: Map<string, DailyTarget>;
}

interface DaySummary {
  foodLogs: FoodLog[];
  mealRows: Map<number, MealRow>;
}

interface JournalSectionModel {
  meal: MealType;
  label: string;
  entries: JournalEntryKind[];
  totalCalories: number;
}

type DiaryListItem =
  | { kind: 'section'; key: string; section: JournalSectionModel }
  | { kind: 'entry'; key: string; entry: JournalEntryKind; sectionMeal: MealType };

function getMonthRange(anchor: Date) {
  const dates = getMonthDates(anchor);
  const startISO = isoFromDate(dates[0]);
  const endISO = isoFromDate(dates[dates.length - 1]);
  return {
    dates,
    startISO,
    endISO,
    key: `${startISO}:${endISO}`,
  };
}

interface DiaryScreenProps {
  requestedDate?: { date: string; requestId: number };
  onOpenEntry: (logDate?: string) => void;
  onEditMeal: (meal: MealGroup) => void;
  onSelectedDateChange: (date: string) => void;
  onDataChanged: () => void;
  dataVersion: number;
  showToast: (message: string, undo?: () => void) => void;
  onShare: (meal: MealShareData) => void;
  onEditSheetVisibilityChange: (visible: boolean) => void;
}

function DiaryScreen({ requestedDate, onOpenEntry, onEditMeal, onSelectedDateChange, onDataChanged, dataVersion, showToast, onShare, onEditSheetVisibilityChange }: DiaryScreenProps) {
  const reduced = useReducedMotion();
  const today = useToday();
  const initialDateRef = useRef(requestedDate?.date ?? todayISO());
  const [selectedDate, setSelectedDate] = useState(() => initialDateRef.current);
  const [displayedDate, setDisplayedDate] = useState(() => initialDateRef.current);
  const [monthAnchor, setMonthAnchor] = useState(() => getMonthStart(new Date(`${initialDateRef.current}T12:00:00`)));
  const [loading, setLoading] = useState(true);
  const [dayLoadError, setDayLoadError] = useState(false);
  const [monthLoadError, setMonthLoadError] = useState(false);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [dayTargetMap, setDayTargetMap] = useState<Map<string, DailyTarget>>(new Map());
  const [monthMacros, setMonthMacros] = useState<DayMacros[]>([]);
  const [mealRows, setMealRows] = useState<Map<number, MealRow>>(new Map());
  const [edit, setEdit] = useState<EditState>({ food: null, saving: false });
  useEffect(() => () => {
    onEditSheetVisibilityChange(false);
  }, [onEditSheetVisibilityChange]);
  const [collapsedSections, setCollapsedSections] = useState<Set<MealType>>(new Set());
  const [refreshCount, setRefreshCount] = useState(0);
  const initialLoadDone = useRef(false);
  const loadingGenerationRef = useRef(0);
  const loadingRef = useRef(loading);
  const selectedDateRef = useRef(selectedDate);
  const monthAnchorRef = useRef(monthAnchor);
  loadingRef.current = loading;
  selectedDateRef.current = selectedDate;
  monthAnchorRef.current = monthAnchor;
  const dayRequestRef = useRef(0);
  const monthRequestRef = useRef(0);
  const dayCacheRef = useRef(new Map<string, DaySummary>());
  const monthCacheRef = useRef(new Map<string, MonthSummary>());
  const monthLoadPromiseRef = useRef(new Map<string, Promise<MonthSummary>>());
  const cacheGenerationRef = useRef(0);
  const previousDisplayedDateRef = useRef(displayedDate);
  const handledDateRequestRef = useRef<number | null>(requestedDate?.requestId ?? null);
  const dayContentOpacity = useSharedValue(1);
  const dayContentOffset = useSharedValue(0);
  // Day changes move along the calendar's time axis: the old day leaves toward the past or future,
  // the new day's content is swapped in while invisible, then enters from the side it lives on.
  const dayDirectionRef = useRef(1);
  const dayExitingRef = useRef(false);
  const dayEnterPendingRef = useRef(false);
  const pendingDayRef = useRef<{ date: string; summary: DaySummary } | null>(null);

  const commitDay = useCallback((date: string, summary: DaySummary) => {
    setFoodLogs(summary.foodLogs);
    setMealRows(summary.mealRows);
    setDisplayedDate(date);
    setDayLoadError(false);
  }, []);

  const enterDay = useCallback(() => {
    dayEnterPendingRef.current = false;
    dayContentOffset.value = DAY_SHIFT * dayDirectionRef.current;
    dayContentOffset.value = withTiming(0, {
      duration: DURATION.medium,
      easing: EASING.emphasizedDecelerate,
    });
    dayContentOpacity.value = withTiming(1, {
      duration: DURATION.enter,
      easing: EASING.emphasizedDecelerate,
    });
  }, [dayContentOffset, dayContentOpacity]);

  const finishDayExit = useCallback(() => {
    dayExitingRef.current = false;
    const pending = pendingDayRef.current;
    pendingDayRef.current = null;
    dayEnterPendingRef.current = true;
    if (!pending) return; // The day is still loading; it enters when it arrives.
    if (pending.date === previousDisplayedDateRef.current) {
      commitDay(pending.date, pending.summary);
      enterDay();
      return;
    }
    commitDay(pending.date, pending.summary);
  }, [commitDay, enterDay]);

  const beginDayExit = useCallback((direction: number) => {
    dayDirectionRef.current = direction;
    if (reduced) return;
    dayExitingRef.current = true;
    const exit = { duration: DURATION.exit, easing: EASING.emphasizedAccelerate };
    dayContentOffset.value = withTiming(-DAY_SHIFT * direction, exit);
    dayContentOpacity.value = withTiming(0, exit, (finished) => {
      if (finished) runOnJS(finishDayExit)();
    });
  }, [dayContentOffset, dayContentOpacity, finishDayExit, reduced]);

  // Runs after the new day commits and before it paints, so the entrance never starts on old content.
  useLayoutEffect(() => {
    if (previousDisplayedDateRef.current === displayedDate) return;
    previousDisplayedDateRef.current = displayedDate;
    if (!reduced && dayEnterPendingRef.current) {
      enterDay();
      return;
    }
    dayContentOpacity.value = 1;
    dayContentOffset.value = 0;
  }, [dayContentOffset, dayContentOpacity, displayedDate, enterDay, reduced]);

  useEffect(() => {
    // A failed load still has to be visible, even mid-transition.
    if (!dayLoadError) return;
    dayExitingRef.current = false;
    dayEnterPendingRef.current = false;
    pendingDayRef.current = null;
    dayContentOpacity.value = 1;
    dayContentOffset.value = 0;
  }, [dayContentOffset, dayContentOpacity, dayLoadError]);

  const dayContentStyle = useAnimatedStyle(() => ({
    opacity: dayContentOpacity.value,
    transform: [{ translateX: dayContentOffset.value }],
  }));

  const applyDaySummary = useCallback((date: string, summary: DaySummary) => {
    if (dayExitingRef.current) {
      pendingDayRef.current = { date, summary };
      return;
    }
    if (dayEnterPendingRef.current && date === previousDisplayedDateRef.current) {
      commitDay(date, summary);
      enterDay();
      return;
    }
    commitDay(date, summary);
  }, [commitDay, enterDay]);

  const loadDay = useCallback((date: string, showLoading = false) => {
    const requestId = ++dayRequestRef.current;
    if (showLoading) setLoading(true);
    const cached = dayCacheRef.current.get(date);
    if (cached) {
      applyDaySummary(date, cached);
      if (showLoading) setLoading(false);
      return Promise.resolve();
    }
    const dateAnchor = getMonthStart(new Date(`${date}T12:00:00`));
    const pendingMonth = monthLoadPromiseRef.current.get(getMonthRange(dateAnchor).key);

    return (async () => {
      if (requestId !== dayRequestRef.current) return;
      try {
        if (pendingMonth) {
          await pendingMonth.catch(() => undefined);
          if (requestId !== dayRequestRef.current) return;
          const warmed = dayCacheRef.current.get(date);
          if (warmed) {
            applyDaySummary(date, warmed);
            return;
          }
        }

        const logs = await getFoodLogsByDate(date);
        if (requestId !== dayRequestRef.current) return;
        const mealIds = [...new Set(logs.filter((log) => log.meal_id != null).map((log) => log.meal_id!))];
        const meals = await getMealsByIds(mealIds);
        if (requestId !== dayRequestRef.current) return;
        const nextMealRows = new Map<number, MealRow>();
        meals.forEach((meal) => nextMealRows.set(meal.id, meal));
        const summary = { foodLogs: logs, mealRows: nextMealRows };
        dayCacheRef.current.set(date, summary);
        applyDaySummary(date, summary);
      } catch (error) {
        console.error('[Diary] day load failed', error);
        if (requestId === dayRequestRef.current) {
          setDayLoadError(true);
        }
      } finally {
        if (showLoading && requestId === dayRequestRef.current) setLoading(false);
      }
    })();
  }, [applyDaySummary]);

  const fetchMonth = useCallback((anchor: Date): Promise<MonthSummary> => {
    const cacheGeneration = cacheGenerationRef.current;
    const { dates: monthDates, startISO, endISO, key: monthKey } = getMonthRange(anchor);
    const cached = monthCacheRef.current.get(monthKey);
    if (cached) return Promise.resolve(cached);

    const pending = monthLoadPromiseRef.current.get(monthKey);
    if (pending) return pending;

    const request = (async () => {
        const [initialTarget, targetChanges, logs] = await Promise.all([
          getDailyTargetForDate(startISO),
          getDailyTargetsByDateRange(startISO, endISO),
          getFoodLogsByDateRange(startISO, endISO),
        ]);

        let activeTarget = initialTarget;
        let targetIndex = 0;
        const targetMap = new Map<string, DailyTarget>();
        for (const day of monthDates) {
          const dayISO = isoFromDate(day);
          while (
            targetIndex < targetChanges.length
            && targetChanges[targetIndex].effective_date <= dayISO
          ) {
            activeTarget = targetChanges[targetIndex];
            targetIndex += 1;
          }
          if (activeTarget) targetMap.set(dayISO, activeTarget);
        }

        const mealIds = [...new Set(logs.flatMap((log) => log.meal_id == null ? [] : [log.meal_id]))];
        const meals = await getMealsByIds(mealIds);

        const allMealRows = new Map<number, MealRow>();
        meals.forEach((meal) => allMealRows.set(meal.id, meal));
        // Build rail thumbnails ahead of the days the user is about to open.
        warmMealPhotoThumbnails(meals.map((meal) => meal.photo_uri));
        const logsByDate = new Map<string, FoodLog[]>();
        const macrosByDate = new Map<string, DayMacros>();
        for (const log of logs) {
          const dayLogs = logsByDate.get(log.log_date) ?? [];
          dayLogs.push(log);
          logsByDate.set(log.log_date, dayLogs);

          const totals = macrosByDate.get(log.log_date) ?? {
            log_date: log.log_date,
            calories: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
          };
          totals.calories += log.calories;
          totals.protein_g += log.protein_g;
          totals.carbs_g += log.carbs_g;
          totals.fat_g += log.fat_g;
          macrosByDate.set(log.log_date, totals);
        }
        if (cacheGeneration === cacheGenerationRef.current) {
          for (const day of monthDates) {
            const dayISO = isoFromDate(day);
            const dayLogs = logsByDate.get(dayISO) ?? [];
            const dayMeals = new Map<number, MealRow>();
            for (const log of dayLogs) {
              if (log.meal_id != null) {
                const meal = allMealRows.get(log.meal_id);
                if (meal) dayMeals.set(meal.id, meal);
              }
            }
            dayCacheRef.current.set(dayISO, { foodLogs: dayLogs, mealRows: dayMeals });
          }
        }

        const summary = { macros: [...macrosByDate.values()], targets: targetMap };
        if (cacheGeneration === cacheGenerationRef.current) {
          monthCacheRef.current.set(monthKey, summary);
        }
        return summary;
    })().finally(() => {
      if (monthLoadPromiseRef.current.get(monthKey) === request) {
        monthLoadPromiseRef.current.delete(monthKey);
      }
    });
    monthLoadPromiseRef.current.set(monthKey, request);
    return request;
  }, []);

  const prefetchAdjacentMonths = useCallback((anchor: Date) => {
    const previous = new Date(anchor);
    previous.setMonth(previous.getMonth() - 1);
    void fetchMonth(previous).catch(() => undefined);

    const next = new Date(anchor);
    next.setMonth(next.getMonth() + 1);
    if (next.getTime() <= getMonthStart(new Date()).getTime()) {
      void fetchMonth(next).catch(() => undefined);
    }
  }, [fetchMonth]);

  const loadMonth = useCallback((anchor: Date) => {
    const requestId = ++monthRequestRef.current;
    return fetchMonth(anchor)
      .then((summary) => {
        if (requestId !== monthRequestRef.current) return;
        setMonthMacros(summary.macros);
        setDayTargetMap(summary.targets);
        setMonthLoadError(false);
        prefetchAdjacentMonths(anchor);
      })
      .catch((error) => {
        console.error('[Diary] month load failed', error);
        if (requestId === monthRequestRef.current) setMonthLoadError(true);
      });
  }, [fetchMonth, prefetchAdjacentMonths]);

  const loadDayAndMonth = useCallback((date: string, anchor: Date, showLoading: boolean) => {
    const generation = ++loadingGenerationRef.current;
    if (showLoading) setLoading(true);
    setDayLoadError(false);
    setMonthLoadError(false);
    void Promise.all([loadDay(date), loadMonth(anchor)]).finally(() => {
      if (generation === loadingGenerationRef.current && (showLoading || loadingRef.current)) {
        setLoading(false);
      }
    });
  }, [loadDay, loadMonth]);

  useFocusEffect(
    useCallback(() => {
      const isInitial = !initialLoadDone.current;
      initialLoadDone.current = true;
      loadDayAndMonth(selectedDateRef.current, monthAnchorRef.current, isInitial);
    }, [refreshCount, loadDayAndMonth]),
  );

  const retryLoads = useCallback(() => {
    loadDayAndMonth(selectedDate, monthAnchor, true);
  }, [loadDayAndMonth, monthAnchor, selectedDate]);

  const retryMonth = useCallback(() => {
    setMonthLoadError(false);
    void loadMonth(monthAnchor);
  }, [loadMonth, monthAnchor]);

  useEffect(() => {
    if (dataVersion > 0) {
      cacheGenerationRef.current += 1;
      dayCacheRef.current.clear();
      monthCacheRef.current.clear();
      monthLoadPromiseRef.current.clear();
      dayRequestRef.current += 1;
      monthRequestRef.current += 1;
      setRefreshCount((count) => count + 1);
    }
  }, [dataVersion]);

  const monthDates = useMemo(() => getMonthDates(monthAnchor), [monthAnchor]);
  const monthMacroMap = useMemo(
    () => new Map(monthMacros.map((macros) => [macros.log_date, macros])),
    [monthMacros],
  );

  const dayCells = useMemo(() => monthDates.map((d) => {
      const iso = isoFromDate(d);
      const macros = monthMacroMap.get(iso);
      const target = dayTargetMap.get(iso);
      return {
        date: d,
        isoDate: iso,
        dayNumber: d.getDate(),
        dayLetter: ['S','M','T','W','T','F','S'][d.getDay()],
        isToday: isToday(d),
        isFuture: isFuture(d),
        calories: macros?.calories ?? 0,
        targetCalories: target?.target_calories ?? 0,
      };
    }), [dayTargetMap, monthDates, monthMacroMap, today]);

  const selectDate = useCallback((iso: string) => {
    if (iso === selectedDateRef.current) return;
    const previousSelected = selectedDateRef.current;
    selectedDateRef.current = iso;

    beginDayExit(iso > previousSelected ? 1 : -1);
    onSelectedDateChange(iso);
    setSelectedDate(iso);
    startTransition(() => {
      void loadDay(iso);
    });

    const d = new Date(iso + 'T12:00:00');
    const monthStart = getMonthStart(d);
    if (monthStart.getTime() !== monthAnchorRef.current.getTime()) {
      monthAnchorRef.current = monthStart;
      setMonthLoadError(false);
      setMonthAnchor(monthStart);
      const cachedMonth = monthCacheRef.current.get(getMonthRange(monthStart).key);
      if (cachedMonth) {
        setMonthMacros(cachedMonth.macros);
        setDayTargetMap(cachedMonth.targets);
        prefetchAdjacentMonths(monthStart);
      } else {
        void loadMonth(monthStart);
      }
    }
  }, [beginDayExit, loadDay, loadMonth, onSelectedDateChange, prefetchAdjacentMonths]);

  // The month chevrons move the selection too, so the strip and the journal always show the same
  // month: today when that month holds it, otherwise its latest logged day, otherwise its edge.
  const dayForMonth = useCallback((anchor: Date, summary: MonthSummary | undefined) => {
    const { startISO, endISO } = getMonthRange(anchor);
    const todayIso = todayISO();
    if (todayIso >= startISO && todayIso <= endISO) return todayIso;
    const logged = (summary?.macros ?? [])
      .filter((day) => day.calories > 0)
      .map((day) => day.log_date)
      .sort();
    if (logged.length > 0) return logged[logged.length - 1];
    return startISO > todayIso ? startISO : endISO;
  }, []);

  const shiftMonth = useCallback((delta: number) => {
    const next = new Date(monthAnchorRef.current);
    next.setMonth(next.getMonth() + delta);

    const cached = monthCacheRef.current.get(getMonthRange(next).key);
    if (cached) {
      selectDate(dayForMonth(next, cached));
      return;
    }

    // Uncached: show the month at once, then select its day when the month's logs arrive.
    monthAnchorRef.current = next;
    setMonthLoadError(false);
    setMonthAnchor(next);
    void loadMonth(next).then(() => {
      if (monthAnchorRef.current.getTime() !== next.getTime()) return;
      selectDate(dayForMonth(next, monthCacheRef.current.get(getMonthRange(next).key)));
    });
  }, [dayForMonth, loadMonth, selectDate]);

  const prevMonth = useCallback(() => shiftMonth(-1), [shiftMonth]);
  const nextMonth = useCallback(() => shiftMonth(1), [shiftMonth]);

  useEffect(() => {
    if (!requestedDate || handledDateRequestRef.current === requestedDate.requestId) return;
    handledDateRequestRef.current = requestedDate.requestId;
    selectDate(requestedDate.date);
  }, [requestedDate, selectDate]);

  const previousTodayRef = useRef(today);
  useEffect(() => {
    const previous = previousTodayRef.current;
    previousTodayRef.current = today;
    if (today === previous) return;
    if (selectedDateRef.current === previous) {
      selectDate(today);
    }
  }, [selectDate, today]);

  useEffect(() => {
    onSelectedDateChange(selectedDate);
  }, [onSelectedDateChange, selectedDate]);

  const todayTarget = dayTargetMap.get(displayedDate);
  const targetCalories = todayTarget?.target_calories ?? 0;
  const targetProtein = todayTarget?.target_protein_g ?? 0;
  const targetCarbs = todayTarget?.target_carbs_g ?? 0;
  const targetFat = todayTarget?.target_fat_g ?? 0;

  const consumedCals = foodLogs.reduce((s, l) => s + l.calories, 0);
  const consumedProtein = foodLogs.reduce((s, l) => s + l.protein_g, 0);
  const consumedCarbs = foodLogs.reduce((s, l) => s + l.carbs_g, 0);
  const consumedFat = foodLogs.reduce((s, l) => s + l.fat_g, 0);

  const macroCells = useMemo(() => [
    { icon: 'local-fire-department', consumed: consumedCals, target: targetCalories, barColor: M3.calories, unit: 'kcal' as const },
    { letter: 'P', consumed: consumedProtein, target: targetProtein, barColor: M3.protein, unit: 'g' as const },
    { letter: 'C', consumed: consumedCarbs, target: targetCarbs, barColor: M3.carbs, unit: 'g' as const },
    { letter: 'F', consumed: consumedFat, target: targetFat, barColor: M3.fat, unit: 'g' as const },
  ], [
    consumedCals,
    consumedCarbs,
    consumedFat,
    consumedProtein,
    targetCalories,
    targetCarbs,
    targetFat,
    targetProtein,
  ]);

  const journalSections = useMemo(() => {
    const componentsByMealId = new Map<number, FoodLog[]>();
    for (const log of foodLogs) {
      if (log.meal_id == null) continue;
      const components = componentsByMealId.get(log.meal_id) ?? [];
      components.push(log);
      componentsByMealId.set(log.meal_id, components);
    }

    return MEAL_ORDER.map(({ meal, label }) => {
    const sectionLogs = foodLogs.filter((l) => l.meal === meal);
    const entries: JournalEntryKind[] = [];
    const seenMealIds = new Set<number>();
    for (const log of sectionLogs) {
      if (log.meal_id == null) {
        entries.push({ type: 'food', foodLog: log });
      } else if (!seenMealIds.has(log.meal_id)) {
        seenMealIds.add(log.meal_id);
        const components = componentsByMealId.get(log.meal_id) ?? [];
        const mealRow = mealRows.get(log.meal_id);
        entries.push({
          type: 'meal',
          mealGroup: {
            id: log.meal_id,
            name: mealRow?.name ?? 'Meal',
            photoUri: mealRow?.photo_uri ?? null,
            createdAt: mealRow?.created_at ?? log.logged_at,
            components,
          },
        });
      }
    }

    const sectionCals = sectionLogs.reduce((s, l) => s + l.calories, 0);

    return {
      meal,
      label,
      entries,
      totalCalories: sectionCals,
    };
    });
  }, [foodLogs, mealRows]);

  const journalListItems = useMemo<DiaryListItem[]>(() => {
    const items: DiaryListItem[] = [];
    for (const section of journalSections) {
      items.push({ kind: 'section', key: `section-${section.meal}`, section });
      if (collapsedSections.has(section.meal)) continue;
      // Positional keys: switching days reuses the mounted cards (and their Swipeables, which reset
      // by identity) instead of unmounting every row and mounting the new day's mid-transition.
      const typeCounts = { food: 0, meal: 0 };
      for (const entry of section.entries) {
        const key = `${section.meal}-${entry.type}-${typeCounts[entry.type]++}`;
        items.push({ kind: 'entry', key, entry, sectionMeal: section.meal });
      }
    }
    return items;
  }, [collapsedSections, journalSections]);

  const handleEditFood = useCallback((food: FoodLog) => {
    onEditSheetVisibilityChange(true);
    setEdit({ food, saving: false });
  }, [onEditSheetVisibilityChange]);

  const handleEditMeal = useCallback((meal: MealGroup) => {
    onEditMeal(meal);
  }, [onEditMeal]);

  const buildMealPayload = useCallback((meal: MealGroup) => {
    const logDate = meal.components[0]?.log_date ?? displayedDate;
    return buildMealShareData(meal, dayTargetMap.get(logDate) ?? null);
  }, [dayTargetMap, displayedDate]);

  const handleShareMeal = useCallback((meal: MealGroup) => {
    const payload = buildMealPayload(meal);
    if (!payload) return;
    onShare(payload);
  }, [buildMealPayload, onShare]);

  const toggleSection = useCallback((meal: MealType) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(meal)) next.delete(meal);
      else next.add(meal);
      return next;
    });
  }, []);

  const diaryListHeader = useMemo(() => (
    <View className="min-h-[48px] justify-center px-4 pb-1">
      <Text className="text-m3-on-surface text-sm font-bold">{formatDayHeader(displayedDate)}</Text>
    </View>
  ), [displayedDate]);

  const emptyDiaryState = foodLogs.length === 0 ? (
    <View className="mx-4 my-4 py-7 items-center gap-3 rounded-3xl bg-m3-surface-container border border-m3-outline-variant/30">
      <View className="w-11 h-11 rounded-full bg-m3-surface-container-high items-center justify-center">
        <MaterialIcons name="restaurant" size={20} color={M3.onSurfaceVariant} />
      </View>
      <View className="items-center gap-1 px-6">
        <Text className="text-m3-on-surface text-sm font-semibold">Nothing logged yet</Text>
        <Text className="text-m3-on-surface-variant text-sm text-center">Add an entry when you're ready.</Text>
      </View>
      <Pressable
        onPress={() => onOpenEntry(selectedDate)}
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        accessibilityHint="Opens food logging options"
        className="min-h-[48px] px-5 rounded-full bg-white items-center justify-center active:opacity-80"
      >
        <Text className="text-m3-on-primary text-sm font-semibold">Add entry</Text>
      </Pressable>
    </View>
  ) : null;

  const handleDeleteFood = useCallback(async (food: FoodLog) => {
    try {
      await deleteFoodLog(food.id);
      dayCacheRef.current.clear();
      monthCacheRef.current.clear();
      onDataChanged();
      showToast(`Deleted ${food.name}`, () => {
        insertFoodLog({
          log_date: food.log_date,
          name: food.name,
          source: food.source as 'usda' | 'off' | 'manual' | 'scan' | 'describe',
          source_food_id: food.source_food_id,
          meal: food.meal,
          meal_id: food.meal_id,
          brand: food.brand,
          data_type: food.data_type,
          preparation: food.preparation,
          grams_logged: food.grams_logged,
          serving_size_g: food.serving_size_g,
          serving_label: food.serving_label,
          calories_per_100g: food.calories_per_100g,
          protein_g_per_100g: food.protein_g_per_100g,
          carbs_g_per_100g: food.carbs_g_per_100g,
          fat_g_per_100g: food.fat_g_per_100g,
          calories: food.calories,
          protein_g: food.protein_g,
          carbs_g: food.carbs_g,
          fat_g: food.fat_g,
        })
          .then(() => {
            dayCacheRef.current.clear();
            monthCacheRef.current.clear();
            onDataChanged();
          })
          .catch((e) => console.error('[Diary] undo delete failed', e));
      });
    } catch (e) {
      console.error('[Diary] deleteFoodLog failed', e);
      Alert.alert('Delete failed', 'The entry could not be deleted. Please try again.');
    }
  }, [onDataChanged, showToast]);

  const handleDeleteMeal = useCallback(async (mealId: number) => {
    const mealRow = mealRows.get(mealId);
    const components = foodLogs.filter((l) => l.meal_id === mealId);
    const mealName = mealRow?.name ?? 'Meal';
    try {
      await deleteMeal(mealId);
      dayCacheRef.current.clear();
      monthCacheRef.current.clear();
      onDataChanged();
      showToast(`Deleted ${mealName}`, () => {
        (async () => {
          const newMealId = await insertMeal({
            name: mealName,
            log_date: mealRow?.log_date ?? selectedDate,
            meal_type: mealRow?.meal_type ?? components[0]?.meal ?? 'snack',
          });
          for (const c of components) {
            await insertFoodLog({
              log_date: c.log_date,
              name: c.name,
              source: c.source as 'usda' | 'off' | 'manual' | 'scan' | 'describe',
              source_food_id: c.source_food_id,
              meal: c.meal,
              meal_id: newMealId,
              brand: c.brand,
              data_type: c.data_type,
              preparation: c.preparation,
              grams_logged: c.grams_logged,
              serving_size_g: c.serving_size_g,
              serving_label: c.serving_label,
              calories_per_100g: c.calories_per_100g,
              protein_g_per_100g: c.protein_g_per_100g,
              carbs_g_per_100g: c.carbs_g_per_100g,
              fat_g_per_100g: c.fat_g_per_100g,
              calories: c.calories,
              protein_g: c.protein_g,
              carbs_g: c.carbs_g,
              fat_g: c.fat_g,
            });
          }
          dayCacheRef.current.clear();
          monthCacheRef.current.clear();
          onDataChanged();
        })().catch((e) => console.error('[Diary] undo meal delete failed', e));
      });
    } catch (e) {
      console.error('[Diary] deleteMeal failed', e);
      Alert.alert('Delete failed', 'The meal could not be deleted. Please try again.');
    }
  }, [foodLogs, mealRows, onDataChanged, selectedDate, showToast]);

  const renderDiaryItem = useCallback(({ item }: { item: DiaryListItem }) => item.kind === 'section' ? (
    <JournalSectionHeader
      label={item.section.label}
      hasEntries={item.section.entries.length > 0}
      collapsed={collapsedSections.has(item.section.meal)}
      totalCalories={item.section.totalCalories}
      onToggle={() => toggleSection(item.section.meal)}
    />
  ) : (
    <JournalEntryRow
      entry={item.entry}
      onEditFood={handleEditFood}
      onEditMeal={handleEditMeal}
      onDeleteFood={handleDeleteFood}
      onDeleteMeal={handleDeleteMeal}
      onShareMeal={handleShareMeal}
    />
  ), [collapsedSections, handleDeleteFood, handleDeleteMeal, handleEditFood, handleEditMeal, handleShareMeal, toggleSection]);

  const handleSaveEdit = useCallback(async (grams: number): Promise<boolean> => {
    const food = edit.food;
    if (!food || grams <= 0) return false;

    setEdit((e) => ({ ...e, saving: true }));
    try {
      const ratio = portionRatio(food, grams);

      const newCalories = Math.round(food.calories * ratio);
      const newProtein = Math.round(food.protein_g * ratio * 10) / 10;
      const newCarbs = Math.round(food.carbs_g * ratio * 10) / 10;
      const newFat = Math.round(food.fat_g * ratio * 10) / 10;

      await updateFoodLog(food.id, {
        grams_logged: grams,
        calories: newCalories,
        protein_g: newProtein,
        carbs_g: newCarbs,
        fat_g: newFat,
      });
      dayCacheRef.current.clear();
      monthCacheRef.current.clear();
      onDataChanged();
      setEdit((current) => ({ ...current, saving: false }));
      return true;
    } catch (e) {
      console.error('[Diary] updateFoodLog failed', e);
      Alert.alert('Save failed', 'Your changes could not be saved. Please try again.');
      setEdit((current) => ({ ...current, saving: false }));
      return false;
    }
  }, [edit.food, onDataChanged]);

  const handleEditClosed = useCallback(() => {
    setEdit({ food: null, saving: false });
    onEditSheetVisibilityChange(false);
  }, [onEditSheetVisibilityChange]);

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      <View
        className="flex-1"
        accessibilityElementsHidden={edit.food != null}
        importantForAccessibility={edit.food != null ? 'no-hide-descendants' : 'auto'}
      >
      <ResponsiveContent className="flex-1" maxWidth={READING_MAX_WIDTH}>
      {/* Day strip */}
      <WeekStrip
        days={dayCells}
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        monthLabel={formatMonthLabel(monthAnchor)}
      />

      {/* Divider */}
      <View className="h-px bg-m3-outline-variant/30 mx-4" />

      {!loading && !dayLoadError && monthLoadError && (
        <View
          className="mx-4 mt-3 min-h-[56px] flex-row items-center gap-3 rounded-2xl bg-m3-error-container px-4 py-1"
          accessibilityRole="alert"
        >
          <MaterialIcons name="error-outline" size={18} color={M3.onErrorContainer} />
          <Text className="flex-1 text-m3-on-error-container text-sm">
            Calendar totals unavailable. Diary entries are still available.
          </Text>
          <Pressable
            onPress={retryMonth}
            accessibilityRole="button"
            accessibilityLabel="Retry calendar totals"
            className="min-h-[48px] justify-center px-2 active:opacity-70"
          >
            <Text className="text-m3-on-error-container text-xs font-semibold">Retry</Text>
          </Pressable>
        </View>
      )}

      {!loading && !dayLoadError && (
        <>
          <MacroRail cells={macroCells} />
          <View className="h-px bg-m3-outline-variant/30 mx-4 mb-3" />
        </>
      )}

      <Reanimated.View className="flex-1" style={dayContentStyle}>
      {loading ? (
        <View className="flex-1 items-center justify-center" accessibilityLiveRegion="polite">
          <ActivityIndicator accessibilityLabel="Loading diary" color={M3.onSurfaceVariant} />
        </View>
      ) : dayLoadError ? (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <MaterialIcons name="error-outline" size={40} color={M3.onSurfaceVariant} />
          <Text className="text-m3-on-surface-variant text-sm font-medium text-center">
            Couldn't load this diary view. Your data is still safe.
          </Text>
          <Pressable
            onPress={retryLoads}
            accessibilityRole="button"
            className="min-h-[48px] bg-white rounded-full px-6 items-center justify-center active:opacity-80"
          >
            <Text className="text-m3-on-primary text-sm font-semibold">Try again</Text>
          </Pressable>
        </View>
      ) : (
        <Reanimated.FlatList
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
          data={foodLogs.length > 0 ? journalListItems : []}
          renderItem={renderDiaryItem}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={diaryListHeader}
          ListEmptyComponent={emptyDiaryState}
          accessibilityElementsHidden={displayedDate !== selectedDate}
          importantForAccessibility={displayedDate === selectedDate ? 'auto' : 'no-hide-descendants'}
        />
      )}
      </Reanimated.View>
      </ResponsiveContent>
      </View>

      {/* Portion edit sheet (shared Sheet vocabulary: BackHandler, discard guard, M3 handle) */}
      <DiaryEditSheet
        food={edit.food}
        saving={edit.saving}
        onSave={handleSaveEdit}
        onClosed={handleEditClosed}
      />

    </SafeAreaView>
  );
}

export default React.memo(DiaryScreen);
