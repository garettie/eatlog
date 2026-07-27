import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

import {
  getFoodLogsByDate,
  getDailyTargetForDate,
  getMacrosByDateRange,
  getMealsByIds,
  updateFoodLog,
  deleteFoodLog,
  deleteMeal,
  FoodLog,
  DailyTarget,
  DayMacros,
  MealType,
  MealRow,
} from '../db/database';
import { todayISO, isoFromDate, getWeekDates, isToday, isFuture, formatDayHeader, formatWeekRange } from '../utils/calendar';
import { M3 } from '../theme/tokens';
import WeekStrip from '../components/WeekStrip';
import MacroRail from '../components/MacroRail';
import JournalSection, { JournalEntryKind } from '../components/JournalSection';
import EntryBar from '../components/EntryBar';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MEAL_ORDER: { meal: MealType; label: string }[] = [
  { meal: 'breakfast', label: 'Breakfast' },
  { meal: 'lunch', label: 'Lunch' },
  { meal: 'snack', label: 'Snack' },
  { meal: 'dinner', label: 'Dinner' },
];

interface EditState {
  visible: boolean;
  food: FoodLog | null;
  grams: number;
  saving: boolean;
}

interface DiaryScreenProps {
  onOpenEntry: () => void;
  onCamera: () => void;
  onGallery: () => void;
  onDescribe: () => void;
  onSearch: () => void;
  onEditMeal: (mealId: number) => void;
  logVersion: number;
}

export default function DiaryScreen({ onOpenEntry, onCamera, onGallery, onDescribe, onSearch, onEditMeal, logVersion }: DiaryScreenProps) {
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [weekAnchor, setWeekAnchor] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
  });
  const [loading, setLoading] = useState(true);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [dayTargetMap, setDayTargetMap] = useState<Map<string, DailyTarget>>(new Map());
  const [weekMacros, setWeekMacros] = useState<DayMacros[]>([]);
  const [mealRows, setMealRows] = useState<Map<number, MealRow>>(new Map());
  const [edit, setEdit] = useState<EditState>({ visible: false, food: null, grams: 0, saving: false });
  const [refreshCount, setRefreshCount] = useState(0);
  const initialLoadDone = useRef(false);

  const loadData = useCallback(async (date: string, anchor: Date, showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const weekDates = getWeekDates(anchor);
      const startISO = isoFromDate(weekDates[0]);
      const endISO = isoFromDate(weekDates[6]);

      const [logs, macros, weekTargets] = await Promise.all([
        getFoodLogsByDate(date),
        getMacrosByDateRange(startISO, endISO),
        Promise.all(weekDates.map((d) => getDailyTargetForDate(isoFromDate(d)))),
      ]);

      const targetMap = new Map<string, DailyTarget>();
      weekDates.forEach((d, i) => {
        const t = weekTargets[i];
        if (t) targetMap.set(isoFromDate(d), t);
      });

      const mealIds = [...new Set(logs.filter((l) => l.meal_id != null).map((l) => l.meal_id!))];
      const meals = await getMealsByIds(mealIds);
      const mealMap = new Map<number, MealRow>();
      meals.forEach((m) => mealMap.set(m.id, m));

      setFoodLogs(logs);
      setWeekMacros(macros);
      setDayTargetMap(targetMap);
      setMealRows(mealMap);
    } catch {
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const isInitial = !initialLoadDone.current;
      initialLoadDone.current = true;
      loadData(selectedDate, weekAnchor, isInitial);
    }, [selectedDate, weekAnchor, refreshCount]),
  );

  useEffect(() => {
    if (logVersion > 0) {
      loadData(selectedDate, weekAnchor, false);
    }
  }, [logVersion]);

  const weekDates = getWeekDates(weekAnchor);

  const dayCells = weekDates.map((d, i) => {
    const iso = isoFromDate(d);
    const macros = weekMacros.find((m) => m.log_date === iso);
    const target = dayTargetMap.get(iso);
    return {
      date: d,
      isoDate: iso,
      label: formatDayHeader(iso),
      dayLetter: DAY_LETTERS[i],
      isToday: isToday(d),
      isFuture: isFuture(d),
      calories: macros?.calories ?? 0,
      targetCalories: target?.target_calories ?? 0,
    };
  });

  const shiftWeek = useCallback((delta: number) => {
    setWeekAnchor((a) => {
      const d = new Date(a);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  }, []);

  const prevWeek = useCallback(() => shiftWeek(-1), [shiftWeek]);
  const nextWeek = useCallback(() => shiftWeek(1), [shiftWeek]);
  const selectDate = useCallback((iso: string) => {
    setSelectedDate(iso);
    const d = new Date(iso + 'T12:00:00');
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    setWeekAnchor((a) => {
      const targetMonday = new Date(d);
      const day = targetMonday.getDay();
      targetMonday.setDate(targetMonday.getDate() - (day === 0 ? 6 : day - 1));
      return targetMonday;
    });
  }, []);

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

  const journalSections = MEAL_ORDER.map(({ meal, label }) => {
    const sectionLogs = foodLogs.filter((l) => l.meal === meal);
    const standalone = sectionLogs.filter((l) => l.meal_id == null);

    const entries: JournalEntryKind[] = [];

    standalone.forEach((f) => {
      entries.push({ type: 'food', foodLog: f });
    });

    const seenMealIds = new Set<number>();
    for (const log of sectionLogs) {
      if (log.meal_id && !seenMealIds.has(log.meal_id)) {
        seenMealIds.add(log.meal_id);
        const components = sectionLogs.filter((l) => l.meal_id === log.meal_id);
        const mealRow = mealRows.get(log.meal_id);
        entries.push({
          type: 'meal',
          mealGroup: {
            id: log.meal_id,
            name: mealRow?.name ?? 'Meal',
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

  const handleEditFood = useCallback((food: FoodLog) => {
    setEdit({
      visible: true,
      food,
      grams: food.grams_logged ?? 150,
      saving: false,
    });
  }, []);

  const handleEditMeal = useCallback((mealId: number) => {
    onEditMeal(mealId);
  }, [onEditMeal]);

  const handleDeleteFood = useCallback(async (food: FoodLog) => {
    await deleteFoodLog(food.id);
    setRefreshCount((r) => r + 1);
  }, []);

  const handleDeleteMeal = useCallback(async (mealId: number) => {
    await deleteMeal(mealId);
    setRefreshCount((r) => r + 1);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!edit.food || edit.grams <= 0) return;

    setEdit((e) => ({ ...e, saving: true }));
    try {
      const ratio = edit.food.grams_logged && edit.food.grams_logged > 0
        ? edit.grams / edit.food.grams_logged
        : edit.food.calories_per_100g
          ? edit.grams / 100
          : 1;

      const newCalories = Math.round(edit.food.calories * ratio);
      const newProtein = Math.round(edit.food.protein_g * ratio * 10) / 10;
      const newCarbs = Math.round(edit.food.carbs_g * ratio * 10) / 10;
      const newFat = Math.round(edit.food.fat_g * ratio * 10) / 10;

      await updateFoodLog(edit.food.id, {
        grams_logged: edit.grams,
        calories: newCalories,
        protein_g: newProtein,
        carbs_g: newCarbs,
        fat_g: newFat,
      });
      setRefreshCount((r) => r + 1);
    } catch {
    } finally {
      setEdit({ visible: false, food: null, grams: 0, saving: false });
    }
  }, [edit]);

  const gramsRatio = edit.food && edit.food.grams_logged && edit.food.grams_logged > 0
    ? edit.grams / edit.food.grams_logged
    : 1;
  const previewCals = edit.food ? Math.round(edit.food.calories * gramsRatio) : 0;
  const previewP = edit.food ? Math.round(edit.food.protein_g * gramsRatio * 10) / 10 : 0;
  const previewC = edit.food ? Math.round(edit.food.carbs_g * gramsRatio * 10) / 10 : 0;
  const previewF = edit.food ? Math.round(edit.food.fat_g * gramsRatio * 10) / 10 : 0;

  const isSelectedToday = selectedDate === todayISO();

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      {/* Week strip */}
      <WeekStrip
        days={dayCells}
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        onPrevWeek={prevWeek}
        onNextWeek={nextWeek}
        weekLabel={formatWeekRange(weekDates)}
      />

      {/* Divider */}
      <View className="h-px bg-m3-outline-variant/30 mx-4" />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={M3.onSurfaceVariant} />
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
            {!isSelectedToday && (
              <Text className="text-m3-on-surface-variant text-[10px] mt-0.5">
                {isoFromDate(new Date(selectedDate + 'T12:00:00'))}
              </Text>
            )}
          </View>

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
              onEditFood={handleEditFood}
              onEditMeal={handleEditMeal}
              onDeleteFood={handleDeleteFood}
              onDeleteMeal={handleDeleteMeal}
            />
          ))}

          {/* Bottom spacer for entry bar */}
          <View className="h-10" />
        </ScrollView>
      )}

      {/* Entry bar above tab navigator */}
      <EntryBar
        onCamera={onCamera}
        onGallery={onGallery}
        onDescribe={onDescribe}
        onSearch={onSearch}
      />

      {/* Edit food modal */}
      {edit.visible && edit.food && (
        <View className="absolute inset-0 z-50">
          <Pressable
            className="flex-1 bg-black/55"
            onPress={() => setEdit({ visible: false, food: null, grams: 0, saving: false })}
          />
          <View className="bg-m3-surface-container rounded-t-3xl border-t border-m3-outline-variant/30 px-5 pt-5 pb-8 gap-4">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 mr-3">
                <Text className="text-m3-on-surface font-bold text-base" numberOfLines={2}>
                  {edit.food.name}
                </Text>
                <Text className="text-m3-on-surface-variant text-xs mt-1">
                  {edit.food.brand ? `${edit.food.brand} · ` : ''}
                  {edit.food.calories_per_100g
                    ? `${Math.round(edit.food.calories_per_100g)} kcal/100g`
                    : `${Math.round(edit.food.calories)} kcal`}
                </Text>
              </View>
              <Text className="text-m3-on-surface text-lg font-bold tabular-nums">
                {previewCals}
              </Text>
            </View>

            <View className="flex-row items-center justify-center gap-4 bg-m3-surface-container-high rounded-2xl py-4">
              <Pressable
                onPress={() => setEdit((e) => ({ ...e, grams: Math.max(1, e.grams - 10) }))}
                className="w-10 h-10 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-70"
              >
                <MaterialIcons name="remove" size={20} color="#e2e2e9" />
              </Pressable>
              <View className="items-center min-w-[80px]">
                <TextInput
                  value={String(edit.grams)}
                  onChangeText={(t) => {
                    const v = parseInt(t, 10);
                    if (!isNaN(v) && v > 0) setEdit((e) => ({ ...e, grams: v }));
                    else if (t === '') setEdit((e) => ({ ...e, grams: 0 }));
                  }}
                  keyboardType="numeric"
                  className="text-white text-3xl font-bold text-center w-24 h-12"
                />
                <Text className="text-m3-on-surface-variant text-xs">grams</Text>
              </View>
              <Pressable
                onPress={() => setEdit((e) => ({ ...e, grams: e.grams + 10 }))}
                className="w-10 h-10 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-70"
              >
                <MaterialIcons name="add" size={20} color="#e2e2e9" />
              </Pressable>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1 bg-m3-surface-container-high rounded-xl py-2 px-3 items-center">
                <Text className="text-m3-protein text-xs font-semibold">Protein</Text>
                <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{previewP}g</Text>
              </View>
              <View className="flex-1 bg-m3-surface-container-high rounded-xl py-2 px-3 items-center">
                <Text className="text-m3-carbs text-xs font-semibold">Carbs</Text>
                <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{previewC}g</Text>
              </View>
              <View className="flex-1 bg-m3-surface-container-high rounded-xl py-2 px-3 items-center">
                <Text className="text-m3-fat text-xs font-semibold">Fat</Text>
                <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{previewF}g</Text>
              </View>
            </View>

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setEdit({ visible: false, food: null, grams: 0, saving: false })}
                className="flex-1 py-3 rounded-full items-center border border-m3-outline-variant/50 active:opacity-70"
              >
                <Text className="text-m3-on-surface-variant font-semibold text-sm">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveEdit}
                disabled={edit.saving || edit.grams <= 0}
                className={`flex-1 py-3 rounded-full items-center ${edit.saving || edit.grams <= 0 ? 'bg-m3-surface-container-high opacity-50' : 'bg-white active:opacity-80'}`}
              >
                <Text className={`font-semibold text-sm ${edit.saving || edit.grams <= 0 ? 'text-m3-on-surface-variant' : 'text-m3-on-primary'}`}>
                  {edit.saving ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
