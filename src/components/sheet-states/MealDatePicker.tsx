import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import CalorieDayRing from '../CalorieDayRing';
import {
  getDailyCaloriesByDateRange,
  getDailyTargetForDate,
  getDailyTargetsByDateRange,
} from '../../db/database';
import { M3 } from '../../theme/tokens';
import {
  formatLocalISO,
  formatMonthLabel,
  getFixedMonthGrid,
  getMonthDates,
  getMonthStart,
  parseLocalISO,
} from '../../utils/calendar';
import { type DayCalories, dayCalorieProgress } from '../../utils/dayCalorieProgress';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HEADLINE_FORMATTER = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

async function loadMonthProgress(monthStart: Date): Promise<Map<string, DayCalories>> {
  const days = getMonthDates(monthStart).map(formatLocalISO);
  const startISO = days[0];
  const endISO = days[days.length - 1];
  const [logged, initialTarget, targetChanges] = await Promise.all([
    getDailyCaloriesByDateRange(startISO, endISO),
    getDailyTargetForDate(startISO),
    getDailyTargetsByDateRange(startISO, endISO),
  ]);
  return dayCalorieProgress(days, logged, initialTarget, targetChanges);
}

interface MealDatePickerProps {
  /** The meal's current log date (local ISO). */
  value: string;
  today: string;
  onSelect: (dateISO: string) => void;
}

/**
 * Picks a meal's log date inside a sheet dialog. Days carry the Diary's calorie rings, so an
 * unlogged day stands out when backfilling. Tapping a day chooses it.
 */
export default function MealDatePicker({ value, today, onSelect }: MealDatePickerProps) {
  const [monthStart, setMonthStart] = useState(() => getMonthStart(parseLocalISO(value)));
  const [progress, setProgress] = useState<Map<string, DayCalories> | null>(null);
  const cacheRef = useRef(new Map<string, Map<string, DayCalories>>());
  const weeks = useMemo(() => getFixedMonthGrid(monthStart), [monthStart]);
  const monthKey = formatLocalISO(monthStart);

  useEffect(() => {
    const cached = cacheRef.current.get(monthKey);
    setProgress(cached ?? null);
    if (cached) return;
    let active = true;
    loadMonthProgress(monthStart)
      .then((next) => {
        cacheRef.current.set(monthKey, next);
        if (active) setProgress(next);
      })
      // Rings are context, not the task: a failed load leaves plain tracks and a working picker.
      .catch((error) => console.error('[MealDatePicker] month load failed', error));
    return () => {
      active = false;
    };
  }, [monthKey, monthStart]);

  const shiftMonth = (months: number) => {
    setMonthStart((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + months, 1);
      return next;
    });
  };

  return (
    <View>
      <Text className="text-2xl font-bold text-m3-on-surface">
        {value === today
          ? `Today, ${SHORT_DATE_FORMATTER.format(parseLocalISO(value))}`
          : HEADLINE_FORMATTER.format(parseLocalISO(value))}
      </Text>
      <View className="-mx-5 mt-4 h-px bg-m3-outline-variant/50" />

      <View className="-mr-3 mt-1 flex-row items-center">
        <Text accessibilityRole="header" className="flex-1 text-sm font-bold text-m3-on-surface">
          {formatMonthLabel(monthStart)}
        </Text>
        <Pressable
          onPress={() => shiftMonth(-1)}
          className="h-12 w-12 items-center justify-center active:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <MaterialIcons name="chevron-left" size={24} color={M3.onSurfaceVariant} />
        </Pressable>
        <Pressable
          onPress={() => shiftMonth(1)}
          className="h-12 w-12 items-center justify-center active:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <MaterialIcons name="chevron-right" size={24} color={M3.onSurfaceVariant} />
        </Pressable>
      </View>

      <View className="-mx-2 flex-row pb-1" importantForAccessibility="no-hide-descendants">
        {WEEKDAY_LETTERS.map((letter, index) => (
          <Text key={index} className="flex-1 text-center text-compact font-semibold text-m3-on-surface-variant">
            {letter}
          </Text>
        ))}
      </View>

      <View className="-mx-2">
        {weeks.map((week) => (
          <View key={formatLocalISO(week[0])} className="flex-row">
            {week.map((date) => {
              const iso = formatLocalISO(date);
              const selected = iso === value;
              const isToday = iso === today;
              const isFuture = iso > today;
              const inMonth = date.getMonth() === monthStart.getMonth();
              const day = progress?.get(iso);
              const logged = day && day.calories > 0
                ? `${Math.round(day.calories)} calories logged`
                : 'nothing logged';
              return (
                <Pressable
                  key={iso}
                  onPress={() => onSelect(iso)}
                  accessibilityRole="button"
                  accessibilityLabel={`${DAY_LABEL_FORMATTER.format(date)}${isToday ? ', today' : ''}${
                    inMonth && !isFuture && progress ? `, ${logged}` : ''
                  }`}
                  accessibilityState={{ selected }}
                  className="h-12 flex-1 items-center justify-center active:opacity-60"
                >
                  <View
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      selected
                        ? 'bg-m3-surface-container-highest border-[1.5px] border-m3-primary'
                        : isToday
                          ? 'border-[1.5px] border-m3-primary'
                          : ''
                    }`}
                  >
                    {inMonth ? (
                      <CalorieDayRing
                        calories={day?.calories ?? 0}
                        targetCalories={day?.targetCalories ?? 0}
                        isFuture={isFuture}
                      />
                    ) : null}
                    <Text
                      className={`text-xs font-bold tabular-nums ${
                        isToday && !selected
                          ? 'text-m3-primary'
                          : !inMonth
                            ? 'text-m3-on-surface-variant/40'
                            : isFuture
                              ? 'text-m3-on-surface-variant'
                              : 'text-m3-on-surface'
                      }`}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
