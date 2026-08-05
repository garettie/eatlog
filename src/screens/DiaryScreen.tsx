import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import Reanimated, {
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
import MacroRail from '../components/MacroRail';
import { JournalEntryKind, JournalEntryRow, JournalSectionHeader, MealGroup } from '../components/JournalSection';
import DiaryEditSheet, { portionRatio } from '../components/DiaryEditSheet';
import MealPhotoViewer from '../components/MealPhotoViewer';
import { DURATION, EASING } from '../theme/motion';
import ResponsiveContent from '../components/ResponsiveContent';
import { READING_MAX_WIDTH } from '../theme/layout';

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
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
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
  onOpenEntry: (logDate?: string) => void;
  onEditMeal: (meal: MealGroup) => void;
  onSelectedDateChange: (date: string) => void;
  onDataChanged: () => void;
  dataVersion: number;
  showToast: (message: string, undo?: () => void) => void;
}

function DiaryScreen({ onOpenEntry, onEditMeal, onSelectedDateChange, onDataChanged, dataVersion, showToast }: DiaryScreenProps) {
  const reduced = useReducedMotion();
  const today = useToday();
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [displayedDate, setDisplayedDate] = useState(() => todayISO());
  const [monthAnchor, setMonthAnchor] = useState(() => getMonthStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [dayLoadError, setDayLoadError] = useState(false);
  const [monthLoadError, setMonthLoadError] = useState(false);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [dayTargetMap, setDayTargetMap] = useState<Map<string, DailyTarget>>(new Map());
  const [monthMacros, setMonthMacros] = useState<DayMacros[]>([]);
  const [mealRows, setMealRows] = useState<Map<number, MealRow>>(new Map());
  const [edit, setEdit] = useState<EditState>({ food: null, saving: false });
  const [viewingPhoto, setViewingPhoto] = useState<{ uri: string; mealName: string } | null>(null);
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
  const dayContentOpacity = useSharedValue(1);
  const dayContentOffset = useSharedValue(0);

  useEffect(() => {
    if (previousDisplayedDateRef.current === displayedDate) return;
    previousDisplayedDateRef.current = displayedDate;
    if (reduced) {
      dayContentOpacity.value = 1;
      dayContentOffset.value = 0;
      return;
    }
    dayContentOpacity.value = 0.72;
    dayContentOffset.value = 8;
    dayContentOpacity.value = withTiming(1, { duration: DURATION.short });
    dayContentOffset.value = withTiming(0, {
      duration: DURATION.medium,
      easing: EASING.emphasizedDecelerate,
    });
  }, [dayContentOffset, dayContentOpacity, displayedDate, reduced]);

  const dayContentStyle = useAnimatedStyle(() => ({
    opacity: dayContentOpacity.value,
    transform: [{ translateX: dayContentOffset.value }],
  }));

  const applyDaySummary = useCallback((date: string, summary: DaySummary) => {
    setFoodLogs(summary.foodLogs);
    setMealRows(summary.mealRows);
    setDisplayedDate(date);
    setDayLoadError(false);
  }, []);

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

  const shiftMonth = useCallback((delta: number) => {
    const next = new Date(monthAnchorRef.current);
    next.setMonth(next.getMonth() + delta);
    monthAnchorRef.current = next;
    setMonthLoadError(false);
    setMonthAnchor(next);

    const cached = monthCacheRef.current.get(getMonthRange(next).key);
    if (cached) {
      setMonthMacros(cached.macros);
      setDayTargetMap(cached.targets);
      prefetchAdjacentMonths(next);
    } else {
      void loadMonth(next);
    }
  }, [loadMonth, prefetchAdjacentMonths]);

  const prevMonth = useCallback(() => shiftMonth(-1), [shiftMonth]);
  const nextMonth = useCallback(() => shiftMonth(1), [shiftMonth]);
  const currentMonth = getMonthStart(new Date());
  const canGoNext = monthAnchor.getTime() < currentMonth.getTime();

  const selectDate = useCallback((iso: string) => {
    if (iso === selectedDateRef.current) return;
    selectedDateRef.current = iso;

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
  }, [loadDay, loadMonth, onSelectedDateChange, prefetchAdjacentMonths]);

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
            components,
          },
        });
      }
    }

    const sectionCals = sectionLogs.reduce((s, l) => s + l.calories, 0);
    const sectionP = sectionLogs.reduce((s, l) => s + l.protein_g, 0);
    const sectionCa = sectionLogs.reduce((s, l) => s + l.carbs_g, 0);
    const sectionF = sectionLogs.reduce((s, l) => s + l.fat_g, 0);

    return {
      meal,
      label,
      entries,
      totalCalories: sectionCals,
      totalProtein: sectionP,
      totalCarbs: sectionCa,
      totalFat: sectionF,
    };
    });
  }, [foodLogs, mealRows]);

  const journalListItems = useMemo<DiaryListItem[]>(() => {
    const items: DiaryListItem[] = [];
    for (const section of journalSections) {
      items.push({ kind: 'section', key: `section-${section.meal}`, section });
      if (collapsedSections.has(section.meal)) continue;
      for (const entry of section.entries) {
        const key = entry.type === 'food'
          ? `food-${entry.foodLog?.id}`
          : `meal-${entry.mealGroup?.id}`;
        items.push({ kind: 'entry', key, entry, sectionMeal: section.meal });
      }
    }
    return items;
  }, [collapsedSections, journalSections]);

  const handleEditFood = useCallback((food: FoodLog) => {
    setEdit({ food, saving: false });
  }, []);

  const handleEditMeal = useCallback((meal: MealGroup) => {
    onEditMeal(meal);
  }, [onEditMeal]);

  const handleViewPhoto = useCallback((uri: string, mealName: string) => {
    setViewingPhoto({ uri, mealName });
  }, []);

  const handleClosePhoto = useCallback(() => {
    setViewingPhoto(null);
  }, []);

  const toggleSection = useCallback((meal: MealType) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(meal)) next.delete(meal);
      else next.add(meal);
      return next;
    });
  }, []);

  const diaryListHeader = useMemo(() => (
    <View className="px-4 pb-1">
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
      totalProtein={item.section.totalProtein}
      totalCarbs={item.section.totalCarbs}
      totalFat={item.section.totalFat}
      onToggle={() => toggleSection(item.section.meal)}
    />
  ) : (
    <JournalEntryRow
      entry={item.entry}
      onEditFood={handleEditFood}
      onEditMeal={handleEditMeal}
      onDeleteFood={handleDeleteFood}
      onDeleteMeal={handleDeleteMeal}
      onViewPhoto={handleViewPhoto}
    />
  ), [collapsedSections, handleDeleteFood, handleDeleteMeal, handleEditFood, handleEditMeal, handleViewPhoto, toggleSection]);

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
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      <ResponsiveContent className="flex-1" maxWidth={READING_MAX_WIDTH}>
      {/* Day strip */}
      <WeekStrip
        days={dayCells}
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        canGoNext={canGoNext}
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

      {/* Portion edit sheet (shared Sheet vocabulary: BackHandler, discard guard, M3 handle) */}
      <DiaryEditSheet
        food={edit.food}
        saving={edit.saving}
        onSave={handleSaveEdit}
        onClosed={handleEditClosed}
      />

      <MealPhotoViewer
        uri={viewingPhoto?.uri ?? null}
        mealName={viewingPhoto?.mealName ?? ''}
        onClose={handleClosePhoto}
      />

    </SafeAreaView>
  );
}

export default React.memo(DiaryScreen);
