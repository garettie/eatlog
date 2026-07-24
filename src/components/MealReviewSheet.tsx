import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { MealType, insertFoodLog, insertMeal, cacheFoodItem } from '../db/database';
import { FoodResult } from '../services/foodSearch';
import { DescribeResult } from '../services/foodScan';
import { defaultMealForNow, todayISO } from '../utils/calculations';
import SheetBackdrop from './SheetBackdrop';
import AddComponentSection from './AddComponentSection';

interface MealReviewSheetProps {
  result: DescribeResult | null;
  onLogComplete: () => void;
}

interface EditableComponent {
  food: FoodResult;
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  grams: number;
  servings: number;
  servingSizeGrams: number | null;
  servingLabel: string | null;
}

function toEditable(food: FoodResult): EditableComponent {
  const hasServing = !!(food.servingSizeGrams && food.servingSizeGrams > 0);
  const defaultGrams = food.estimatedGrams ?? (hasServing ? food.servingSizeGrams! : 150);
  return {
    food,
    per100g: {
      calories: food.caloriesPer100g ?? 0,
      protein: food.proteinPer100g ?? 0,
      carbs: food.carbsPer100g ?? 0,
      fat: food.fatPer100g ?? 0,
    },
    grams: defaultGrams,
    servings: hasServing ? Math.round((defaultGrams / food.servingSizeGrams!) * 10) / 10 : 1,
    servingSizeGrams: food.servingSizeGrams ?? null,
    servingLabel: food.servingLabel ?? null,
  };
}

const MEALS: { label: string; value: MealType }[] = [
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' },
  { label: 'Snack', value: 'snack' },
];

const MealReviewSheet = forwardRef<BottomSheetModal, MealReviewSheetProps>(
  ({ result, onLogComplete }, ref) => {
    const [mealName, setMealName] = useState(result?.mealName ?? '');
    const [components, setComponents] = useState<EditableComponent[]>(
      () => (result?.components ?? []).map(toEditable),
    );
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [meal, setMeal] = useState<MealType>(() => defaultMealForNow());
    const [logging, setLogging] = useState(false);

    useEffect(() => {
      if (result) {
        setMealName(result.mealName);
        setComponents(result.components.map(toEditable));
        setExpandedIndex(null);
      }
    }, [result]);

    const totalMacros = useMemo(() => {
      let cal = 0;
      let pro = 0;
      let carb = 0;
      let fat = 0;
      let totalGrams = 0;
      for (const comp of components) {
        const ratio = comp.grams / 100;
        cal += Math.round(comp.per100g.calories * ratio);
        pro += Math.round(comp.per100g.protein * ratio * 10) / 10;
        carb += Math.round(comp.per100g.carbs * ratio * 10) / 10;
        fat += Math.round(comp.per100g.fat * ratio * 10) / 10;
        totalGrams += comp.grams;
      }
      return { calories: cal, protein: pro, carbs: carb, fat, totalGrams };
    }, [components]);

    const updateGrams = useCallback((idx: number, grams: number) => {
      setComponents((prev) =>
        prev.map((c, i) => {
          if (i !== idx) return c;
          const g = Math.max(1, grams);
          const newServings = c.servingSizeGrams && c.servingSizeGrams > 0
            ? Math.round((g / c.servingSizeGrams) * 10) / 10
            : c.servings;
          return { ...c, grams: g, servings: newServings };
        }),
      );
    }, []);

    const updateServings = useCallback((idx: number, delta: number) => {
      setComponents((prev) =>
        prev.map((c, i) => {
          if (i !== idx || !c.servingSizeGrams || c.servingSizeGrams <= 0) return c;
          const newServings = Math.max(0.5, Math.round((c.servings + delta) * 10) / 10);
          return {
            ...c,
            servings: newServings,
            grams: Math.round(newServings * c.servingSizeGrams),
          };
        }),
      );
    }, []);

    const updatePer100g = useCallback(
      (idx: number, field: keyof EditableComponent['per100g'], value: number) => {
        setComponents((prev) =>
          prev.map((c, i) =>
            i === idx
              ? { ...c, per100g: { ...c.per100g, [field]: value } }
              : c,
          ),
        );
      },
      [],
    );

    const removeComponent = useCallback((idx: number) => {
      setComponents((prev) => {
        const next = [...prev];
        next.splice(idx, 1);
        return next;
      });
      if (expandedIndex === idx) setExpandedIndex(null);
      if (expandedIndex != null && expandedIndex > idx) setExpandedIndex(expandedIndex - 1);
    }, [expandedIndex]);

    const handleAddFoods = useCallback((foods: FoodResult[]) => {
      setComponents((prev) => [...prev, ...foods.map(toEditable)]);
    }, []);

    const handleLogMeal = useCallback(async () => {
      if (components.length === 0) return;
      setLogging(true);
      try {
        const logDate = todayISO();
        const mealId = await insertMeal({
          name: mealName.trim() || 'Meal',
          log_date: logDate,
          meal_type: meal,
        });

        for (const comp of components) {
          const ratio = comp.grams / 100;
          const cal = Math.round(comp.per100g.calories * ratio);
          const pro = Math.round(comp.per100g.protein * ratio * 10) / 10;
          const carb = Math.round(comp.per100g.carbs * ratio * 10) / 10;
          const fat = Math.round(comp.per100g.fat * ratio * 10) / 10;

          await insertFoodLog({
            log_date: logDate,
            name: comp.food.name,
            source: (comp.food.source as 'describe' | 'manual') || 'manual',
            source_food_id: comp.food.sourceFoodId || undefined,
            meal,
            meal_id: mealId,
            brand: comp.food.brand,
            data_type: comp.food.dataType,
            preparation: comp.food.preparation,
            grams_logged: comp.grams,
            serving_size_g: comp.servingSizeGrams ?? comp.grams,
            serving_label: comp.servingLabel,
            calories_per_100g: comp.per100g.calories,
            protein_g_per_100g: comp.per100g.protein,
            carbs_g_per_100g: comp.per100g.carbs,
            fat_g_per_100g: comp.per100g.fat,
            calories: cal,
            protein_g: pro,
            carbs_g: carb,
            fat_g: fat,
          });

          if (comp.food.source === 'describe' || comp.food.source === 'scan') {
            await cacheFoodItem({
              name: comp.food.name,
              normalizedName: comp.food.normalizedName,
              brand: comp.food.brand,
              preparation: comp.food.preparation,
              calories_per_100g: comp.per100g.calories,
              protein_g_per_100g: comp.per100g.protein,
              carbs_g_per_100g: comp.per100g.carbs,
              fat_g_per_100g: comp.per100g.fat,
              serving_size_g: comp.servingSizeGrams ?? comp.grams,
              serving_label: comp.servingLabel,
              source: comp.food.source as 'scan' | 'describe',
            });
          }
        }

        onLogComplete();
      } finally {
        setLogging(false);
      }
    }, [components, mealName, meal, onLogComplete]);

    if (!result) return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['85%']}
        backgroundStyle={{ backgroundColor: '#1d2024' }}
        handleIndicatorStyle={{ backgroundColor: '#44474f', width: 40 }}
        animationConfigs={{ duration: 300 }}
        enableDynamicSizing={false}
        backdropComponent={SheetBackdrop}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <View />
      </BottomSheetModal>
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['85%']}
        backgroundStyle={{ backgroundColor: '#1d2024' }}
        handleIndicatorStyle={{ backgroundColor: '#44474f', width: 40 }}
        animationConfigs={{ duration: 300 }}
        enableDynamicSizing={false}
        backdropComponent={SheetBackdrop}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView
          className="flex-1 px-5"
          contentContainerClassName="pb-8 gap-4"
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Meal Name ── */}
          <View className="gap-1">
            <Text className="text-[9px] text-m3-on-surface-variant font-semibold uppercase tracking-wider">
              Meal Name
            </Text>
            <TextInput
              value={mealName}
              onChangeText={setMealName}
              className="bg-m3-surface-container-high text-m3-on-surface font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
            />
          </View>

          {/* ── Totals Banner ── */}
          <View className="bg-m3-surface-container rounded-xl p-3 gap-2">
            <View className="flex-row gap-2">
              <View className="flex-1 bg-m3-surface-container-high rounded-lg p-2.5 items-center gap-0.5">
                <Text className="text-[8px] text-white/70 font-semibold tracking-wider">CAL</Text>
                <Text className="text-white font-bold text-sm num-tabular">{totalMacros.calories}</Text>
              </View>
              <View className="flex-1 bg-m3-surface-container-high rounded-lg p-2.5 items-center gap-0.5">
                <Text className="text-[8px] text-m3-protein font-semibold tracking-wider">PRO</Text>
                <Text className="text-m3-on-surface font-bold text-sm num-tabular">{totalMacros.protein}g</Text>
              </View>
              <View className="flex-1 bg-m3-surface-container-high rounded-lg p-2.5 items-center gap-0.5">
                <Text className="text-[8px] text-m3-carbs font-semibold tracking-wider">CARB</Text>
                <Text className="text-m3-on-surface font-bold text-sm num-tabular">{totalMacros.carbs}g</Text>
              </View>
              <View className="flex-1 bg-m3-surface-container-high rounded-lg p-2.5 items-center gap-0.5">
                <Text className="text-[8px] text-m3-fat font-semibold tracking-wider">FAT</Text>
                <Text className="text-m3-on-surface font-bold text-sm num-tabular">{totalMacros.fat}g</Text>
              </View>
            </View>
            <Text className="text-m3-on-surface-variant text-[9px] text-center">
              {totalMacros.totalGrams}g total
            </Text>
          </View>

          {/* ── Component Rows ── */}
          <View className="gap-2">
            <Text className="text-[9px] text-m3-on-surface-variant font-semibold uppercase tracking-wider">
              Components
            </Text>
            {components.map((comp, idx) => {
              const isExpanded = expandedIndex === idx;
              const ratio = comp.grams / 100;
              const cal = Math.round(comp.per100g.calories * ratio);
              const pro = Math.round(comp.per100g.protein * ratio * 10) / 10;
              const carb = Math.round(comp.per100g.carbs * ratio * 10) / 10;
              const fat = Math.round(comp.per100g.fat * ratio * 10) / 10;
              const hasServing = !!(comp.servingSizeGrams && comp.servingSizeGrams > 0);

              return isExpanded ? (
                /* ── Expanded Row ── */
                <View key={`${comp.food.id}-${idx}`} className="bg-m3-surface-container-high rounded-xl px-3 py-3 gap-3">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-m3-on-surface font-medium text-xs" numberOfLines={1}>
                      {comp.food.name}
                    </Text>
                    <Pressable onPress={() => setExpandedIndex(null)} hitSlop={8}>
                      <MaterialIcons name="expand-less" size={18} color="#c4c6d0" />
                    </Pressable>
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1 gap-1">
                      <Text className="text-[7px] text-white/70 font-semibold tracking-wider">CAL/100g</Text>
                      <TextInput
                        value={String(comp.per100g.calories)}
                        onChangeText={(t) => updatePer100g(idx, 'calories', parseFloat(t) || 0)}
                        keyboardType="numeric"
                        className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
                      />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-[7px] text-m3-protein font-semibold tracking-wider">PRO</Text>
                      <TextInput
                        value={String(comp.per100g.protein)}
                        onChangeText={(t) => updatePer100g(idx, 'protein', parseFloat(t) || 0)}
                        keyboardType="numeric"
                        className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
                      />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-[7px] text-m3-carbs font-semibold tracking-wider">CARB</Text>
                      <TextInput
                        value={String(comp.per100g.carbs)}
                        onChangeText={(t) => updatePer100g(idx, 'carbs', parseFloat(t) || 0)}
                        keyboardType="numeric"
                        className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
                      />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-[7px] text-m3-fat font-semibold tracking-wider">FAT</Text>
                      <TextInput
                        value={String(comp.per100g.fat)}
                        onChangeText={(t) => updatePer100g(idx, 'fat', parseFloat(t) || 0)}
                        keyboardType="numeric"
                        className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
                      />
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={String(comp.grams)}
                      onChangeText={(t) => updateGrams(idx, parseFloat(t) || 1)}
                      keyboardType="numeric"
                      className="w-20 text-center bg-m3-surface-container rounded-lg py-1.5 px-2 text-m3-on-surface text-xs font-semibold border border-m3-outline-variant/50"
                    />
                    <Text className="text-[9px] text-m3-on-surface-variant">grams</Text>
                  </View>
                </View>
              ) : (
                /* ── Collapsed Row ── */
                <View key={`${comp.food.id}-${idx}`} className="bg-m3-surface-container-high rounded-xl px-3 py-2.5 gap-2 active:opacity-70">
                  <View className="flex-row justify-between items-center">
                    <Pressable onPress={() => setExpandedIndex(idx)} className="flex-1">
                      <View className="flex-1 mr-2">
                        <Text className="text-m3-on-surface font-medium text-xs" numberOfLines={1}>
                          {comp.food.name}
                        </Text>
                        {comp.food.brand && (
                          <Text className="text-m3-on-surface-variant text-[8px]" numberOfLines={1}>
                            {comp.food.brand}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => removeComponent(idx)}
                      hitSlop={8}
                    >
                      <MaterialIcons name="close" size={14} color="#c4c6d0" />
                    </Pressable>
                  </View>

                  {hasServing ? (
                    /* ── Servings Mode ── */
                    <View className="flex-row items-center gap-1">
                      <Pressable
                        onPress={() => updateServings(idx, -0.5)}
                        className="w-6 h-6 rounded bg-m3-surface-container-highest items-center justify-center active:opacity-60"
                      >
                        <MaterialIcons name="remove" size={14} color="#e2e2e9" />
                      </Pressable>
                      <Text className="text-xs font-bold num-tabular text-m3-on-surface w-8 text-center">
                        {comp.servings % 1 === 0 ? comp.servings.toFixed(0) : comp.servings.toFixed(1)}
                      </Text>
                      <Pressable
                        onPress={() => updateServings(idx, 0.5)}
                        className="w-6 h-6 rounded bg-m3-surface-container-highest items-center justify-center active:opacity-60"
                      >
                        <MaterialIcons name="add" size={14} color="#e2e2e9" />
                      </Pressable>
                      <Text className="text-[9px] text-m3-on-surface-variant ml-1" numberOfLines={1}>
                        {comp.servingLabel ?? `${comp.servingSizeGrams}g`}{' '}
                        <Text className="text-[8px] text-m3-on-surface-variant/60">· {comp.grams}g</Text>
                      </Text>
                      <View className="flex-1 flex-row gap-1 justify-end">
                        <View className="bg-m3-surface-container rounded px-1.5 py-0.5 items-center">
                          <Text className="text-[7px] text-white/60 font-semibold">CAL</Text>
                          <Text className="text-[8px] text-white font-semibold num-tabular">{cal}</Text>
                        </View>
                        <View className="bg-m3-surface-container rounded px-1.5 py-0.5 items-center">
                          <Text className="text-[7px] text-m3-protein font-semibold">PRO</Text>
                          <Text className="text-[8px] text-m3-on-surface font-semibold num-tabular">{pro}g</Text>
                        </View>
                        <View className="bg-m3-surface-container rounded px-1.5 py-0.5 items-center">
                          <Text className="text-[7px] text-m3-carbs font-semibold">CARB</Text>
                          <Text className="text-[8px] text-m3-on-surface font-semibold num-tabular">{carb}g</Text>
                        </View>
                        <View className="bg-m3-surface-container rounded px-1.5 py-0.5 items-center">
                          <Text className="text-[7px] text-m3-fat font-semibold">FAT</Text>
                          <Text className="text-[8px] text-m3-on-surface font-semibold num-tabular">{fat}g</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    /* ── Grams Mode ── */
                    <View className="flex-row items-center gap-2">
                      <Pressable onPress={() => setExpandedIndex(idx)} className="flex-row items-center gap-2 flex-1">
                        <TextInput
                          value={String(comp.grams)}
                          onChangeText={(t) => updateGrams(idx, parseFloat(t) || 1)}
                          keyboardType="numeric"
                          onPressIn={(e) => e.stopPropagation()}
                          className="w-16 text-center bg-m3-surface-container rounded-lg py-1 px-1 text-m3-on-surface text-xs font-semibold border border-m3-outline-variant/50"
                        />
                        <Text className="text-[9px] text-m3-on-surface-variant">g</Text>
                        <View className="flex-1 flex-row gap-1 justify-end">
                          <View className="bg-m3-surface-container rounded px-1.5 py-0.5 items-center">
                            <Text className="text-[7px] text-white/60 font-semibold">CAL</Text>
                            <Text className="text-[8px] text-white font-semibold num-tabular">{cal}</Text>
                          </View>
                          <View className="bg-m3-surface-container rounded px-1.5 py-0.5 items-center">
                            <Text className="text-[7px] text-m3-protein font-semibold">PRO</Text>
                            <Text className="text-[8px] text-m3-on-surface font-semibold num-tabular">{pro}g</Text>
                          </View>
                          <View className="bg-m3-surface-container rounded px-1.5 py-0.5 items-center">
                            <Text className="text-[7px] text-m3-carbs font-semibold">CARB</Text>
                            <Text className="text-[8px] text-m3-on-surface font-semibold num-tabular">{carb}g</Text>
                          </View>
                          <View className="bg-m3-surface-container rounded px-1.5 py-0.5 items-center">
                            <Text className="text-[7px] text-m3-fat font-semibold">FAT</Text>
                            <Text className="text-[8px] text-m3-on-surface font-semibold num-tabular">{fat}g</Text>
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* ── Add Component ── */}
          <AddComponentSection onAdd={handleAddFoods} />

          {/* ── Meal Selector ── */}
          <View className="flex-row bg-m3-surface-container-high rounded-full p-1.5">
            {MEALS.map((m) => (
              <Pressable
                key={m.value}
                onPress={() => setMeal(m.value)}
                className={`flex-1 py-2 rounded-full items-center ${meal === m.value ? 'bg-m3-surface-container' : ''}`}
              >
                <Text
                  className={`text-xs font-semibold ${meal === m.value ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}
                >
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Log Button ── */}
          <Pressable
            onPress={handleLogMeal}
            disabled={logging || components.length === 0}
            className="bg-white py-3.5 rounded-full items-center justify-center active:scale-95 disabled:opacity-40 mt-2"
          >
            {logging ? (
              <Text className="text-black font-bold text-sm">Logging...</Text>
            ) : (
              <View className="flex-row items-center gap-1.5">
                <MaterialIcons name="check" size={18} color="#111318" />
                <Text className="text-black font-bold text-sm">Log Meal</Text>
              </View>
            )}
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

MealReviewSheet.displayName = 'MealReviewSheet';
export default MealReviewSheet;
