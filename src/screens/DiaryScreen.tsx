import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  getFoodLogsByDate,
  getDailyTargetForDate,
  getMacrosByDateRange,
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
import { M3 } from '../theme/tokens';
import { DURATION, EASING } from '../theme/motion';
import WeekStrip from '../components/WeekStrip';
import MacroRail from '../components/MacroRail';
import JournalSection, { JournalEntryKind, MealGroup } from '../components/JournalSection';
import DiaryEditSheet, { portionRatio } from '../components/DiaryEditSheet';

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

interface DiaryScreenProps {
  onOpenEntry: (logDate?: string) => void;
  onEditMeal: (meal: MealGroup) => void;
  dataVersion: number;
  showToast: (message: string, undo?: () => void) => void;
}

export default function DiaryScreen({ onOpenEntry, onEditMeal, dataVersion, showToast }: DiaryScreenProps) {
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [monthAnchor, setMonthAnchor] = useState(() => getMonthStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [dayTargetMap, setDayTargetMap] = useState<Map<string, DailyTarget>>(new Map());
  const [monthMacros, setMonthMacros] = useState<DayMacros[]>([]);
  const [mealRows, setMealRows] = useState<Map<number, MealRow>>(new Map());
  const [edit, setEdit] = useState<EditState>({ food: null, saving: false });
  const [refreshCount, setRefreshCount] = useState(0);
  const [monthDirection, setMonthDirection] = useState<-1 | 0 | 1>(0);
  const initialLoadDone = useRef(false);
  const loadRequestRef = useRef(0);
  const loadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const monthCacheRef = useRef(new Map<string, MonthSummary>());
  const contentDirectionRef = useRef<-1 | 0 | 1>(0);
  const reduced = useReducedMotion();
  const contentTranslateX = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateX: contentTranslateX.value }],
  }));

  const animateContentOut = useCallback((direction: -1 | 1) => {
    contentDirectionRef.current = direction;
    contentTranslateX.value = withTiming(-direction * 18, {
      duration: reduced ? 0 : Math.round(DURATION.short * 0.6),
      easing: EASING.emphasizedAccelerate,
    });
    contentOpacity.value = withTiming(0.68, {
      duration: reduced ? 0 : Math.round(DURATION.short * 0.6),
    });
  }, [contentOpacity, contentTranslateX, reduced]);

  const loadData = useCallback((date: string, anchor: Date, showLoading = false) => {
    const requestId = ++loadRequestRef.current;
    if (showLoading) setLoading(true);
    const queued = loadQueueRef.current.catch(() => {}).then(async () => {
      if (requestId !== loadRequestRef.current) return;
      try {
        const monthDates = getMonthDates(anchor);
        const startISO = isoFromDate(monthDates[0]);
        const endISO = isoFromDate(monthDates[monthDates.length - 1]);
        const monthKey = `${startISO}:${endISO}`;

        // Keep SQLite reads serialized on Android. Same-month day switches only
        // read the selected day's logs and meals; month summaries stay cached.
        const logs = await getFoodLogsByDate(date);
        if (requestId !== loadRequestRef.current) return;
        let monthSummary = monthCacheRef.current.get(monthKey);
        if (!monthSummary) {
          const macros = await getMacrosByDateRange(startISO, endISO);
          let activeTarget = await getDailyTargetForDate(startISO);
          const targetChanges = await getDailyTargetsByDateRange(startISO, endISO);
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

          monthSummary = { macros, targets: targetMap };
          monthCacheRef.current.set(monthKey, monthSummary);
        }

        const mealIds = [...new Set(logs.filter((l) => l.meal_id != null).map((l) => l.meal_id!))];
        const meals = await getMealsByIds(mealIds);
        const mealMap = new Map<number, MealRow>();
        meals.forEach((m) => mealMap.set(m.id, m));

        if (requestId !== loadRequestRef.current) return;
        const direction = contentDirectionRef.current;
        if (direction !== 0) {
          contentTranslateX.value = direction * 24;
          contentOpacity.value = 0.72;
        }

        setFoodLogs(logs);
        setMonthMacros(monthSummary.macros);
        setDayTargetMap(monthSummary.targets);
        setMealRows(mealMap);
        setLoadError(false);

        if (direction !== 0) {
          contentDirectionRef.current = 0;
          requestAnimationFrame(() => {
            contentTranslateX.value = withTiming(0, {
              duration: reduced ? 0 : DURATION.short,
              easing: EASING.emphasizedDecelerate,
            });
            contentOpacity.value = withTiming(1, {
              duration: reduced ? 0 : DURATION.short,
            });
          });
        }
      } catch (e) {
        console.error('[Diary] loadData failed', e);
        if (requestId === loadRequestRef.current) {
          contentDirectionRef.current = 0;
          contentTranslateX.value = withTiming(0, { duration: reduced ? 0 : DURATION.short });
          contentOpacity.value = withTiming(1, { duration: reduced ? 0 : DURATION.short });
          setLoadError(true);
        }
      } finally {
        if (requestId === loadRequestRef.current) setLoading(false);
      }
    });
    loadQueueRef.current = queued;
    return queued;
  }, [contentOpacity, contentTranslateX, reduced]);

  useFocusEffect(
    useCallback(() => {
      const isInitial = !initialLoadDone.current;
      initialLoadDone.current = true;
      loadData(selectedDate, monthAnchor, isInitial);
    }, [selectedDate, monthAnchor, refreshCount, loadData]),
  );

  useEffect(() => {
    if (dataVersion > 0) {
      monthCacheRef.current.clear();
      loadData(selectedDate, monthAnchor, false);
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
    }), [dayTargetMap, monthDates, monthMacroMap]);

  const shiftMonth = useCallback((delta: number) => {
    setMonthDirection(delta > 0 ? 1 : -1);
    setMonthAnchor((a) => {
      const d = new Date(a);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  }, []);

  const prevMonth = useCallback(() => shiftMonth(-1), [shiftMonth]);
  const nextMonth = useCallback(() => shiftMonth(1), [shiftMonth]);
  const currentMonth = getMonthStart(new Date());
  const canGoNext = monthAnchor.getTime() < currentMonth.getTime();

  const selectDate = useCallback((iso: string) => {
    if (iso === selectedDate) return;
    const direction: -1 | 1 = iso > selectedDate ? 1 : -1;
    animateContentOut(direction);
    setSelectedDate(iso);
    const d = new Date(iso + 'T12:00:00');
    const monthStart = getMonthStart(d);
    setMonthAnchor((current) => {
      if (monthStart.getTime() !== current.getTime()) setMonthDirection(direction);
      return monthStart;
    });
  }, [animateContentOut, selectedDate]);

  const todayTarget = dayTargetMap.get(selectedDate);
  const targetCalories = todayTarget?.target_calories ?? 0;
  const targetProtein = todayTarget?.target_protein_g ?? 0;
  const targetCarbs = todayTarget?.target_carbs_g ?? 0;
  const targetFat = todayTarget?.target_fat_g ?? 0;

  const consumedCals = foodLogs.reduce((s, l) => s + l.calories, 0);
  const consumedProtein = foodLogs.reduce((s, l) => s + l.protein_g, 0);
  const consumedCarbs = foodLogs.reduce((s, l) => s + l.carbs_g, 0);
  const consumedFat = foodLogs.reduce((s, l) => s + l.fat_g, 0);

  const macroCells = [
    { icon: 'local-fire-department', consumed: consumedCals, target: targetCalories, barColor: M3.calories, unit: 'kcal' as const },
    { letter: 'P', consumed: consumedProtein, target: targetProtein, barColor: M3.protein, unit: 'g' as const },
    { letter: 'C', consumed: consumedCarbs, target: targetCarbs, barColor: M3.carbs, unit: 'g' as const },
    { letter: 'F', consumed: consumedFat, target: targetFat, barColor: M3.fat, unit: 'g' as const },
  ];

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

  const handleEditFood = useCallback((food: FoodLog) => {
    setEdit({ food, saving: false });
  }, []);

  const handleEditMeal = useCallback((meal: MealGroup) => {
    onEditMeal(meal);
  }, [onEditMeal]);

  const handleDeleteFood = useCallback(async (food: FoodLog) => {
    try {
      await deleteFoodLog(food.id);
      monthCacheRef.current.clear();
      setRefreshCount((r) => r + 1);
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
            monthCacheRef.current.clear();
            setRefreshCount((r) => r + 1);
          })
          .catch((e) => console.error('[Diary] undo delete failed', e));
      });
    } catch (e) {
      console.error('[Diary] deleteFoodLog failed', e);
      Alert.alert('Delete failed', 'The entry could not be deleted. Please try again.');
    }
  }, [showToast]);

  const handleDeleteMeal = useCallback(async (mealId: number) => {
    const mealRow = mealRows.get(mealId);
    const components = foodLogs.filter((l) => l.meal_id === mealId);
    const mealName = mealRow?.name ?? 'Meal';
    try {
      await deleteMeal(mealId);
      monthCacheRef.current.clear();
      setRefreshCount((r) => r + 1);
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
          monthCacheRef.current.clear();
          setRefreshCount((r) => r + 1);
        })().catch((e) => console.error('[Diary] undo meal delete failed', e));
      });
    } catch (e) {
      console.error('[Diary] deleteMeal failed', e);
      Alert.alert('Delete failed', 'The meal could not be deleted. Please try again.');
    }
  }, [showToast, mealRows, foodLogs, selectedDate]);

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
      monthCacheRef.current.clear();
      setRefreshCount((r) => r + 1);
      setEdit((current) => ({ ...current, saving: false }));
      return true;
    } catch (e) {
      console.error('[Diary] updateFoodLog failed', e);
      Alert.alert('Save failed', 'Your changes could not be saved. Please try again.');
      setEdit((current) => ({ ...current, saving: false }));
      return false;
    }
  }, [edit.food]);

  const handleEditClosed = useCallback(() => {
    setEdit({ food: null, saving: false });
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      {/* Day strip */}
      <WeekStrip
        days={dayCells}
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        canGoNext={canGoNext}
        monthLabel={formatMonthLabel(monthAnchor)}
        transitionDirection={monthDirection}
      />

      {/* Divider */}
      <View className="h-px bg-m3-outline-variant/30 mx-4" />

      <Animated.View style={[{ flex: 1 }, contentStyle]}>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={M3.onSurfaceVariant} />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <MaterialIcons name="error-outline" size={40} color={M3.onSurfaceVariant} />
          <Text className="text-m3-on-surface-variant text-sm font-medium text-center">
            Couldn't load this day. Your diary data is still safe.
          </Text>
          <Pressable
            onPress={() => loadData(selectedDate, monthAnchor, true)}
            accessibilityRole="button"
            className="min-h-[48px] bg-white rounded-full px-6 items-center justify-center active:opacity-80"
          >
            <Text className="text-m3-on-primary text-sm font-semibold">Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {/* Macro rail */}
          <MacroRail cells={macroCells} />

          <View className="h-px bg-m3-outline-variant/30 mx-4 mb-3" />

          {/* Day header */}
          <View className="px-4 pb-1">
            <Text className="text-m3-on-surface text-sm font-bold">
              {formatDayHeader(selectedDate)}
            </Text>
          </View>

          {foodLogs.length === 0 && (
            <View className="mx-4 my-4 py-7 items-center gap-3 rounded-3xl bg-m3-surface-container border border-m3-outline-variant/30">
              <View className="w-11 h-11 rounded-full bg-m3-surface-container-high items-center justify-center">
                <MaterialIcons name="restaurant" size={20} color={M3.onSurfaceVariant} />
              </View>
              <View className="items-center gap-1 px-6">
                <Text className="text-m3-on-surface text-sm font-semibold">Nothing logged yet</Text>
                <Text className="text-m3-on-surface-variant text-xs text-center">Add a meal when you're ready.</Text>
              </View>
              <Pressable
                onPress={() => onOpenEntry(selectedDate)}
                accessibilityRole="button"
                className="min-h-[48px] px-5 rounded-full bg-white items-center justify-center active:opacity-80"
              >
                <Text className="text-m3-on-primary text-sm font-semibold">Add entry</Text>
              </Pressable>
            </View>
          )}

          {/* Journal sections */}
          {journalSections.map((section) => (
            <JournalSection
              key={section.meal}
              label={section.label}
              entries={section.entries}
              totalCalories={section.totalCalories}
              totalProtein={section.totalProtein}
              totalCarbs={section.totalCarbs}
              totalFat={section.totalFat}
              resetKey={selectedDate}
              onEditFood={handleEditFood}
              onEditMeal={handleEditMeal}
              onDeleteFood={handleDeleteFood}
              onDeleteMeal={handleDeleteMeal}
            />
          ))}
        </ScrollView>
      )}
      </Animated.View>

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
