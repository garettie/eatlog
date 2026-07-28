import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import {
  getFoodLogsByDate,
  getDailyTargetForDate,
  getMacrosByDateRange,
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
import WeekStrip from '../components/WeekStrip';
import MacroRail from '../components/MacroRail';
import JournalSection, { JournalEntryKind } from '../components/JournalSection';
import EntryBar from '../components/EntryBar';

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
  showToast: (message: string, undo?: () => void) => void;
}

export default function DiaryScreen({ onOpenEntry, onCamera, onGallery, onDescribe, onSearch, onEditMeal, logVersion, showToast }: DiaryScreenProps) {
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [monthAnchor, setMonthAnchor] = useState(() => getMonthStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [dayTargetMap, setDayTargetMap] = useState<Map<string, DailyTarget>>(new Map());
  const [monthMacros, setMonthMacros] = useState<DayMacros[]>([]);
  const [mealRows, setMealRows] = useState<Map<number, MealRow>>(new Map());
  const [edit, setEdit] = useState<EditState>({ visible: false, food: null, grams: 0, saving: false });
  const [refreshCount, setRefreshCount] = useState(0);
  const initialLoadDone = useRef(false);

  const loadData = useCallback(async (date: string, anchor: Date, showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const monthDates = getMonthDates(anchor);
      const startISO = isoFromDate(monthDates[0]);
      const endISO = isoFromDate(monthDates[monthDates.length - 1]);

      // Keep SQLite reads serialized on Android. A burst of concurrent
      // prepareAsync calls can race NativeStatement handles on the bridge.
      const logs = await getFoodLogsByDate(date);
      const macros = await getMacrosByDateRange(startISO, endISO);
      const monthTargets: (DailyTarget | null)[] = [];
      for (const d of monthDates) {
        monthTargets.push(await getDailyTargetForDate(isoFromDate(d)));
      }

      const targetMap = new Map<string, DailyTarget>();
      monthDates.forEach((d, i) => {
        const t = monthTargets[i];
        if (t) targetMap.set(isoFromDate(d), t);
      });

      const mealIds = [...new Set(logs.filter((l) => l.meal_id != null).map((l) => l.meal_id!))];
      const meals = await getMealsByIds(mealIds);
      const mealMap = new Map<number, MealRow>();
      meals.forEach((m) => mealMap.set(m.id, m));

      setFoodLogs(logs);
      setMonthMacros(macros);
      setDayTargetMap(targetMap);
      setMealRows(mealMap);
    } catch (e) {
      console.error('[Diary] loadData failed', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const isInitial = !initialLoadDone.current;
      initialLoadDone.current = true;
      loadData(selectedDate, monthAnchor, isInitial);
    }, [selectedDate, monthAnchor, refreshCount]),
  );

  useEffect(() => {
    if (logVersion > 0) {
      loadData(selectedDate, monthAnchor, false);
    }
  }, [logVersion]);

  const monthDates = getMonthDates(monthAnchor);

  const dayCells = monthDates.map((d) => {
    const iso = isoFromDate(d);
    const macros = monthMacros.find((m) => m.log_date === iso);
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
  });

  const shiftMonth = useCallback((delta: number) => {
    setMonthAnchor((a) => {
      const d = new Date(a);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  }, []);

  const prevMonth = useCallback(() => shiftMonth(-1), [shiftMonth]);
  const nextMonth = useCallback(() => shiftMonth(1), [shiftMonth]);

  const selectDate = useCallback((iso: string) => {
    setSelectedDate(iso);
    const d = new Date(iso + 'T12:00:00');
    const monthStart = getMonthStart(d);
    setMonthAnchor(monthStart);
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
    try {
      await deleteFoodLog(food.id);
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
          .then(() => setRefreshCount((r) => r + 1))
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
          setRefreshCount((r) => r + 1);
        })().catch((e) => console.error('[Diary] undo meal delete failed', e));
      });
    } catch (e) {
      console.error('[Diary] deleteMeal failed', e);
      Alert.alert('Delete failed', 'The meal could not be deleted. Please try again.');
    }
  }, [showToast, mealRows, foodLogs, selectedDate]);

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
    } catch (e) {
      console.error('[Diary] updateFoodLog failed', e);
      Alert.alert('Save failed', 'Your changes could not be saved. Please try again.');
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

  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
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
          <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1 }}>
            <Pressable
              className="flex-1 bg-black/55"
              onPress={() => setEdit({ visible: false, food: null, grams: 0, saving: false })}
            />
          </Animated.View>
          <Animated.View entering={FadeInUp.duration(220)}>
            <View
              className="bg-m3-surface-container rounded-t-3xl border-t border-m3-outline-variant/30 px-5 pt-5 gap-4"
              style={{ paddingBottom: Math.max(insets.bottom, 24) }}
            >
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
                className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-70"
              >
                <MaterialIcons name="remove" size={22} color="#e2e2e9" />
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
                className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-70"
              >
                <MaterialIcons name="add" size={22} color="#e2e2e9" />
              </Pressable>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1 bg-m3-surface-container-high rounded-2xl py-2 px-3 items-center">
                <Text className="text-m3-protein text-xs font-semibold">Protein</Text>
                <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{previewP}g</Text>
              </View>
              <View className="flex-1 bg-m3-surface-container-high rounded-2xl py-2 px-3 items-center">
                <Text className="text-m3-carbs text-xs font-semibold">Carbs</Text>
                <Text className="text-m3-on-surface text-sm font-bold tabular-nums">{previewC}g</Text>
              </View>
              <View className="flex-1 bg-m3-surface-container-high rounded-2xl py-2 px-3 items-center">
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
                  {edit.saving ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
            </View>
            </View>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}
