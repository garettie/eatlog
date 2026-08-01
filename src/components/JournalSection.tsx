import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Reanimated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Swipeable, RectButton } from 'react-native-gesture-handler';

import { FoodLog } from '../db/database';
import { DURATION, EASING } from '../theme/motion';
import { M3 } from '../theme/tokens';
import { foodIcon } from '../utils/foodIcons';
import NutritionCard from './NutritionCard';

function kcalLabel(calories: number): string {
  return `${Math.round(calories)} kcal`;
}

function MacroPill({ letter, grams, color }: { letter: string; grams: number; color: string }) {
  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: color + '1A' }}
    >
      <Text
        className="text-compact font-bold tabular-nums"
        style={{ color }}
      >
        {letter} {Math.round(grams)}g
      </Text>
    </View>
  );
}

function MacroPills({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  return (
    <View className="flex-row gap-1.5 flex-wrap">
      <MacroPill letter="P" grams={protein} color={M3.protein} />
      <MacroPill letter="C" grams={carbs} color={M3.carbs} />
      <MacroPill letter="F" grams={fat} color={M3.fat} />
    </View>
  );
}

// ── Rotating chevron (UI thread) ─────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  const rot = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    rot.value = withTiming(open ? 1 : 0, { duration: reduced ? 0 : 200 });
  }, [open, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value * 180}deg` }],
  }));

  return (
    <Reanimated.View style={style}>
      <MaterialIcons name="expand-more" size={18} color={M3.onSurfaceVariant} />
    </Reanimated.View>
  );
}

// ── Swipeable Row ────────────────────────────────────────────────────────

function SwipeRow({
  children,
  identity,
  onDelete,
}: {
  children: React.ReactNode;
  identity: string;
  onDelete: () => void;
}) {
  const ref = React.useRef<Swipeable>(null);
  const hasActiveSwipe = React.useRef(false);

  useLayoutEffect(() => {
    if (!hasActiveSwipe.current) return;
    ref.current?.reset();
    hasActiveSwipe.current = false;
  }, [identity]);

  const renderRightActions = () => (
    <RectButton
      onPress={() => {
        onDelete();
        ref.current?.close();
      }}
      style={{
        backgroundColor: M3.errorContainer,
        alignItems: 'center',
        justifyContent: 'center',
        width: 72,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
      }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Delete entry"
    >
      <MaterialIcons name="delete-outline" size={18} color={M3.error} />
      <Text className="text-m3-error text-xs font-semibold mt-1">Delete</Text>
    </RectButton>
  );

  return (
    <Swipeable
      ref={ref}
      renderRightActions={renderRightActions}
      onSwipeableOpenStartDrag={() => {
        hasActiveSwipe.current = true;
      }}
      onSwipeableCloseStartDrag={() => {
        hasActiveSwipe.current = true;
      }}
      onSwipeableOpen={() => {
        hasActiveSwipe.current = true;
      }}
      onSwipeableClose={() => {
        hasActiveSwipe.current = false;
      }}
      friction={2}
      rightThreshold={48}
      overshootRight={false}
      containerStyle={{
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      {children}
    </Swipeable>
  );
}

// ── Food Row ─────────────────────────────────────────────────────────────

function FoodRow({
  food,
  onEdit,
  onDelete,
}: {
  food: FoodLog;
  onEdit: (food: FoodLog) => void;
  onDelete: (food: FoodLog) => void;
}) {
  return (
    <SwipeRow identity={`food-${food.id}`} onDelete={() => onDelete(food)}>
      <View className="rounded-2xl overflow-hidden bg-m3-surface-container border border-m3-outline-variant/30">
        <Pressable
          onPress={() => onEdit(food)}
          className="flex-row items-stretch min-h-[96px] active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel={`${food.name}, ${Math.round(food.calories)} calories`}
          accessibilityHint="Opens portion editor. Swipe left to delete."
          accessibilityActions={[{ name: 'activate', label: 'Edit' }, { name: 'delete', label: 'Delete' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'delete') onDelete(food);
            else onEdit(food);
          }}
        >
          <View className="w-20 h-20 self-center items-center justify-center">
            <View className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center">
              <MaterialCommunityIcons name={foodIcon(food.name)} size={20} color={M3.onSurfaceVariant} />
            </View>
          </View>
          <View className="flex-1 min-w-0 px-4 py-3">
            <Text className="text-m3-on-surface text-base font-semibold leading-5" numberOfLines={2}>
              {food.name}
            </Text>
            <Text className="text-m3-on-surface-variant text-xs mt-0.5 tabular-nums">
              {food.serving_label ? `${food.serving_label}` : ''}
              {food.grams_logged ? `${food.serving_label ? ' · ' : ''}${Math.round(food.grams_logged)}g` : ''}
            </Text>
            <View className="mt-2">
              <MacroPills protein={food.protein_g} carbs={food.carbs_g} fat={food.fat_g} />
            </View>
          </View>
          <View className="w-24 shrink-0 items-end pt-3 pr-5">
            <Text className="text-m3-on-surface text-base font-bold tabular-nums">
              {Math.round(food.calories)}
              <Text className="text-m3-on-surface-variant text-compact font-medium"> kcal</Text>
            </Text>
          </View>
        </Pressable>
      </View>
    </SwipeRow>
  );
}

// ── Meal Row ─────────────────────────────────────────────────────────────

export interface MealGroup {
  id: number;
  name: string;
  photoUri?: string | null;
  components: FoodLog[];
}

function MealRow({
  meal,
  onEditMeal,
  onDeleteMeal,
  onViewPhoto,
}: {
  meal: MealGroup;
  onEditMeal: (meal: MealGroup) => void;
  onDeleteMeal: (mealId: number) => void;
  onViewPhoto: (uri: string, mealName: string) => void;
}) {
  const totalCalories = meal.components.reduce((s, c) => s + c.calories, 0);
  const totalP = meal.components.reduce((s, c) => s + c.protein_g, 0);
  const totalC = meal.components.reduce((s, c) => s + c.carbs_g, 0);
  const totalF = meal.components.reduce((s, c) => s + c.fat_g, 0);

  return (
    <SwipeRow identity={`meal-${meal.id}`} onDelete={() => onDeleteMeal(meal.id)}>
      <NutritionCard
        name={meal.name}
        photoUri={meal.photoUri}
        secondaryText={`${meal.components.length} ${meal.components.length === 1 ? 'item' : 'items'}`}
        calories={totalCalories}
        protein={totalP}
        carbs={totalC}
        fat={totalF}
        onPress={() => onEditMeal(meal)}
        accessibilityHint="Opens meal editor. Swipe left to delete."
        accessibilityActions={[{ name: 'activate', label: 'Edit' }, { name: 'delete', label: 'Delete' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') onDeleteMeal(meal.id);
          else onEditMeal(meal);
        }}
        onPressPhoto={(uri) => onViewPhoto(uri, meal.name)}
      />
    </SwipeRow>
  );
}

// ── Section Types ────────────────────────────────────────────────────────

export interface JournalEntryKind {
  type: 'food' | 'meal';
  foodLog?: FoodLog;
  mealGroup?: MealGroup;
}

export function JournalEntryRow({
  entry,
  onEditFood,
  onEditMeal,
  onDeleteFood,
  onDeleteMeal,
  onViewPhoto,
}: {
  entry: JournalEntryKind;
  onEditFood: (food: FoodLog) => void;
  onEditMeal: (meal: MealGroup) => void;
  onDeleteFood: (food: FoodLog) => void;
  onDeleteMeal: (mealId: number) => void;
  onViewPhoto: (uri: string, mealName: string) => void;
}) {
  if (entry.type === 'food' && entry.foodLog) {
    return <FoodRow food={entry.foodLog} onEdit={onEditFood} onDelete={onDeleteFood} />;
  }
  if (entry.type === 'meal' && entry.mealGroup) {
    return (
      <MealRow
        meal={entry.mealGroup}
        onEditMeal={onEditMeal}
        onDeleteMeal={onDeleteMeal}
        onViewPhoto={onViewPhoto}
      />
    );
  }
  return null;
}

export function JournalSectionHeader({
  label,
  hasEntries,
  collapsed,
  totalCalories,
  totalProtein,
  totalCarbs,
  totalFat,
  onToggle,
}: {
  label: string;
  hasEntries: boolean;
  collapsed: boolean;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  onToggle: () => void;
}) {
  return (
    <>
      <Pressable
        onPress={onToggle}
        disabled={!hasEntries}
        className="flex-row items-center justify-between mx-4 py-4 active:opacity-60 min-h-[72]"
        accessibilityRole="button"
        accessibilityState={{ disabled: !hasEntries, expanded: hasEntries ? !collapsed : undefined }}
        accessibilityLabel={hasEntries
          ? `${label} section, ${collapsed ? 'collapsed' : 'expanded'}`
          : `${label} section, empty`}
      >
        <View className="flex-row items-center gap-2 flex-1 min-w-0 mr-3">
          <Text className="text-m3-on-surface text-base font-bold shrink" numberOfLines={1}>{label}</Text>
          <View className={hasEntries ? '' : 'opacity-30'}>
            <Chevron open={!collapsed} />
          </View>
        </View>
        <View className="min-w-[150px] min-h-[38px] items-end justify-center shrink-0">
          {hasEntries && (
            <>
              <Text className="text-m3-on-surface-variant text-xs font-semibold tabular-nums">{kcalLabel(totalCalories)}</Text>
              <View className="mt-1"><MacroPills protein={totalProtein} carbs={totalCarbs} fat={totalFat} /></View>
            </>
          )}
        </View>
      </Pressable>
      <View className="mx-4 h-px bg-m3-outline-variant/40" />
    </>
  );
}

interface JournalSectionProps {
  label: string;
  entries: JournalEntryKind[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  /** Changing this (e.g. selected diary date) resets collapse to the default for content. */
  resetKey?: string;
  onEditFood: (food: FoodLog) => void;
  onEditMeal: (meal: MealGroup) => void;
  onDeleteFood: (food: FoodLog) => void;
  onDeleteMeal: (mealId: number) => void;
  onViewPhoto: (uri: string, mealName: string) => void;
}

function JournalSection({
  label,
  entries,
  totalCalories,
  totalProtein,
  totalCarbs,
  totalFat,
  resetKey,
  onEditFood,
  onEditMeal,
  onDeleteFood,
  onDeleteMeal,
  onViewPhoto,
}: JournalSectionProps) {
  const hasEntries = entries.length > 0;
  const collapseKey = `${resetKey ?? ''}:${hasEntries ? 'filled' : 'empty'}`;
  const collapseStateRef = React.useRef({
    key: collapseKey,
    collapsed: !hasEntries,
    animateEntry: false,
  });
  const [, forceCollapseRender] = useState(0);
  if (collapseStateRef.current.key !== collapseKey) {
    collapseStateRef.current = { key: collapseKey, collapsed: !hasEntries, animateEntry: false };
  }
  const collapseState = collapseStateRef.current;
  const collapsed = collapseState.collapsed;
  const reducedMotion = useReducedMotion();

  return (
    <View className="mb-3">
      <JournalSectionHeader
        label={label}
        hasEntries={hasEntries}
        collapsed={collapsed}
        totalCalories={totalCalories}
        totalProtein={totalProtein}
        totalCarbs={totalCarbs}
        totalFat={totalFat}
        onToggle={() => {
          collapseStateRef.current = {
            key: collapseKey,
            collapsed: !collapsed,
            animateEntry: collapsed,
          };
          forceCollapseRender((version) => version + 1);
        }}
      />

      <Reanimated.View
        layout={reducedMotion
          ? undefined
          : LinearTransition.duration(DURATION.short).easing(EASING.emphasized)}
        className="overflow-hidden"
      >
        {hasEntries && !collapsed && (
          <Reanimated.View
            entering={!reducedMotion && collapseState.animateEntry ? FadeIn.duration(160) : undefined}
            exiting={!reducedMotion ? FadeOut.duration(160) : undefined}
            className="mt-2"
          >
            {entries.map((entry) => (
              <JournalEntryRow
                key={entry.type === 'food' ? `food-${entry.foodLog?.id}` : `meal-${entry.mealGroup?.id}`}
                entry={entry}
                onEditFood={onEditFood}
                onEditMeal={onEditMeal}
                onDeleteFood={onDeleteFood}
                onDeleteMeal={onDeleteMeal}
                onViewPhoto={onViewPhoto}
              />
            ))}
          </Reanimated.View>
        )}
      </Reanimated.View>
    </View>
  );
}

export default React.memo(JournalSection);
