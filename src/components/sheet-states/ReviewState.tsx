import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeInUp,
  FadeOutDown,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MealType, saveMealWithComponents } from '../../db/database';
import { FoodResult } from '../../services/foodSearch';
import { DescribeResult } from '../../services/foodScan';
import { EASING } from '../../theme/motion';
import { defaultMealForNow, todayISO } from '../../utils/calculations';
import { useToday } from '../../hooks/useToday';
import { useDiscardGuardContext } from './useDiscardGuard';
import AddComponentSection from '../AddComponentSection';
import MealSelector from '../MealSelector';
import MacroChipGroup from '../MacroChipGroup';
import PortionStepper from '../PortionStepper';
import PrimaryButton from '../PrimaryButton';
import DateSelector from '../DateSelector';
import MealPhotoEditor from '../MealPhotoEditor';
import { formatDayHeader, isoFromDate, parseLocalISO } from '../../utils/calendar';
import { M3 } from '../../theme/tokens';

interface EditableComponent {
  food: FoodResult;
  per100g: { calories: number; protein: number; carbs: number; fat: number };
  grams: number;
  servings: number;
  servingSizeGrams: number | null;
  servingLabel: string | null;
  unitMode: 'servings' | 'grams' | 'ml';
  originalName: string;
}

type UndoAction =
  | { kind: 'remove'; comp: EditableComponent; idx: number }
  | { kind: 'meal-reestimate'; components: EditableComponent[]; mealName: string }
  | { kind: 'component-reestimate'; previous: EditableComponent; replacementId: string };

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
    originalName: food.name,
  };
}

interface ReviewStateProps {
  result: DescribeResult | null;
  /** Existing or captured meal photo to persist with the meal. */
  photoUri?: string | null;
  onLogComplete: (info: { mealId: number; logIds: number[]; meal: MealType; name: string; calories: number; wasUpdate: boolean; logDate: string }) => void;
  onClarify: (name: string) => Promise<DescribeResult | null>;
  onClarifyComponent: (name: string) => Promise<FoodResult | null>;
  editMealId?: number | null;
  initialMeal?: MealType | null;
  /** Diary date to write to (backfill); null = today. Preserves the original date when editing a meal. */
  logDate?: string | null;
  onGoBack: () => boolean;
}

function MacroTextInput({ value, onValueChange }: { value: number; onValueChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <BottomSheetTextInput
      value={draft}
      onChangeText={(text) => {
        setDraft(text);
        if (text === '') return;
        const nextValue = parseFloat(text);
        if (!isNaN(nextValue) && nextValue >= 0) onValueChange(nextValue);
      }}
      onBlur={() => {
        if (draft === '' || isNaN(parseFloat(draft))) setDraft(String(value));
      }}
      keyboardType="numeric"
      className="bg-m3-surface-container text-m3-on-surface text-base font-medium rounded-xl px-3 py-3 border border-m3-outline-variant/50 text-center"
    />
  );
}

export default function ReviewState({ result, photoUri, onLogComplete, onClarify, onClarifyComponent, editMealId, initialMeal, logDate: logDateProp, onGoBack }: ReviewStateProps) {
  const [mealName, setMealName] = useState(result?.mealName ?? '');
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(photoUri ?? null);
  const [components, setComponents] = useState<EditableComponent[]>(() =>
    (result?.components ?? []).map(toEditable),
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [meal, setMeal] = useState<MealType>(() => initialMeal ?? defaultMealForNow());
  const [logDate, setLogDate] = useState(() => logDateProp ?? todayISO());
  const [dateSelectorVisible, setDateSelectorVisible] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [clarifying, setClarifying] = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);
  const [clarifyingComponentId, setClarifyingComponentId] = useState<string | null>(null);
  const [componentClarifyError, setComponentClarifyError] = useState<{ id: string; message: string } | null>(null);

  const dirtyRef = useRef(false);
  const loggedRef = useRef(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalMealNameRef = useRef(result?.mealName ?? '');
  const previousResultRef = useRef(result);
  const discardGuard = useDiscardGuardContext();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const logDateExplicitRef = useRef<boolean>(logDateProp != null);
  const effectiveLogDate = logDateExplicitRef.current ? logDate : today;

  useEffect(() => {
    if (previousResultRef.current === result) return;
    previousResultRef.current = result;
    if (result) {
      originalMealNameRef.current = result.mealName;
      setMealName(result.mealName);
      setComponents(result.components.map(toEditable));
      setExpandedIds(new Set());
      dirtyRef.current = false;
      loggedRef.current = false;
      setUndoAction(null);
    }
  }, [result]);

  useEffect(() => {
    setSelectedPhotoUri(photoUri ?? null);
  }, [editMealId, photoUri]);

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

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  const showUndo = useCallback((action: UndoAction) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(action);
    undoTimerRef.current = setTimeout(() => setUndoAction(null), 5000);
  }, []);

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
      const component = components[idx];
      if (!component) return;
      dirtyRef.current = true;
      showUndo({ kind: 'remove', comp: component, idx });
      setComponents((previous) => previous.filter((_, currentIndex) => currentIndex !== idx));
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(component.food.id);
        return next;
      });
    },
    [components, showUndo],
  );

  const undoLastAction = useCallback(() => {
    if (!undoAction) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(null);
    if (undoAction.kind === 'remove') {
      setComponents((previous) => {
        const next = [...previous];
        next.splice(Math.min(undoAction.idx, next.length), 0, undoAction.comp);
        return next;
      });
    } else if (undoAction.kind === 'meal-reestimate') {
      setMealName(undoAction.mealName);
      setComponents(undoAction.components);
    } else {
      setComponents((previous) => previous.map((component) =>
        component.food.id === undoAction.replacementId ? undoAction.previous : component,
      ));
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.delete(undoAction.replacementId)) next.add(undoAction.previous.food.id);
        return next;
      });
    }
  }, [undoAction]);

  const handleAddFoods = useCallback((foods: FoodResult[]) => {
    dirtyRef.current = true;
    setComponents((prev) => [...prev, ...foods.map(toEditable)]);
  }, []);

  const handlePhotoChange = useCallback((nextUri: string | null) => {
    setSelectedPhotoUri((currentUri) => {
      if (currentUri === nextUri) return currentUri;
      dirtyRef.current = true;
      return nextUri;
    });
  }, []);

  const handleLogMeal = useCallback(async () => {
    if (components.length === 0) return;
    const name = mealName.trim();
    if (!name) {
      setLogError('Name this meal before logging.');
      return;
    }
    setLogError(null);
    setLogging(true);
    try {
      const saved = await saveMealWithComponents({
        editMealId,
        name,
        log_date: effectiveLogDate,
        meal_type: meal,
        photo_uri: selectedPhotoUri,
        components: components.map((comp) => {
        const ratio = comp.grams / 100;
        const cal = Math.round(comp.per100g.calories * ratio);
        const pro = Math.round(comp.per100g.protein * ratio * 10) / 10;
        const carb = Math.round(comp.per100g.carbs * ratio * 10) / 10;
        const fat = Math.round(comp.per100g.fat * ratio * 10) / 10;
        return {
          log_date: effectiveLogDate,
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
      onLogComplete({ mealId: saved.mealId, logIds: saved.logIds, meal, name, calories: totalMacros.calories, wasUpdate: !!editMealId, logDate: effectiveLogDate });
    } catch (e) {
      console.error('[MealReview] save failed', e);
      setLogError(editMealId
        ? "Couldn't update this meal. Your changes are still here."
        : "Couldn't save this meal. Try again.");
    } finally {
      setLogging(false);
    }
  }, [components, mealName, meal, onLogComplete, editMealId, effectiveLogDate, selectedPhotoUri, totalMacros.calories]);

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
      dirtyRef.current = true;
      showUndo({ kind: 'meal-reestimate', components, mealName });
      setComponents(newResult.components.map(toEditable));
      setExpandedIds(new Set());
    } catch {
      setClarifyError('Re-estimate failed. Check your connection.');
    } finally {
      setClarifying(false);
    }
  }, [mealName, clarifying, onClarify, components, showUndo]);

  const handleClarifyComponent = useCallback(async (component: EditableComponent) => {
    const name = component.food.name.trim();
    if (!name || clarifyingComponentId) return;
    setComponentClarifyError(null);
    setClarifyingComponentId(component.food.id);
    try {
      const clarified = await onClarifyComponent(name);
      if (!clarified) {
        setComponentClarifyError({ id: component.food.id, message: "Couldn't re-estimate. Try a more specific name." });
        return;
      }
      dirtyRef.current = true;
      showUndo({ kind: 'component-reestimate', previous: component, replacementId: clarified.id });
      setComponents((previous) => previous.map((current) =>
        current.food.id === component.food.id ? toEditable(clarified) : current,
      ));
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.delete(component.food.id)) next.add(clarified.id);
        return next;
      });
    } catch {
      setComponentClarifyError({ id: component.food.id, message: 'Re-estimate failed. Check your connection.' });
    } finally {
      setClarifyingComponentId(null);
    }
  }, [clarifyingComponentId, onClarifyComponent, showUndo]);

  return (
    <View className="flex-1">
      <View className="px-5 pt-2 pb-2 gap-2">
        <View className="h-12 flex-row items-center">
          <Pressable
            onPress={onGoBack}
            accessibilityRole="button"
            accessibilityLabel="Back to logging options"
            className="w-12 h-12 -ml-3 items-center justify-center active:opacity-60"
          >
            <MaterialIcons name="arrow-back" size={20} color={M3.onSurfaceVariant} />
          </Pressable>
          <Text className="text-m3-on-surface text-lg font-bold">Review meal</Text>
        </View>
        <Text className="text-compact text-m3-on-surface-variant font-semibold px-1">Meal name</Text>
        <View className="flex-row items-center gap-2">
          <BottomSheetTextInput
            value={mealName}
            onChangeText={(t) => {
              setMealName(t);
              setClarifyError(null);
              setLogError(null);
              dirtyRef.current = true;
            }}
            className="flex-1 text-m3-on-surface font-semibold text-lg bg-m3-surface-container-high rounded-xl px-4 py-3 border border-m3-outline-variant/50"
          />
          {mealName.trim() !== originalMealNameRef.current && (
            <Pressable
              onPress={handleClarify}
              disabled={clarifying}
              accessibilityRole="button"
              accessibilityLabel="Re-estimate meal with AI"
              accessibilityHint="Replaces the meal estimate. Undo restores the previous values."
              className="bg-m3-surface-container-high rounded-xl px-4 py-3 items-center justify-center border border-m3-outline-variant/50 active:opacity-60"
              style={{ minWidth: 48, minHeight: 48 }}
            >
              {clarifying ? (
                  <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
              ) : (
                <Text className="text-m3-on-surface text-xs font-semibold">Re-estimate</Text>
              )}
            </Pressable>
          )}
        </View>
        {clarifyError && (
          <Text className="text-m3-error text-xs pl-2">{clarifyError}</Text>
        )}
        {mealName.trim() !== originalMealNameRef.current && (
          <Text className="text-m3-on-surface-variant text-xs px-1">Re-estimate updates nutrition and portions. Undo restores your edit.</Text>
        )}
      </View>

      <BottomSheetScrollView
        className="flex-1 px-5"
        contentContainerClassName="pb-4"
        keyboardShouldPersistTaps="handled"
      >
        <MealPhotoEditor
          value={selectedPhotoUri}
          onChange={handlePhotoChange}
          disabled={logging}
        />

        <View className="pt-4 pb-6 items-center gap-2">
          <View className="items-center">
            <Text className="text-m3-on-surface text-4xl font-bold tabular-nums">
              {totalMacros.calories}
              <Text className="text-m3-on-surface-variant text-sm font-medium"> kcal</Text>
            </Text>
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

        {components.map((comp, idx) => {
          const isExpanded = expandedIds.has(comp.food.id);
          const ratio = comp.grams / 100;
          const cal = Math.round(comp.per100g.calories * ratio);
          const hasServing = !!(comp.servingSizeGrams && comp.servingSizeGrams > 0);
          const showMl = !!(comp.servingLabel && /ml\b/i.test(comp.servingLabel));

          return (
            <View key={comp.food.id} className="border-b border-m3-outline-variant/20">
              <Animated.View
                layout={reducedMotion ? undefined : LinearTransition.duration(200).easing(EASING.emphasized)}
                className={isExpanded ? 'py-4 gap-4 overflow-hidden' : 'flex-row items-center py-3.5 overflow-hidden'}
              >
                {isExpanded ? (
                  <>
                    <Text className="text-compact text-m3-on-surface-variant font-semibold uppercase tracking-wider">Food</Text>
                    <View className="flex-row items-center gap-2">
                      <BottomSheetTextInput
                        value={comp.food.name}
                        onChangeText={(t) => {
                          updateName(idx, t);
                          setComponentClarifyError((current) => current?.id === comp.food.id ? null : current);
                        }}
                        accessibilityLabel={`Food name, ${comp.food.name}`}
                        className="flex-1 bg-m3-surface-container-high text-m3-on-surface font-medium text-base rounded-xl px-4 py-3 border border-m3-outline-variant/50"
                      />
                      {comp.food.name.trim() !== comp.originalName && (
                        <Pressable
                          onPress={() => void handleClarifyComponent(comp)}
                          disabled={clarifyingComponentId !== null}
                          accessibilityRole="button"
                          accessibilityLabel={`Re-estimate ${comp.food.name} with AI`}
                          accessibilityHint="Replaces this component estimate. Undo restores the previous values."
                          className="min-w-[84px] h-12 px-3 rounded-xl bg-m3-surface-container-high items-center justify-center border border-m3-outline-variant/50 active:opacity-60"
                        >
                          {clarifyingComponentId === comp.food.id ? (
                            <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
                          ) : (
                            <Text className="text-m3-on-surface text-xs font-semibold">Re-estimate</Text>
                          )}
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => setExpandedIds((current) => {
                          const next = new Set(current);
                          next.delete(comp.food.id);
                          return next;
                        })}
                        accessibilityRole="button"
                        accessibilityLabel="Collapse food details"
                        className="w-12 h-12 items-center justify-center -mr-1 active:opacity-60"
                      >
                        <MaterialIcons name="expand-less" size={20} color={M3.onSurfaceVariant} />
                      </Pressable>
                    </View>
                    {componentClarifyError?.id === comp.food.id && (
                      <Text className="text-m3-error text-xs px-2" accessibilityLiveRegion="assertive">
                        {componentClarifyError.message}
                      </Text>
                    )}
                    {comp.food.name.trim() !== comp.originalName && (
                      <Text className="text-m3-on-surface-variant text-xs px-1">Re-estimate updates this component. Undo restores your edit.</Text>
                    )}

                    <View className="gap-2">
                      <Text className="text-compact text-m3-on-surface-variant font-semibold uppercase tracking-wider">Portion</Text>
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
                    </View>

                    <View className="gap-2">
                      <Text className="text-compact text-m3-on-surface-variant font-semibold uppercase tracking-wider">
                        Nutrition {comp.unitMode === 'servings' ? 'per serving' : comp.unitMode === 'ml' ? 'per 100ml' : 'per 100g'}
                      </Text>
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
                              <MacroTextInput
                                value={displayVal}
                                onValueChange={(v) => {
                                  const mul = comp.unitMode === 'servings'
                                    ? (comp.servingSizeGrams ?? 100) / 100
                                    : 1;
                                  const per100gVal = mul === 1 ? v : field === 'calories'
                                    ? Math.round(v / mul)
                                    : Math.round(v / mul * 10) / 10;
                                  updatePer100g(idx, field, per100gVal);
                                }}
                              />
                              <Text className={`text-compact text-center font-medium ${
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
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={() => setExpandedIds((current) => new Set(current).add(comp.food.id))}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${comp.food.name}, ${cal} calories`}
                      accessibilityHint="Opens food details and portion controls"
                      className="flex-1 flex-row items-center mr-2 active:opacity-60 min-h-[48px]"
                    >
                      <View className="flex-1">
                        <Text className="text-m3-on-surface font-medium text-base" numberOfLines={1}>{comp.food.name}</Text>
                        <View className="flex-row items-center gap-1 mt-0.5">
                          <Text className="text-m3-on-surface-variant text-xs" numberOfLines={1}>
                            {showMl
                              ? `${comp.grams}ml`
                              : hasServing && comp.unitMode === 'servings'
                                ? `${comp.servings % 1 === 0 ? comp.servings.toFixed(0) : comp.servings.toFixed(1)} × ${comp.servingLabel ?? `${comp.servingSizeGrams}g`} (${comp.grams}g)`
                                : `${comp.grams}g`}
                          </Text>
                          {comp.food.brand ? <Text className="text-m3-on-surface-variant text-xs" numberOfLines={1}>· {comp.food.brand}</Text> : null}
                        </View>
                      </View>
                      <Text className="text-m3-on-surface font-semibold text-sm tabular-nums mr-1">{cal} kcal</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeComponent(idx)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${comp.food.name}`}
                      className="w-12 h-12 items-center justify-center -mr-1 active:opacity-60"
                    >
                      <MaterialIcons name="close" size={14} color={M3.onSurfaceVariant} />
                    </Pressable>
                  </>
                )}
              </Animated.View>
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
        {undoAction && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeInUp.duration(200)}
            exiting={reducedMotion ? undefined : FadeOutDown.duration(150)}
            className="bg-m3-surface-container-highest rounded-2xl px-4 py-3 flex-row items-center border border-m3-outline-variant/30"
          >
            <View className="flex-row items-center flex-1 gap-2">
              <MaterialIcons name="undo" size={16} color={M3.onSurfaceVariant} />
              <Text className="flex-1 text-m3-on-surface text-sm font-medium" numberOfLines={1}>
                {undoAction.kind === 'remove'
                  ? `${undoAction.comp.food.name} removed`
                  : undoAction.kind === 'meal-reestimate'
                    ? 'Meal re-estimated'
                    : 'Component re-estimated'}
              </Text>
            </View>
            <Pressable
              onPress={undoLastAction}
              accessibilityRole="button"
              accessibilityLabel="Undo last change"
              className="px-3 py-1.5 bg-m3-surface-container rounded-full active:opacity-60"
            >
              <Text className="text-white font-bold text-xs">Undo</Text>
            </Pressable>
          </Animated.View>
        )}
        <Text className="text-compact text-m3-on-surface-variant font-semibold uppercase tracking-wider px-1">Logging details</Text>
        <Pressable
          onPress={() => setDateSelectorVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={`Log date, ${formatDayHeader(effectiveLogDate)}`}
          className="min-h-[48px] flex-row items-center rounded-2xl bg-m3-surface-container-high px-4 border border-m3-outline-variant/30 active:opacity-70"
        >
          <MaterialIcons name="event" size={18} color={M3.onSurfaceVariant} />
          <View className="flex-1 ml-3">
            <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider">
              Date
            </Text>
            <Text className="text-m3-on-surface text-sm font-semibold">
              {formatDayHeader(effectiveLogDate)}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={M3.onSurfaceVariant} />
        </Pressable>
        <MealSelector value={meal} onChange={setMeal} />
        <PrimaryButton
          title={editMealId ? 'Update Meal' : 'Log Meal'}
          icon="check"
          iconPosition="left"
          onPress={handleLogMeal}
          loading={logging}
          disabled={components.length === 0 || !mealName.trim()}
        />
        {logError && (
          <Text className="text-m3-error text-xs font-medium" accessibilityLiveRegion="assertive">
            {logError}
          </Text>
        )}
      </View>
      <DateSelector
        visible={dateSelectorVisible}
        value={parseLocalISO(effectiveLogDate)}
        minimumDate={new Date(1900, 0, 1)}
        maximumDate={parseLocalISO(todayISO())}
        onCancel={() => setDateSelectorVisible(false)}
        onConfirm={(date) => {
          setDateSelectorVisible(false);
          const nextDate = isoFromDate(date);
          logDateExplicitRef.current = true;
          if (nextDate === logDate) return;
          dirtyRef.current = true;
          setLogDate(nextDate);
        }}
      />
    </View>
  );
}
