import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { MealType, insertFoodLog, insertMeal, cacheFoodItem } from '../db/database';
import { FoodResult } from '../services/foodSearch';
import { defaultMealForNow, todayISO } from '../utils/calculations';
import SheetBackdrop from './SheetBackdrop';

export interface DescribeResult {
  mealName: string;
  components: FoodResult[];
}

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
}

function toEditable(food: FoodResult): EditableComponent {
  const grams = food.servingSizeGrams && food.servingSizeGrams > 0 ? food.servingSizeGrams : 150;
  return {
    food,
    per100g: {
      calories: food.caloriesPer100g ?? 0,
      protein: food.proteinPer100g ?? 0,
      carbs: food.carbsPer100g ?? 0,
      fat: food.fatPer100g ?? 0,
    },
    grams,
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
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCal, setNewCal] = useState('');
    const [newPro, setNewPro] = useState('');
    const [newCarb, setNewCarb] = useState('');
    const [newFat, setNewFat] = useState('');
    const [newGrams, setNewGrams] = useState('150');
    const [meal, setMeal] = useState<MealType>(() => defaultMealForNow());
    const [logging, setLogging] = useState(false);

    useEffect(() => {
      if (result) {
        setMealName(result.mealName);
        setComponents(result.components.map(toEditable));
        setExpandedIndex(null);
        setAdding(false);
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
        prev.map((c, i) => (i === idx ? { ...c, grams: Math.max(1, grams) } : c)),
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

    const handleAddComponent = useCallback(() => {
      if (!newName.trim()) return;
      const cal = parseFloat(newCal) || 0;
      const pro = parseFloat(newPro) || 0;
      const carb = parseFloat(newCarb) || 0;
      const fat = parseFloat(newFat) || 0;
      const grams = parseFloat(newGrams) || 150;
      if (!cal && !pro && !carb && !fat) return;

      const name = newName.trim();
      const food: FoodResult = {
        id: `manual-${Date.now()}`,
        name,
        source: 'manual',
        sourceFoodId: '',
        dataType: 'manual',
        brand: null,
        preparation: null,
        normalizedName: name.toLowerCase(),
        caloriesPer100g: cal,
        proteinPer100g: pro,
        carbsPer100g: carb,
        fatPer100g: fat,
        servingSizeGrams: grams,
        servingLabel: null,
        alternateSourceIds: [],
      };
      setComponents((prev) => [...prev, toEditable(food)]);
      setNewName('');
      setNewCal('');
      setNewPro('');
      setNewCarb('');
      setNewFat('');
      setNewGrams('150');
      setAdding(false);
    }, [newName, newCal, newPro, newCarb, newFat, newGrams]);

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
            source: comp.food.source as 'describe' | 'manual',
            source_food_id: comp.food.sourceFoodId || undefined,
            meal,
            meal_id: mealId,
            brand: comp.food.brand,
            data_type: comp.food.dataType,
            preparation: comp.food.preparation,
            grams_logged: comp.grams,
            serving_size_g: comp.grams,
            serving_label: comp.food.servingLabel,
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
              serving_size_g: comp.grams,
              serving_label: comp.food.servingLabel,
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

              return isExpanded ? (
                <View key={comp.food.id} className="bg-m3-surface-container-high rounded-xl px-3 py-3 gap-3">
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
                <Pressable
                  key={comp.food.id}
                  onPress={() => setExpandedIndex(idx)}
                  className="bg-m3-surface-container-high rounded-xl px-3 py-2.5 gap-2 active:opacity-70"
                >
                  <View className="flex-row justify-between items-center">
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
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); removeComponent(idx); }}
                      hitSlop={8}
                    >
                      <MaterialIcons name="close" size={14} color="#c4c6d0" />
                    </Pressable>
                  </View>
                  <View className="flex-row items-center gap-2">
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
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* ── Add Component ── */}
          {adding ? (
            <View className="bg-m3-surface-container-high rounded-xl px-3 py-3 gap-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-[9px] text-m3-on-surface-variant font-semibold uppercase tracking-wider">
                  Add Component
                </Text>
                <Pressable onPress={() => { setAdding(false); setNewName(''); }} hitSlop={8}>
                  <MaterialIcons name="close" size={14} color="#c4c6d0" />
                </Pressable>
              </View>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Olive Oil"
                placeholderTextColor="#c4c6d0"
                className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-3 py-2 border border-m3-outline-variant/50"
              />
              <View className="flex-row gap-2">
                <View className="flex-1 gap-1">
                  <Text className="text-[7px] text-white/60 font-semibold tracking-wider">CAL</Text>
                  <TextInput
                    value={newCal}
                    onChangeText={setNewCal}
                    placeholder="0"
                    placeholderTextColor="#c4c6d0"
                    keyboardType="numeric"
                    className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
                  />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-[7px] text-m3-protein font-semibold tracking-wider">PRO</Text>
                  <TextInput
                    value={newPro}
                    onChangeText={setNewPro}
                    placeholder="0"
                    placeholderTextColor="#c4c6d0"
                    keyboardType="numeric"
                    className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
                  />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-[7px] text-m3-carbs font-semibold tracking-wider">CARB</Text>
                  <TextInput
                    value={newCarb}
                    onChangeText={setNewCarb}
                    placeholder="0"
                    placeholderTextColor="#c4c6d0"
                    keyboardType="numeric"
                    className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
                  />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-[7px] text-m3-fat font-semibold tracking-wider">FAT</Text>
                  <TextInput
                    value={newFat}
                    onChangeText={setNewFat}
                    placeholder="0"
                    placeholderTextColor="#c4c6d0"
                    keyboardType="numeric"
                    className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
                  />
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={newGrams}
                  onChangeText={setNewGrams}
                  placeholder="150"
                  placeholderTextColor="#c4c6d0"
                  keyboardType="numeric"
                  className="w-20 text-center bg-m3-surface-container rounded-lg py-1.5 px-2 text-m3-on-surface text-xs font-semibold border border-m3-outline-variant/50"
                />
                <Text className="text-[9px] text-m3-on-surface-variant">grams</Text>
              </View>
              <Pressable
                onPress={handleAddComponent}
                className="bg-m3-surface-container rounded-full py-2.5 items-center active:opacity-70"
              >
                <Text className="text-m3-on-surface text-xs font-semibold">Add</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setAdding(true)}
              className="flex-row items-center justify-center gap-2 py-2"
            >
              <MaterialIcons name="add-circle-outline" size={18} color="#c4c6d0" />
              <Text className="text-m3-on-surface-variant text-xs font-medium">Add Component</Text>
            </Pressable>
          )}

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
