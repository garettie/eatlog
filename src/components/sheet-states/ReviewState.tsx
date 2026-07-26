import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { MealType, insertFoodLog, insertMeal } from '../../db/database';
import { FoodResult } from '../../services/foodSearch';
import { DescribeResult } from '../../services/foodScan';
import { defaultMealForNow, todayISO } from '../../utils/calculations';
import AddComponentSection from '../AddComponentSection';
import MealSelector from '../MealSelector';
import MacroChipGroup from '../MacroChipGroup';
import PrimaryButton from '../PrimaryButton';

interface EditableComponent {
  food: FoodResult;
  per100g: { calories: number; protein: number; carbs: number; fat: number };
  grams: number;
  servings: number;
  servingSizeGrams: number | null;
  servingLabel: string | null;
  unitMode: 'servings' | 'grams' | 'ml';
}

function toEditable(food: FoodResult): EditableComponent {
  const hasServing = !!(food.servingSizeGrams && food.servingSizeGrams > 0);
  const defaultGrams = food.estimatedGrams ?? (hasServing ? food.servingSizeGrams! : 150);
  const isBeverage = !!(food.servingLabel && /ml\b/i.test(food.servingLabel));
  return {
    food,
    per100g: {
      calories: Math.round(food.caloriesPer100g ?? 0),
      protein: Math.round((food.proteinPer100g ?? 0) * 10) / 10,
      carbs: Math.round((food.carbsPer100g ?? 0) * 10) / 10,
      fat: Math.round((food.fatPer100g ?? 0) * 10) / 10,
    },
    grams: defaultGrams,
    servings: hasServing ? Math.round((defaultGrams / food.servingSizeGrams!) * 10) / 10 : 1,
    servingSizeGrams: food.servingSizeGrams ?? null,
    servingLabel: food.servingLabel ?? null,
    unitMode: isBeverage ? 'ml' : hasServing ? 'servings' : 'grams',
  };
}

export interface ReviewStateHandle {
  isDirty: () => boolean;
  isLogged: () => boolean;
  markClean: () => void;
}

interface ReviewStateProps {
  result: DescribeResult | null;
  onLogComplete: (info: { mealId: number; logIds: number[]; meal: MealType; name: string }) => void;
  registerDirty: (isDirty: () => boolean) => void;
  registerLogged: (isLogged: () => boolean, markClean: () => void) => void;
}

export default function ReviewState({ result, onLogComplete, registerDirty, registerLogged }: ReviewStateProps) {
  const [mealName, setMealName] = useState(result?.mealName ?? '');
  const [components, setComponents] = useState<EditableComponent[]>(() => (result?.components ?? []).map(toEditable));
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [meal, setMeal] = useState<MealType>(() => defaultMealForNow());
  const [logging, setLogging] = useState(false);
  const [removed, setRemoved] = useState<{ comp: EditableComponent; idx: number } | null>(null);

  const dirtyRef = useRef(false);
  const loggedRef = useRef(false);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (result) {
      setMealName(result.mealName);
      setComponents(result.components.map(toEditable));
      setExpandedIndex(null);
      dirtyRef.current = false;
      loggedRef.current = false;
      setRemoved(null);
    }
  }, [result]);

  useEffect(() => {
    registerDirty(() => dirtyRef.current);
    registerLogged(() => loggedRef.current, () => { loggedRef.current = false; dirtyRef.current = false; });
  }, [registerDirty, registerLogged]);

  const totalMacros = useMemo(() => {
    let cal = 0, pro10 = 0, carb10 = 0, fat10 = 0, totalGrams = 0;
    for (const comp of components) {
      const ratio = comp.grams / 100;
      cal += Math.round(comp.per100g.calories * ratio);
      pro10 += Math.round(comp.per100g.protein * ratio * 10);
      carb10 += Math.round(comp.per100g.carbs * ratio * 10);
      fat10 += Math.round(comp.per100g.fat * ratio * 10);
      totalGrams += comp.grams;
    }
    return { calories: cal, protein: pro10 / 10, carbs: carb10 / 10, fat: fat10 / 10, totalGrams: Math.round(totalGrams) };
  }, [components]);

  const updateGrams = useCallback((idx: number, grams: number) => {
    dirtyRef.current = true;
    setComponents((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      const g = Math.max(1, grams);
      const newServings = c.servingSizeGrams && c.servingSizeGrams > 0 ? Math.round((g / c.servingSizeGrams) * 10) / 10 : c.servings;
      return { ...c, grams: g, servings: newServings };
    }));
  }, []);

  const updateServings = useCallback((idx: number, delta: number) => {
    dirtyRef.current = true;
    setComponents((prev) => prev.map((c, i) => {
      if (i !== idx || !c.servingSizeGrams || c.servingSizeGrams <= 0) return c;
      const newServings = Math.max(0.5, Math.round((c.servings + delta) * 10) / 10);
      return { ...c, servings: newServings, grams: Math.round(newServings * c.servingSizeGrams) };
    }));
  }, []);

  const updateServingsFromText = useCallback((idx: number, t: string, c: EditableComponent) => {
    const n = parseFloat(t);
    if (isNaN(n) || n <= 0 || !c.servingSizeGrams || c.servingSizeGrams <= 0) return;
    dirtyRef.current = true;
    const s = Math.round(n * 10) / 10;
    setComponents((prev) => prev.map((comp, i) => i === idx ? { ...comp, servings: s, grams: Math.round(s * c.servingSizeGrams!) } : comp));
  }, []);

  const updateName = useCallback((idx: number, name: string) => {
    dirtyRef.current = true;
    setComponents((prev) => prev.map((c, i) => i === idx ? { ...c, food: { ...c.food, name, normalizedName: name.toLowerCase() } } : c));
  }, []);

  const updateUnitMode = useCallback((idx: number, mode: EditableComponent['unitMode']) => {
    dirtyRef.current = true;
    setComponents((prev) => prev.map((c, i) => {
      if (i !== idx || c.unitMode === mode) return c;
      const newGrams = mode === 'servings' && c.servingSizeGrams && c.servingSizeGrams > 0 ? Math.round(c.servings * c.servingSizeGrams) : c.grams;
      return { ...c, unitMode: mode, grams: newGrams };
    }));
  }, []);

  const updatePer100g = useCallback((idx: number, field: keyof EditableComponent['per100g'], value: number) => {
    dirtyRef.current = true;
    const rounded = field === 'calories' ? Math.round(value) : Math.round(value * 10) / 10;
    setComponents((prev) => prev.map((c, i) => i === idx ? { ...c, per100g: { ...c.per100g, [field]: rounded } } : c));
  }, []);

  const removeComponent = useCallback((idx: number) => {
    dirtyRef.current = true;
    setComponents((prev) => {
      const next = [...prev];
      const [comp] = next.splice(idx, 1);
      if (comp) {
        if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
        setRemoved({ comp, idx });
        removeTimerRef.current = setTimeout(() => setRemoved(null), 5000);
      }
      return next;
    });
    if (expandedIndex === idx) setExpandedIndex(null);
    if (expandedIndex != null && expandedIndex > idx) setExpandedIndex(expandedIndex - 1);
  }, [expandedIndex]);

  const undoRemove = useCallback(() => {
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    setRemoved((current) => {
      if (!current) return null;
      setComponents((prev) => {
        const next = [...prev];
        next.splice(Math.min(current.idx, next.length), 0, current.comp);
        return next;
      });
      return null;
    });
  }, []);

  const handleAddFoods = useCallback((foods: FoodResult[]) => {
    dirtyRef.current = true;
    setComponents((prev) => [...prev, ...foods.map(toEditable)]);
  }, []);

  const handleLogMeal = useCallback(async () => {
    if (components.length === 0) return;
    setLogging(true);
    try {
      const logDate = todayISO();
      const mealId = await insertMeal({ name: mealName.trim() || 'Meal', log_date: logDate, meal_type: meal });
      const logIds: number[] = [];
      for (const comp of components) {
        const ratio = comp.grams / 100;
        const cal = Math.round(comp.per100g.calories * ratio);
        const pro = Math.round(comp.per100g.protein * ratio * 10) / 10;
        const carb = Math.round(comp.per100g.carbs * ratio * 10) / 10;
        const fat = Math.round(comp.per100g.fat * ratio * 10) / 10;
        const logId = await insertFoodLog({
          log_date: logDate, name: comp.food.name, source: (comp.food.source as 'describe' | 'manual') || 'manual',
          source_food_id: comp.food.sourceFoodId || undefined, meal, meal_id: mealId, brand: comp.food.brand,
          data_type: comp.food.dataType, preparation: comp.food.preparation, grams_logged: comp.grams,
          serving_size_g: comp.servingSizeGrams ?? comp.grams, serving_label: comp.servingLabel,
          calories_per_100g: comp.per100g.calories, protein_g_per_100g: comp.per100g.protein,
          carbs_g_per_100g: comp.per100g.carbs, fat_g_per_100g: comp.per100g.fat,
          calories: cal, protein_g: pro, carbs_g: carb, fat_g: fat,
        });
        logIds.push(logId);
      }
      loggedRef.current = true;
      onLogComplete({ mealId, logIds, meal, name: mealName.trim() || 'Meal' });
    } finally { setLogging(false); }
  }, [components, mealName, meal, onLogComplete]);

  return (
    <View className="flex-1">
      <View className="px-5 pt-2 pb-2 gap-1">
        <Text className="text-[10px] text-m3-on-surface-variant font-semibold uppercase tracking-wider">Meal Name</Text>
        <TextInput
          value={mealName}
          onChangeText={(t) => { setMealName(t); dirtyRef.current = true; }}
          className="bg-m3-surface-container-high text-m3-on-surface font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
        />
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6 gap-4" keyboardShouldPersistTaps="handled">
        <View className="bg-m3-surface-container rounded-xl p-3 gap-2">
          <MacroChipGroup calories={totalMacros.calories} protein={totalMacros.protein} carbs={totalMacros.carbs} fat={totalMacros.fat} />
          <Text className="text-m3-on-surface-variant text-[10px] text-center">{totalMacros.totalGrams}g total</Text>
        </View>

        <View className="gap-2">
          <Text className="text-[10px] text-m3-on-surface-variant font-semibold uppercase tracking-wider pl-2">Components</Text>
          {components.map((comp, idx) => {
            const isExpanded = expandedIndex === idx;
            const ratio = comp.grams / 100;
            const cal = Math.round(comp.per100g.calories * ratio);
            const hasServing = !!(comp.servingSizeGrams && comp.servingSizeGrams > 0);
            const showServings = hasServing && comp.unitMode === 'servings';
            const servingDesc = () => comp.servingLabel ?? `${comp.servingSizeGrams}g`;

            return isExpanded ? (
              <View key={`${comp.food.id}-${idx}`} className="bg-m3-surface-container-high rounded-xl px-3 py-3 gap-3">
                <View className="flex-row justify-between items-center">
                  <TextInput
                    value={comp.food.name}
                    onChangeText={(t) => updateName(idx, t)}
                    className="flex-1 bg-m3-surface-container text-m3-on-surface font-medium text-sm rounded-lg px-3 py-2.5 border border-m3-outline-variant/50 mr-2"
                  />
                  <Pressable onPress={() => setExpandedIndex(null)} accessibilityRole="button" accessibilityLabel="Collapse" className="p-2 -mr-1">
                    <MaterialIcons name="expand-less" size={20} color="#c4c6d0" />
                  </Pressable>
                </View>

                <View className="flex-row gap-2">
                  {(['calories', 'protein', 'carbs', 'fat'] as const).map((field) => (
                    <View key={field} className="flex-1 gap-1">
                      <Text className={`text-[10px] ${field === 'protein' ? 'text-m3-protein' : field === 'carbs' ? 'text-m3-carbs' : field === 'fat' ? 'text-m3-fat' : 'text-white/70'} font-semibold tracking-wider`}>
                        {field === 'calories' ? 'CAL/100g' : field === 'protein' ? 'PRO' : field === 'carbs' ? 'CARB' : 'FAT'}
                      </Text>
                      <TextInput
                        value={String(comp.per100g[field])}
                        onChangeText={(t) => {
                          if (t === '') return;
                          const v = parseFloat(t);
                          if (isNaN(v) || v < 0) return;
                          updatePer100g(idx, field, v);
                        }}
                        keyboardType="numeric"
                        className="bg-m3-surface-container text-m3-on-surface text-sm font-medium rounded-lg px-2 py-2.5 border border-m3-outline-variant/50 text-center"
                      />
                    </View>
                  ))}
                </View>

                <View className="flex-row gap-1.5">
                  {hasServing && (
                    <Pressable onPress={() => updateUnitMode(idx, 'servings')} accessibilityRole="button" accessibilityState={{ selected: comp.unitMode === 'servings' }}
                      className={`flex-1 py-3 rounded-full items-center ${comp.unitMode === 'servings' ? 'bg-m3-surface-container' : 'bg-m3-surface-container-highest'}`}>
                      <Text className={`text-[10px] font-semibold ${comp.unitMode === 'servings' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>Servings</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => updateUnitMode(idx, 'grams')} accessibilityRole="button" accessibilityState={{ selected: comp.unitMode === 'grams' }}
                    className={`flex-1 py-3 rounded-full items-center ${comp.unitMode === 'grams' ? 'bg-m3-surface-container' : 'bg-m3-surface-container-highest'}`}>
                    <Text className={`text-[10px] font-semibold ${comp.unitMode === 'grams' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>Grams</Text>
                  </Pressable>
                  {comp.servingLabel && /ml\b/i.test(comp.servingLabel) && (
                    <Pressable onPress={() => updateUnitMode(idx, 'ml')} accessibilityRole="button" accessibilityState={{ selected: comp.unitMode === 'ml' }}
                      className={`flex-1 py-3 rounded-full items-center ${comp.unitMode === 'ml' ? 'bg-m3-surface-container' : 'bg-m3-surface-container-highest'}`}>
                      <Text className={`text-[10px] font-semibold ${comp.unitMode === 'ml' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>ml</Text>
                    </Pressable>
                  )}
                </View>

                {comp.unitMode === 'servings' && hasServing ? (
                  <View className="flex-row items-center justify-center gap-3">
                    <Pressable onPress={() => updateServings(idx, -0.5)} accessibilityRole="button" accessibilityLabel="Decrease servings"
                      className="w-11 h-11 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60">
                      <MaterialIcons name="remove" size={20} color="#e2e2e9" />
                    </Pressable>
                    <TextInput
                      value={comp.servings % 1 === 0 ? comp.servings.toFixed(0) : comp.servings.toFixed(1)}
                      onChangeText={(t) => updateServingsFromText(idx, t, comp)}
                      keyboardType="numeric" returnKeyType="done" onSubmitEditing={() => setExpandedIndex(null)}
                      className="w-10 text-center bg-m3-surface-container rounded-lg py-1 text-m3-on-surface text-sm font-bold num-tabular border border-m3-outline-variant/50"
                    />
                    <Pressable onPress={() => updateServings(idx, 0.5)} accessibilityRole="button" accessibilityLabel="Increase servings"
                      className="w-11 h-11 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60">
                      <MaterialIcons name="add" size={20} color="#e2e2e9" />
                    </Pressable>
                    <Text className="text-[10px] text-m3-on-surface-variant ml-1" numberOfLines={1}>
                      {comp.servingLabel ?? `${comp.servingSizeGrams}g`}{' · '}{comp.grams}g
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-center gap-3">
                    <TextInput
                      value={String(comp.grams)}
                      onChangeText={(t) => {
                        const v = parseFloat(t);
                        if (!isNaN(v) && v > 0) updateGrams(idx, v);
                      }}
                      keyboardType="numeric" returnKeyType="done" onSubmitEditing={() => setExpandedIndex(null)}
                      className="w-20 text-center bg-m3-surface-container rounded-lg py-2.5 px-2 text-m3-on-surface text-sm font-bold num-tabular border border-m3-outline-variant/50"
                    />
                    <Text className="text-[10px] text-m3-on-surface-variant">{comp.unitMode === 'ml' ? 'ml' : 'grams'}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View key={`${comp.food.id}-${idx}`} className="bg-m3-surface-container-high rounded-xl px-3 py-2.5 gap-1.5">
                <View className="flex-row items-center">
                  <Pressable onPress={() => setExpandedIndex(idx)} accessibilityRole="button" accessibilityLabel={`Edit ${comp.food.name}`} className="flex-1 mr-2">
                    <Text className="text-m3-on-surface font-medium text-sm" numberOfLines={1}>{comp.food.name}</Text>
                    {comp.food.brand && <Text className="text-m3-on-surface-variant text-[10px]" numberOfLines={1}>{comp.food.brand}</Text>}
                  </Pressable>
                  <Text className="text-m3-on-surface font-semibold text-xs num-tabular mr-1">{cal} kcal</Text>
                  <Pressable onPress={() => setExpandedIndex(idx)} accessibilityRole="button" accessibilityLabel={`Expand ${comp.food.name}`} className="p-1 -mx-1">
                    <MaterialIcons name="expand-more" size={16} color="#c4c6d0" />
                  </Pressable>
                  <Pressable onPress={() => removeComponent(idx)} accessibilityRole="button" accessibilityLabel={`Remove ${comp.food.name}`} className="p-2 -mr-1">
                    <MaterialIcons name="close" size={16} color="#c4c6d0" />
                  </Pressable>
                </View>
                <View className="flex-row items-center gap-2">
                  {showServings ? (
                    <>
                      <Pressable onPress={() => updateServings(idx, -0.5)} accessibilityRole="button" accessibilityLabel="Decrease servings"
                        className="w-9 h-9 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60">
                        <MaterialIcons name="remove" size={18} color="#e2e2e9" />
                      </Pressable>
                      <TextInput
                        value={comp.servings % 1 === 0 ? comp.servings.toFixed(0) : comp.servings.toFixed(1)}
                        onChangeText={(t) => updateServingsFromText(idx, t, comp)}
                        keyboardType="numeric" returnKeyType="done"
                        className="w-10 text-center bg-m3-surface-container rounded-lg py-1 text-m3-on-surface text-sm font-bold num-tabular border border-m3-outline-variant/50"
                      />
                      <Pressable onPress={() => updateServings(idx, 0.5)} accessibilityRole="button" accessibilityLabel="Increase servings"
                        className="w-9 h-9 rounded-full bg-m3-surface-container-highest items-center justify-center active:opacity-60">
                        <MaterialIcons name="add" size={18} color="#e2e2e9" />
                      </Pressable>
                      <Text className="text-[10px] text-m3-on-surface-variant ml-1" numberOfLines={1}>
                        {servingDesc()} per serving ({comp.grams}g)
                      </Text>
                    </>
                  ) : (
                    <Text className="text-[10px] text-m3-on-surface-variant">
                      {comp.grams}{comp.unitMode === 'ml' ? 'ml' : 'g'}
                      {!comp.food.estimatedGrams && !comp.food.servingSizeGrams ? ' (est.)' : ''}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <AddComponentSection onAdd={handleAddFoods} />
      </ScrollView>

      <View className="px-5 pb-4 pt-2 gap-3 border-t border-m3-outline-variant/30">
        <MealSelector value={meal} onChange={setMeal} />
        <PrimaryButton title="Log Meal" icon="check" iconPosition="left" onPress={handleLogMeal} loading={logging} disabled={components.length === 0} />
      </View>

      {removed && (
        <View className="absolute bottom-32 left-5 right-5 bg-m3-surface-container-highest rounded-2xl px-4 py-3 flex-row items-center border border-m3-outline-variant/30">
          <Text className="flex-1 text-m3-on-surface text-sm font-medium">Component removed</Text>
          <Pressable onPress={undoRemove} accessibilityRole="button" accessibilityLabel="Undo remove" className="px-3 py-2">
            <Text className="text-white font-bold text-sm">Undo</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}