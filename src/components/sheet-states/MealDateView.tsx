import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../../theme/tokens';
import {
  formatLocalISO,
  formatLogDateLabel,
  formatMonthLabel,
  getFixedMonthGrid,
  getMonthStart,
  parseLocalISO,
} from '../../utils/calendar';
import SheetBackButton from './SheetBackButton';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

interface MealDateViewProps {
  /** The meal's current log date (local ISO). */
  value: string;
  today: string;
  onSelect: (dateISO: string) => void;
  onBack: () => void;
}

/**
 * Picks a meal's log date inside the review sheet: a tap-only month grid in the Diary
 * calendar's vocabulary. Choosing a day returns to the review with that date.
 */
export default function MealDateView({ value, today, onSelect, onBack }: MealDateViewProps) {
  const [monthStart, setMonthStart] = useState(() => getMonthStart(parseLocalISO(value)));
  const weeks = useMemo(() => getFixedMonthGrid(monthStart), [monthStart]);

  const shiftMonth = (months: number) => {
    setMonthStart((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + months, 1);
      return next;
    });
  };

  return (
    <View className="flex-1">
      <View className="px-5 pt-2 pb-3">
        <View className="h-12 flex-row items-center">
          <SheetBackButton onPress={onBack} />
          <Text accessibilityRole="header" className="flex-1 text-m3-on-surface text-base font-bold">
            Log date
          </Text>
          {value !== today ? (
            <Pressable
              onPress={() => onSelect(today)}
              accessibilityRole="button"
              accessibilityLabel="Log for today"
              className="min-h-[48px] justify-center rounded-full px-4 active:opacity-60"
            >
              <Text className="text-m3-on-surface text-sm font-semibold">Today</Text>
            </Pressable>
          ) : null}
        </View>
        <Text className="text-m3-on-surface-variant text-sm">{formatLogDateLabel(value, parseLocalISO(today))}</Text>
      </View>

      <BottomSheetScrollView className="flex-1" contentContainerClassName="px-3 pb-6">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => shiftMonth(-1)}
            className="w-12 h-12 items-center justify-center active:opacity-50"
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <MaterialIcons name="chevron-left" size={24} color={M3.onSurfaceVariant} />
          </Pressable>
          <Text accessibilityRole="header" className="text-m3-on-surface text-sm font-bold">
            {formatMonthLabel(monthStart)}
          </Text>
          <Pressable
            onPress={() => shiftMonth(1)}
            className="w-12 h-12 items-center justify-center active:opacity-50"
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <MaterialIcons name="chevron-right" size={24} color={M3.onSurfaceVariant} />
          </Pressable>
        </View>

        <View className="flex-row" importantForAccessibility="no-hide-descendants">
          {WEEKDAY_LETTERS.map((letter, index) => (
            <Text key={index} className="flex-1 text-center text-compact font-semibold text-m3-on-surface-variant">
              {letter}
            </Text>
          ))}
        </View>

        {weeks.map((week) => (
          <View key={formatLocalISO(week[0])} className="flex-row">
            {week.map((date) => {
              const iso = formatLocalISO(date);
              const selected = iso === value;
              const isToday = iso === today;
              const inMonth = date.getMonth() === monthStart.getMonth();
              return (
                <Pressable
                  key={iso}
                  onPress={() => onSelect(iso)}
                  accessibilityRole="button"
                  accessibilityLabel={`${DAY_LABEL_FORMATTER.format(date)}${isToday ? ', today' : ''}`}
                  accessibilityState={{ selected }}
                  className="flex-1 h-12 items-center justify-center active:opacity-60"
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
                    <Text
                      className={`text-xs font-bold tabular-nums ${
                        selected
                          ? 'text-m3-on-surface'
                          : isToday
                            ? 'text-m3-primary'
                            : inMonth
                              ? 'text-m3-on-surface'
                              : 'text-m3-on-surface-variant/50'
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
      </BottomSheetScrollView>
    </View>
  );
}
