import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import type { ShowSheetDialog } from './SheetDialog';
import { CALENDAR_DAY } from '../theme/calendarDay';
import { M3 } from '../theme/tokens';
import {
  formatLocalISO,
  formatMonthLabel,
  getFixedMonthGrid,
  getMonthStart,
  parseLocalISO,
} from '../utils/calendar';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HEADLINE_FORMATTER = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

interface LogDateBounds {
  /** Earliest choosable date (local ISO). */
  minDate?: string;
  /** Latest choosable date (local ISO). */
  maxDate?: string;
}

interface LogDatePickerProps extends LogDateBounds {
  /** The current log date (local ISO). */
  value: string;
  today: string;
  onSelect: (dateISO: string) => void;
}

function monthKeyOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/** A tap-only month grid. Choosing a day is the whole interaction. */
function LogDatePicker({ value, today, minDate, maxDate, onSelect }: LogDatePickerProps) {
  const [monthStart, setMonthStart] = useState(() => getMonthStart(parseLocalISO(value)));
  const weeks = useMemo(() => getFixedMonthGrid(monthStart), [monthStart]);
  const monthKey = monthKeyOf(formatLocalISO(monthStart));
  const canGoBack = !minDate || monthKey > monthKeyOf(minDate);
  const canGoForward = !maxDate || monthKey < monthKeyOf(maxDate);

  const shiftMonth = (months: number) => {
    setMonthStart((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + months, 1);
      return next;
    });
  };

  return (
    <View>
      {/* Same month header as the Diary strip and the Analytics calendar. */}
      <View className="-mx-3 flex-row items-center justify-between">
        <Pressable
          onPress={() => shiftMonth(-1)}
          disabled={!canGoBack}
          className="h-12 w-12 items-center justify-center active:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canGoBack }}
        >
          <MaterialIcons name="chevron-left" size={24} color={canGoBack ? M3.onSurfaceVariant : M3.outlineVariant} />
        </Pressable>
        <Text accessibilityRole="header" className="text-sm font-bold text-m3-on-surface">
          {formatMonthLabel(monthStart)}
        </Text>
        <Pressable
          onPress={() => shiftMonth(1)}
          disabled={!canGoForward}
          className="h-12 w-12 items-center justify-center active:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canGoForward }}
        >
          <MaterialIcons name="chevron-right" size={24} color={canGoForward ? M3.onSurfaceVariant : M3.outlineVariant} />
        </Pressable>
      </View>

      <View className="flex-row pb-1" importantForAccessibility="no-hide-descendants">
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
            const isFuture = iso > today;
            const disabled = (minDate != null && iso < minDate) || (maxDate != null && iso > maxDate);
            return (
              <Pressable
                key={iso}
                onPress={() => onSelect(iso)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`${DAY_LABEL_FORMATTER.format(date)}${isToday ? ', today' : ''}`}
                accessibilityState={{ selected, disabled }}
                className="h-12 flex-1 items-center justify-center active:opacity-60"
              >
                {/* The calendar day mark without a ring: the discs fill the day's full footprint. */}
                <View
                  className={`items-center justify-center rounded-full ${selected ? 'bg-m3-primary' : ''}`}
                  style={{ width: CALENDAR_DAY.size, height: CALENDAR_DAY.size }}
                >
                  {isToday && !selected ? (
                    <View
                      className="absolute inset-0 rounded-full bg-m3-primary"
                      style={{ opacity: CALENDAR_DAY.todayDiscOpacity }}
                    />
                  ) : null}
                  <Text
                    className={`text-xs font-bold tabular-nums ${
                      selected
                        ? 'text-m3-on-primary'
                        : disabled
                          ? 'text-m3-on-surface-variant/30'
                          : isToday
                            ? 'text-m3-primary'
                            : !inMonth || isFuture
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
  );
}

interface ShowLogDatePickerOptions extends LogDateBounds {
  value: string;
  today: string;
  onSelect: (dateISO: string) => void;
}

/** Opens the log-date picker as the sheet's modal dialog. Meal and weight dates share it. */
export function showLogDatePicker(
  showDialog: ShowSheetDialog,
  { value, today, minDate, maxDate, onSelect }: ShowLogDatePickerOptions,
) {
  const todayChoosable = (!minDate || today >= minDate) && (!maxDate || today <= maxDate);
  showDialog({
    title: 'Log date',
    headline: value === today
      ? `Today, ${SHORT_DATE_FORMATTER.format(parseLocalISO(value))}`
      : HEADLINE_FORMATTER.format(parseLocalISO(value)),
    body: (close) => (
      <LogDatePicker
        value={value}
        today={today}
        minDate={minDate}
        maxDate={maxDate}
        onSelect={(dateISO) => {
          close();
          onSelect(dateISO);
        }}
      />
    ),
    actions: [
      { label: 'Cancel', tone: 'cancel' },
      ...(value !== today && todayChoosable
        ? [{ label: 'Today', tone: 'neutral' as const, onPress: () => onSelect(today) }]
        : []),
    ],
  });
}
