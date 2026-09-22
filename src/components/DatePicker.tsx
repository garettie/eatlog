import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
const SAME_YEAR_HEADLINE = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const OTHER_YEAR_HEADLINE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const CELL_HEIGHT = 48;
const YEAR_COLUMNS = 3;
/** The day view's height: weekday row plus six weeks. The year view keeps it so the card never resizes. */
const GRID_HEIGHT = 20 + CELL_HEIGHT * 6;
/** Year range for unbounded dates such as meals. */
const UNBOUNDED_YEARS_BACK = 10;
const UNBOUNDED_YEARS_AHEAD = 1;

interface DateBounds {
  /** Earliest choosable date (local ISO). */
  minDate?: string;
  /** Latest choosable date (local ISO). */
  maxDate?: string;
}

interface DatePickerProps extends DateBounds {
  /** The current date (local ISO). */
  value: string;
  today: string;
  onSelect: (dateISO: string) => void;
}

function monthKeyOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

function yearOf(dateISO: string): number {
  return Number(dateISO.slice(0, 4));
}

/** The first of the month, pulled inside the bounds' months. */
function clampMonth(monthStart: Date, minDate?: string, maxDate?: string): Date {
  const key = monthKeyOf(formatLocalISO(monthStart));
  if (minDate && key < monthKeyOf(minDate)) return getMonthStart(parseLocalISO(minDate));
  if (maxDate && key > monthKeyOf(maxDate)) return getMonthStart(parseLocalISO(maxDate));
  return monthStart;
}

/**
 * A tap-only month grid, with a year view behind the month label for distant dates such as
 * birthdays. Choosing a day is the whole interaction.
 */
function DatePicker({ value, today, minDate, maxDate, onSelect }: DatePickerProps) {
  const [monthStart, setMonthStart] = useState(() => getMonthStart(parseLocalISO(value)));
  const [view, setView] = useState<'days' | 'years'>('days');
  const weeks = useMemo(() => getFixedMonthGrid(monthStart), [monthStart]);
  const monthKey = monthKeyOf(formatLocalISO(monthStart));
  const canGoBack = !minDate || monthKey > monthKeyOf(minDate);
  const canGoForward = !maxDate || monthKey < monthKeyOf(maxDate);
  const shownYear = monthStart.getFullYear();
  const todayYear = yearOf(today);
  const years = useMemo(() => {
    const first = minDate ? yearOf(minDate) : todayYear - UNBOUNDED_YEARS_BACK;
    const last = maxDate ? yearOf(maxDate) : todayYear + UNBOUNDED_YEARS_AHEAD;
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }, [maxDate, minDate, todayYear]);
  const yearRows = useMemo(() => {
    const rows: number[][] = [];
    for (let index = 0; index < years.length; index += YEAR_COLUMNS) rows.push(years.slice(index, index + YEAR_COLUMNS));
    return rows;
  }, [years]);
  const shownYearRow = Math.floor(Math.max(0, years.indexOf(shownYear)) / YEAR_COLUMNS);

  const shiftMonth = (months: number) => {
    setMonthStart((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + months, 1);
      return next;
    });
  };

  const chooseYear = (year: number) => {
    setMonthStart((current) => clampMonth(new Date(year, current.getMonth(), 1), minDate, maxDate));
    setView('days');
  };

  const monthArrow = (direction: -1 | 1, enabled: boolean) => (
    <Pressable
      onPress={() => shiftMonth(direction)}
      disabled={!enabled || view === 'years'}
      className="h-12 w-12 items-center justify-center active:opacity-50"
      accessibilityRole="button"
      accessibilityLabel={direction < 0 ? 'Previous month' : 'Next month'}
      accessibilityState={{ disabled: !enabled }}
      // The year view keeps the arrows' space so the label never shifts.
      style={{ opacity: view === 'years' ? 0 : 1 }}
      importantForAccessibility={view === 'years' ? 'no-hide-descendants' : 'auto'}
    >
      <MaterialIcons
        name={direction < 0 ? 'chevron-left' : 'chevron-right'}
        size={24}
        color={enabled ? M3.onSurfaceVariant : M3.outlineVariant}
      />
    </Pressable>
  );

  return (
    <View>
      {/* Same month header as the Diary strip and the Analytics calendar. */}
      <View className="-mx-3 flex-row items-center justify-between">
        {monthArrow(-1, canGoBack)}
        <Pressable
          onPress={() => setView((current) => (current === 'days' ? 'years' : 'days'))}
          className="min-h-[48px] flex-row items-center gap-0.5 rounded-full pl-3 pr-1.5 active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel={view === 'days' ? `${formatMonthLabel(monthStart)}, choose year` : 'Back to days'}
        >
          <Text accessibilityRole="header" className="text-sm font-bold text-m3-on-surface">
            {formatMonthLabel(monthStart)}
          </Text>
          <MaterialIcons
            name={view === 'days' ? 'arrow-drop-down' : 'arrow-drop-up'}
            size={20}
            color={M3.onSurfaceVariant}
          />
        </Pressable>
        {monthArrow(1, canGoForward)}
      </View>

      {view === 'years' ? (
        <ScrollView
          style={{ height: GRID_HEIGHT }}
          contentOffset={{ x: 0, y: Math.max(0, shownYearRow * CELL_HEIGHT - GRID_HEIGHT / 2 + CELL_HEIGHT / 2) }}
          showsVerticalScrollIndicator={false}
        >
          {yearRows.map((row) => (
            <View key={row[0]} className="flex-row">
              {row.map((year) => {
                const selected = year === shownYear;
                const current = year === todayYear;
                return (
                  <Pressable
                    key={year}
                    onPress={() => chooseYear(year)}
                    accessibilityRole="button"
                    accessibilityLabel={String(year)}
                    accessibilityState={{ selected }}
                    className="h-12 flex-1 items-center justify-center active:opacity-60"
                  >
                    <View
                      className={`h-9 w-20 items-center justify-center rounded-full ${selected ? 'bg-m3-primary' : ''}`}
                    >
                      {current && !selected ? (
                        <View
                          className="absolute inset-0 rounded-full bg-m3-primary"
                          style={{ opacity: CALENDAR_DAY.todayDiscOpacity }}
                        />
                      ) : null}
                      <Text
                        className={`text-sm font-bold tabular-nums ${
                          selected ? 'text-m3-on-primary' : current ? 'text-m3-primary' : 'text-m3-on-surface'
                        }`}
                      >
                        {year}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              {/* A short last row keeps its columns aligned with the rows above. */}
              {Array.from({ length: YEAR_COLUMNS - row.length }, (_, index) => (
                <View key={`pad-${index}`} className="flex-1" />
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={{ height: GRID_HEIGHT }}>
          <View className="h-5 flex-row" importantForAccessibility="no-hide-descendants">
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
      )}
    </View>
  );
}

interface ShowDatePickerOptions extends DateBounds {
  /** The dialog label, e.g. "Log date" or "Birth date". */
  title: string;
  value: string;
  today: string;
  onSelect: (dateISO: string) => void;
}

/** Opens the app's date picker as a modal dialog. Every date the app asks for goes through it. */
export function showDatePicker(
  showDialog: ShowSheetDialog,
  { title, value, today, minDate, maxDate, onSelect }: ShowDatePickerOptions,
) {
  const todayChoosable = (!minDate || today >= minDate) && (!maxDate || today <= maxDate);
  const valueDate = parseLocalISO(value);
  const headline = value === today
    ? `Today, ${SHORT_DATE_FORMATTER.format(valueDate)}`
    : yearOf(value) === yearOf(today)
      ? SAME_YEAR_HEADLINE.format(valueDate)
      : OTHER_YEAR_HEADLINE.format(valueDate);
  showDialog({
    title,
    headline,
    body: (close) => (
      <DatePicker
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
