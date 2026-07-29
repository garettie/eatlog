import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MealType, saveMealWithComponents } from '../../db/database';
import { FoodResult } from '../../services/foodSearch';
import { DescribeResult } from '../../services/foodScan';
import { defaultMealForNow, todayISO } from '../../utils/calculations';
import { useDiscardGuardContext } from './useDiscardGuard';
import AddComponentSection from '../AddComponentSection';
import MealSelector from '../MealSelector';
import MacroChipGroup from '../MacroChipGroup';
import PortionStepper from '../PortionStepper';
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

interface ReviewStateProps {
  result: DescribeResult | null;
  /** Saved scan photo to persist on the new meal (null for describe/search flows). */
  photoUri?: string | null;
  onLogComplete: (info: { mealId: number; logIds: number[]; meal: MealType; name: string }) => void;
  onClarify: (name: string) => Promise<DescribeResult | null>;
  editMealId?: number | null;
  initialMeal?: MealType | null;
  /** Diary date to write to (backfill); null = today. Preserves the original date when editing a meal. */
  logDate?: string | null;
}

export default function ReviewState({ result, photoUri, onLogComplete, onClarify, editMealId, initialMeal, logDate: logDateProp }: ReviewStateProps) {
  const [mealName, setMealName] = useState(result?.mealName ?? '');
  const [components, setComponents] = useState<EditableComponent[]>(() =>
    (result?.components ?? []).map(toEditable),
  );
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [meal, setMeal] = useState<MealType>(() => initialMeal ?? defaultMealForNow());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ comp: EditableComponent; idx: number } | null>(null);
  const [clarifying, setClarifying] = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);

  const dirtyRef = useRef(false);
  const loggedRef = useRef(false);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalMealNameRef = useRef(result?.mealName ?? '');
  const previousResultRef = useRef(result);
  const discardGuard = useDiscardGuardContext();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (previousResultRef.current === result) return;
    previousResultRef.current = result;
    if (result) {
      originalMealNameRef.current = result.mealName;
      setMealName(result.mealName);
      setComponents(result.components.map(toEditable));
      setExpandedIndex(null);
      dirtyRef.current = false;
      loggedRef.current = false;
      setRemoved(null);
    }
  }, [result]);

  useEffect(() => {
    const unregister = discardGuard.register(
      () => dirtyRef.current && !loggedRef.current,
      () => {
        dirtyRef.current = false;
        loggedRef.current = false;
      },
    );
    return unregister;
  }, [discardGuard]);

  const totalMacros = useMemo(() => {
    let cal = 0,
      pro10 = 0,
      carb10 = 0,
      fat10 = 0,
      totalGrams = 0;
    for (const comp of components) {
      const ratio = comp.grams / 100;
      cal += Math.round(comp.per100g.calories * ratio);
      pro10 += Math.round(comp.per100g.protein * ratio * 10);
      carb10 += Math.round(comp.per100g.carbs * ratio * 10);
      fat10 += Math.round(comp.per100g.fat * ratio * 10);
      totalGrams += comp.grams;
    }
    return {
      calories: cal,
      protein: pro10 / 10,
      carbs: carb10 / 10,
      fat: fat10 / 10,
      totalGrams: Math.round(totalGrams),
    };
  }, [components]);

  const updateGrams = useCallback((idx: number, grams: number) => {
    dirtyRef.current = true;
    setComponents((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const g = Math.max(1, grams);
        const newServings =
          c.servingSizeGrams && c.servingSizeGrams > 0
            ? Math.round((g / c.servingSizeGrams) * 10) / 10
            : c.servings;
        return { ...c, grams: g, servings: newServings };
      }),
    );
  }, []);

  const updateServings = useCallback((idx: number, delta: number) => {
    dirtyRef.current = true;
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

  const updateServingsFromText = useCallback(
    (idx: number, t: string, c: EditableComponent) => {
      const n = parseFloat(t);
      if (isNaN(n) || n <= 0 || !c.servingSizeGrams || c.servingSizeGrams <= 0) return;
      dirtyRef.current = true;
      const s = Math.round(n * 10) / 10;
      setComponents((prev) =>
        prev.map((comp, i) =>
          i === idx
            ? { ...comp, servings: s, grams: Math.round(s * c.servingSizeGrams!) }
            : comp,
        ),
      );
    },
    [],
  );

  const updateName = useCallback((idx: number, name: string) => {
    dirtyRef.current = true;
    setComponents((prev) =>
      prev.map((c, i) =>
        i === idx
          ? { ...c, food: { ...c.food, name, normalizedName: name.toLowerCase() } }
          : c,
      ),
    );
  }, []);

  const updateUnitMode = useCallback((idx: number, mode: EditableComponent['unitMode']) => {
    dirtyRef.current = true;
    setComponents((prev) =>
      prev.map((c, i) => {
        if (i !== idx || c.unitMode === mode) return c;
        const newGrams =
          mode === 'servings' && c.servingSizeGrams && c.servingSizeGrams > 0
            ? Math.round(c.servings * c.servingSizeGrams)
            : c.grams;
        return { ...c, unitMode: mode, grams: newGrams };
      }),
    );
  }, []);

  const updatePer100g = useCallback(
    (idx: number, field: keyof EditableComponent['per100g'], value: number) => {
      dirtyRef.current = true;
      const rounded = field === 'calories' ? Math.round(value) : Math.round(value * 10) / 10;
      setComponents((prev) =>
        prev.map((c, i) =>
          i === idx ? { ...c, per100g: { ...c.per100g, [field]: rounded } } : c,
        ),
      );
    },
    [],
  );

  const removeComponent = useCallback(
    (idx: number) => {
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
    },
    [expandedIndex],
  );

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
    setLogError(null);
    setLogging(true);
    try {
      const logDate = logDateProp ?? todayISO();
      const name = mealName.trim() || 'Meal';

      const saved = await saveMealWithComponents({
        editMealId,
        name,
        log_date: logDate,
        meal_type: meal,
        photo_uri: photoUri ?? null,
        components: components.map((comp) => {
        const ratio = comp.grams / 100;
        const cal = Math.round(comp.per100g.calories * ratio);
        const pro = Math.round(comp.per100g.protein * ratio * 10) / 10;
        const carb = Math.round(comp.per100g.carbs * ratio * 10) / 10;
        const fat = Math.round(comp.per100g.fat * ratio * 10) / 10;
        return {
          log_date: logDate,
          name: comp.food.name,
          source: (comp.food.source as 'describe' | 'manual') || 'manual',
          source_food_id: comp.food.sourceFoodId || undefined,
          meal,
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
        };
        }),
      });
      loggedRef.current = true;
      onLogComplete({ mealId: saved.mealId, logIds: saved.logIds, meal, name });
    } catch (e) {
      console.error('[MealReview] save failed', e);
      setLogError(editMealId
        ? "Couldn't update this meal. Your changes are still here."
        : "Couldn't save this meal. Try again.");
    } finally {
      setLogging(false);
    }
  }, [components, mealName, meal, onLogComplete, editMealId, logDateProp]);

  const handleClarify = useCallback(async () => {
    const name = mealName.trim();
    if (!name || clarifying) return;
    setClarifyError(null);
    setClarifying(true);
    try {
      const newResult = await onClarify(name);
      if (!newResult || newResult.components.length === 0) {
        setClarifyError("Couldn't re-estimate. Try a different name.");
        setClarifying(false);
        return;
      }
      originalMealNameRef.current = name;
      setComponents(newResult.components.map(toEditable));
      setExpandedIndex(null);
    } catch {
      setClarifyError('Re-estimate failed. Check your connection.');
    } finally {
      setClarifying(false);
    }
  }, [mealName, clarifying, onClarify]);

  return (
    <View className="flex-1">
      <View className="px-5 pt-3 pb-2 gap-2">
        <View className="flex-row items-center gap-2">
          <BottomSheetTextInput
            value={mealName}
            onChangeText={(t) => {
              setMealName(t);
              setClarifyError(null);
              dirtyRef.current = true;
            }}
            className="flex-1 text-m3-on-surface font-semibold text-lg bg-m3-surface-container-high rounded-xl px-4 py-3 border border-m3-outline-variant/50"
          />
          {mealName.trim() !== originalMealNameRef.current && (
            <Pressable
              onPress={handleClarify}
              disabled={clarifying}
              accessibilityRole="button"
              accessibilityLabel="Clarify with AI"
              className="bg-m3-surface-container-high rounded-xl px-4 py-3 items-center justify-center border border-m3-outline-variant/50 active:opacity-60"
              style={{ minWidth: 48, minHeight: 48 }}
            >
              {clarifying ? (
                <ActivityIndicator size="small" color="#c4c6d0" />
              ) : (
                <Text className="text-m3-on-surface text-xs font-semibold">Clarify</Text>
              )}
            </Pressable>
          )}
        </View>
        {clarifyError && (
          <Text className="text-m3-error text-xs pl-2">{clarifyError}</Text>
        )}
      </View>

      <View className="px-5 pt-4 pb-6 items-center gap-2">
        <View className="items-center">
          <Text className="text-m3-on-surface text-4xl font-bold tabular-nums">
            {totalMacros.calories}
            <Text className="text-m3-on-surface-variant text-sm font-medium"> kcal</Text>
          </Text>
          <Text className="text-[10px] text-m3-on-surface-variant font-medium mt-0.5">Calories</Text>
        </View>
        <View className="w-full">
          <MacroChipGroup
            protein={totalMacros.protein}
            carbs={totalMacros.carbs}
            fat={totalMacros.fat}
          />
        </View>
        <Text className="text-m3-on-surface-variant text-xs">{totalMacros.totalGrams}g total</Text>
      </View>

      <BottomSheetScrollView
        className="flex-1 px-5"
        contentContainerClassName="pb-4"
        keyboardShouldPersistTaps="handled"
      >
        {components.map((comp, idx) => {
          const isExpanded = expandedIndex === idx;
          const ratio = comp.grams / 100;
          const cal = Math.round(comp.per100g.calories * ratio);
          const hasServing = !!(comp.servingSizeGrams && comp.servingSizeGrams > 0);
          const showMl = !!(comp.servingLabel && /ml\b/i.test(comp.servingLabel));

          return (
            <View key={`${comp.food.id}-${idx}`} className="border-b border-m3-outline-variant/20">
              {isExpanded ? (
                <Animated.View
                  key={`exp-${comp.food.id}`}
                  entering={reducedMotion ? undefined : FadeInUp.duration(200)}
                  exiting={reducedMotion ? undefined : FadeOutDown.duration(150)}
                  className="py-4 gap-4"
                >
                  <View className="flex-row items-center gap-2">
                    <BottomSheetTextInput
                      value={comp.food.name}
                      onChangeText={(t) => updateName(idx, t)}
                      className="flex-1 bg-m3-surface-container-high text-m3-on-surface font-medium text-base rounded-xl px-4 py-3 border border-m3-outline-variant/50"
                    />
                    <Pressable
                      onPress={() => setExpandedIndex(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Collapse"
                      className="p-2 -mr-1 active:opacity-60"
                    >
                      <MaterialIcons name="expand-less" size={20} color="#c4c6d0" />
                    </Pressable>
                  </View>

                  <PortionStepper
                    unitMode={comp.unitMode}
                    servings={comp.servings}
                    grams={comp.grams}
                    servingSizeGrams={comp.servingSizeGrams}
                    servingLabel={comp.servingLabel}
                    hasServing={hasServing}
                    showMl={showMl}
                    onModeChange={(m) => updateUnitMode(idx, m)}
                    onServingsDelta={(d) => updateServings(idx, d)}
                    onServingsSet={(t) => updateServingsFromText(idx, t, comp)}
                    onGramsSet={(t) => {
                      const v = parseFloat(t);
                      if (!isNaN(v) && v > 0) updateGrams(idx, v);
                    }}
                  />

                  <View className="flex-row gap-3 items-end">
                    {(['calories', 'protein', 'carbs', 'fat'] as const).map((field) => {
                      const perServingMul = comp.unitMode === 'servings'
                        ? (comp.servingSizeGrams ?? 100) / 100
                        : 1;
                      const displayVal = perServingMul === 1
                        ? comp.per100g[field]
                        : field === 'calories'
                          ? Math.round(comp.per100g[field] * perServingMul)
                          : Math.round(comp.per100g[field] * perServingMul * 10) / 10;

                      return (
                        <View key={field} className="flex-1 gap-1">
                          <BottomSheetTextInput
                            value={String(displayVal)}
                            onChangeText={(t) => {
                              if (t === '') return;
                              const v = parseFloat(t);
                              if (isNaN(v) || v < 0) return;
                              const mul = comp.unitMode === 'servings'
                                ? (comp.servingSizeGrams ?? 100) / 100
                                : 1;
                              const per100gVal = mul === 1 ? v : field === 'calories'
                                ? Math.round(v / mul)
                                : Math.round(v / mul * 10) / 10;
                              updatePer100g(idx, field, per100gVal);
                            }}
                            keyboardType="numeric"
                            className="bg-m3-surface-container text-m3-on-surface text-base font-medium rounded-xl px-3 py-3 border border-m3-outline-variant/50 text-center"
                          />
                          <Text className={`text-[10px] text-center font-medium ${
                            field === 'protein'
                              ? 'text-m3-protein'
                              : field === 'carbs'
                                ? 'text-m3-carbs'
                                : field === 'fat'
                                  ? 'text-m3-fat'
                                  : 'text-m3-on-surface-variant'
                          }`}>
                            {field === 'calories' ? 'Calories' : field === 'protein' ? 'Protein' : field === 'carbs' ? 'Carbs' : 'Fat'}
                          </Text>
                        </View>
                      );
                    })}
                    <Text className="text-xs text-m3-on-surface-variant font-medium pb-3.5">
                      {comp.unitMode === 'servings' ? 'per serving' : comp.unitMode === 'ml' ? 'per 100ml' : 'per 100g'}
                    </Text>
                  </View>
                </Animated.View>
              ) : (
                <Animated.View
                  key={`col-${comp.food.id}`}
                  entering={reducedMotion ? undefined : FadeInUp.duration(200)}
                  exiting={reducedMotion ? undefined : FadeOutDown.duration(150)}
                  className="flex-row items-center py-3.5"
                >
                  <Pressable
                    onPress={() => setExpandedIndex(idx)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${comp.food.name}`}
                    className="flex-1 flex-row items-center mr-2 active:opacity-60"
                  >
                    <View className="flex-1">
                      <Text
                        className="text-m3-on-surface font-medium text-base"
                        numberOfLines={1}
                      >
                        {comp.food.name}
                      </Text>
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <Text className="text-m3-on-surface-variant text-xs" numberOfLines={1}>
                          {showMl
                            ? `${comp.grams}ml`
                            : hasServing && comp.unitMode === 'servings'
                              ? `${comp.servings % 1 === 0 ? comp.servings.toFixed(0) : comp.servings.toFixed(1)} × ${comp.servingLabel ?? `${comp.servingSizeGrams}g`} (${comp.grams}g)`
                              : `${comp.grams}g`}
                        </Text>
                        {comp.food.brand ? (
                          <Text className="text-m3-on-surface-variant text-xs" numberOfLines={1}>
                            · {comp.food.brand}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Text className="text-m3-on-surface font-semibold text-sm tabular-nums mr-1">
                      {cal} kcal
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeComponent(idx)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${comp.food.name}`}
                    className="p-2 -mr-1 active:opacity-60"
                  >
                    <MaterialIcons name="close" size={14} color="#c4c6d0" />
                  </Pressable>
                </Animated.View>
              )}
            </View>
          );
        })}

        <Animated.View
          entering={reducedMotion ? undefined : FadeInUp.duration(180).delay(components.length * 25)}
          className="pt-2"
        >
          <AddComponentSection onAdd={handleAddFoods} />
        </Animated.View>
      </BottomSheetScrollView>

      <View
        className="px-5 pt-2 gap-3 border-t border-m3-outline-variant/30"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        {removed && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeInUp.duration(200)}
            exiting={reducedMotion ? undefined : FadeOutDown.duration(150)}
            className="bg-m3-surface-container-highest rounded-2xl px-4 py-3 flex-row items-center border border-m3-outline-variant/30"
          >
            <View className="flex-row items-center flex-1 gap-2">
              <MaterialIcons name="undo" size={16} color="#c4c6d0" />
              <Text className="flex-1 text-m3-on-surface text-sm font-medium" numberOfLines={1}>
                {removed.comp.food.name} removed
              </Text>
            </View>
            <Pressable
              onPress={undoRemove}
              accessibilityRole="button"
              accessibilityLabel="Undo remove"
              className="px-3 py-1.5 bg-m3-surface-container rounded-full active:opacity-60"
            >
              <Text className="text-white font-bold text-xs">Undo</Text>
            </Pressable>
          </Animated.View>
        )}
        <MealSelector value={meal} onChange={setMeal} />
        <PrimaryButton
          title={editMealId ? 'Update Meal' : 'Log Meal'}
          icon="check"
          iconPosition="left"
          onPress={handleLogMeal}
          loading={logging}
          disabled={components.length === 0}
        />
        {logError && (
          <Text className="text-m3-error text-xs font-medium" accessibilityLiveRegion="assertive">
            {logError}
          </Text>
        )}
      </View>
    </View>
  );
}
