import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import Reanimated, { FadeIn, FadeOut, FadeInDown, Layout, useReducedMotion } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { Swipeable, RectButton } from 'react-native-gesture-handler';

import { FoodLog } from '../db/database';
import { M3 } from '../theme/tokens';

function sourceIcon(source: string): React.ComponentProps<typeof MaterialIcons>['name'] {
  switch (source) {
    case 'scan': return 'photo-camera';
    case 'describe': return 'edit-note';
    case 'manual': return 'edit';
    case 'usda':
    case 'off': return 'search';
    default: return 'restaurant';
  }
}

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
        className="text-[10px] font-bold tabular-nums"
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

// ── Swipeable Row ────────────────────────────────────────────────────────

function SwipeRow({
  children,
  onEdit,
  onDelete,
}: {
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = React.useRef<Swipeable>(null);

  const renderRightActions = () => (
    <View style={{ flexDirection: 'row' }}>
      <RectButton
        onPress={() => {
          onEdit();
          ref.current?.close();
        }}
        style={{
          backgroundColor: M3.surfaceContainerHighest,
          alignItems: 'center',
          justifyContent: 'center',
          width: 68,
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name="edit" size={18} color={M3.onSurfaceVariant} />
        <Text className="text-m3-on-surface-variant text-[10px] font-semibold mt-1">Edit</Text>
      </RectButton>
      <RectButton
        onPress={() => {
          onDelete();
          ref.current?.close();
        }}
        style={{
          backgroundColor: M3.errorContainer,
          alignItems: 'center',
          justifyContent: 'center',
          width: 78,
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name="delete-outline" size={18} color={M3.error} />
        <Text className="text-m3-error text-[10px] font-semibold mt-1">Delete</Text>
      </RectButton>
    </View>
  );

  return (
    <Swipeable
      ref={ref}
      renderRightActions={renderRightActions}
      rightThreshold={50}
      overshootRight={false}
      containerStyle={{ overflow: 'visible' }}
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
    <SwipeRow onEdit={() => onEdit(food)} onDelete={() => onDelete(food)}>
      <View className="flex-row items-start px-4 py-4 bg-m3-surface-container border-b border-m3-outline-variant/20 active:opacity-80">
        <View className="w-10 h-10 rounded-full bg-m3-surface-container-highest items-center justify-center mr-3 mt-0.5">
          <MaterialIcons name={sourceIcon(food.source)} size={18} color={M3.onSurfaceVariant} />
        </View>
        <View className="flex-1 mr-3">
          <Text className="text-m3-on-surface text-base font-medium" numberOfLines={1}>
            {food.name}
          </Text>
          <Text className="text-m3-on-surface-variant text-xs mt-0.5 num-tabular">
            {food.serving_label ? `${food.serving_label}` : ''}
            {food.grams_logged ? `${food.serving_label ? ' · ' : ''}${Math.round(food.grams_logged)}g` : ''}
          </Text>
          <View className="mt-2">
            <MacroPills protein={food.protein_g} carbs={food.carbs_g} fat={food.fat_g} />
          </View>
        </View>
        <View className="items-end pt-0.5">
          <Text className="text-m3-on-surface text-base font-bold tabular-nums">
            {Math.round(food.calories)}
            <Text className="text-m3-on-surface-variant text-xs font-medium"> kcal</Text>
          </Text>
        </View>
      </View>
    </SwipeRow>
  );
}

// ── Meal Row ─────────────────────────────────────────────────────────────

interface MealGroup {
  id: number;
  name: string;
  components: FoodLog[];
}

function MealRow({
  meal,
  onEditMeal,
  onDeleteMeal,
}: {
  meal: MealGroup;
  onEditMeal: (mealId: number) => void;
  onDeleteMeal: (mealId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const totalCalories = meal.components.reduce((s, c) => s + c.calories, 0);
  const totalP = meal.components.reduce((s, c) => s + c.protein_g, 0);
  const totalC = meal.components.reduce((s, c) => s + c.carbs_g, 0);
  const totalF = meal.components.reduce((s, c) => s + c.fat_g, 0);

  const toggleExpand = () => {
    Animated.timing(rotation, {
      toValue: expanded ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setExpanded(!expanded);
  };

  return (
    <View>
      <SwipeRow onEdit={() => onEditMeal(meal.id)} onDelete={() => onDeleteMeal(meal.id)}>
        <Pressable
          onPress={toggleExpand}
          className="flex-row items-start px-4 py-4 bg-m3-surface-container border-b border-m3-outline-variant/20 active:opacity-80"
          accessibilityRole="button"
        >
          <View className="w-10 h-10 rounded-full bg-m3-surface-container-highest items-center justify-center mr-3 mt-0.5">
            <MaterialIcons name="receipt-long" size={18} color={M3.onSurfaceVariant} />
          </View>
          <View className="flex-1 mr-3">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-m3-on-surface text-base font-semibold" numberOfLines={1}>
                {meal.name}
              </Text>
              <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
                <MaterialIcons name="expand-more" size={18} color={M3.onSurfaceVariant} />
              </Animated.View>
            </View>
            <Text className="text-m3-on-surface-variant text-xs mt-0.5">
              {meal.components.length} {meal.components.length === 1 ? 'item' : 'items'}
            </Text>
            <View className="mt-2">
              <MacroPills protein={totalP} carbs={totalC} fat={totalF} />
            </View>
          </View>
          <View className="items-end pt-0.5">
            <Text className="text-m3-on-surface text-base font-bold tabular-nums">
              {Math.round(totalCalories)}
              <Text className="text-m3-on-surface-variant text-xs font-medium"> kcal</Text>
            </Text>
          </View>
        </Pressable>
      </SwipeRow>

      {expanded && meal.components.map((comp, i) => (
        <Reanimated.View
          key={comp.id}
          entering={reducedMotion ? undefined : FadeInDown.duration(250).delay(i * 40)}
          exiting={reducedMotion ? undefined : FadeOut.duration(180)}
          layout={reducedMotion ? undefined : Layout.springify()}
        >
          <View className="pl-12 bg-m3-surface-container-low/50">
          <View className="flex-row items-start px-4 py-2.5 border-b border-m3-outline-variant/15">
            <Text className="text-m3-on-surface text-sm flex-1 mr-3" numberOfLines={1}>
              {comp.name}
            </Text>
            <View className="items-end">
              <Text className="text-m3-on-surface text-sm font-semibold tabular-nums">
                {Math.round(comp.calories)}
                <Text className="text-m3-on-surface-variant text-xs font-medium"> kcal</Text>
              </Text>
              <View className="flex-row gap-1">
                <Text className="text-m3-on-surface-variant text-[10px] tabular-nums">
                  {Math.round(comp.grams_logged || 0)}g
                </Text>
              </View>
            </View>
            </View>
          </View>
        </Reanimated.View>
      ))}
    </View>
  );
}

// ── Section Types ────────────────────────────────────────────────────────

export interface JournalEntryKind {
  type: 'food' | 'meal';
  foodLog?: FoodLog;
  mealGroup?: MealGroup;
}

interface JournalSectionProps {
  label: string;
  entries: JournalEntryKind[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  onEditFood: (food: FoodLog) => void;
  onEditMeal: (mealId: number) => void;
  onDeleteFood: (food: FoodLog) => void;
  onDeleteMeal: (mealId: number) => void;
}

export default function JournalSection({
  label,
  entries,
  totalCalories,
  totalProtein,
  totalCarbs,
  totalFat,
  onEditFood,
  onEditMeal,
  onDeleteFood,
  onDeleteMeal,
}: JournalSectionProps) {
  const hasEntries = entries.length > 0;
  const [collapsed, setCollapsed] = useState(!hasEntries);
  const prevHasEntriesRef = useRef(hasEntries);
  const rotation = useRef(new Animated.Value(hasEntries ? 1 : 0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!prevHasEntriesRef.current && hasEntries) {
      Animated.timing(rotation, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
      setCollapsed(false);
    }
    prevHasEntriesRef.current = hasEntries;
  }, [hasEntries]);

  const toggleSection = () => {
    Animated.timing(rotation, {
      toValue: collapsed ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setCollapsed(!collapsed);
  };

  return (
    <View className="mb-3">
      <Pressable
        onPress={toggleSection}
        className="flex-row items-center justify-between px-4 pt-6 pb-2 active:opacity-60 min-h-[48]"
        accessibilityRole="button"
        accessibilityLabel={`${label} section, ${collapsed ? 'collapsed' : 'expanded'}`}
      >
        <View className="flex-row items-center gap-2 flex-1 min-w-0 mr-3">
          <Text className="text-m3-on-surface text-base font-bold shrink" numberOfLines={1}>{label}</Text>
          <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <MaterialIcons name="expand-more" size={18} color={M3.onSurfaceVariant} />
          </Animated.View>
        </View>
        {hasEntries && (
          <View className="flex-row items-baseline gap-3 shrink-0">
            <Text className="text-m3-on-surface-variant text-xs font-semibold num-tabular">
              {kcalLabel(totalCalories)}
            </Text>
            <View className="flex-row gap-2">
              <Text className="text-m3-on-surface-variant text-[11px] num-tabular">
                <Text className="font-semibold" style={{ color: M3.protein }}>P </Text>
                {Math.round(totalProtein)}g
              </Text>
              <Text className="text-m3-on-surface-variant text-[11px] num-tabular">
                <Text className="font-semibold" style={{ color: M3.carbs }}>C </Text>
                {Math.round(totalCarbs)}g
              </Text>
              <Text className="text-m3-on-surface-variant text-[11px] num-tabular">
                <Text className="font-semibold" style={{ color: M3.fat }}>F </Text>
                {Math.round(totalFat)}g
              </Text>
            </View>
          </View>
        )}
      </Pressable>

      {!collapsed && (
        <Reanimated.View
          entering={reducedMotion ? undefined : FadeIn.duration(250)}
          exiting={reducedMotion ? undefined : FadeOut.duration(200)}
          layout={reducedMotion ? undefined : Layout.springify()}
          className="mt-1"
        >
          {hasEntries ? (
            entries.map((entry) => {
              if (entry.type === 'food' && entry.foodLog) {
                return (
                  <FoodRow
                    key={`food-${entry.foodLog.id}`}
                    food={entry.foodLog}
                    onEdit={onEditFood}
                    onDelete={onDeleteFood}
                  />
                );
              }
              if (entry.type === 'meal' && entry.mealGroup) {
                return (
                  <MealRow
                    key={`meal-${entry.mealGroup.id}`}
                    meal={entry.mealGroup}
                    onEditMeal={onEditMeal}
                    onDeleteMeal={onDeleteMeal}
                  />
                );
              }
              return null;
            })
          ) : (
            <View className="px-4 py-6 items-center">
              <Text className="text-m3-on-surface-variant text-xs font-medium">
                No {label.toLowerCase()} logged yet
              </Text>
            </View>
          )}
        </Reanimated.View>
      )}
    </View>
  );
}
