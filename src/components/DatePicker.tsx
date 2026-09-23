import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { ShowSheetDialog } from './SheetDialog';
import { CALENDAR_DAY } from '../theme/calendarDay';
import { DURATION, EASING } from '../theme/motion';
import { M3 } from '../theme/tokens';
import {
  formatLocalISO,
  formatLogDateLabel,
  formatMonthLabel,
  getFixedMonthGrid,
  getMonthStart,
  parseLocalISO,
} from '../utils/calendar';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const CELL_HEIGHT = 48;
/** Every view keeps the day view's height (weekday row plus six weeks), so the card never resizes. */
const GRID_HEIGHT = 20 + CELL_HEIGHT * 6;
const YEAR_ROW_HEIGHT = 56;
const CHOICE_COLUMNS = 3;
/** Year range for unbounded dates such as meals. */
const UNBOUNDED_YEARS_BACK = 10;
const UNBOUNDED_YEARS_AHEAD = 1;

type PickerView = 'years' | 'months' | 'days';
/** Deeper views zoom in; shallower ones zoom out. */
const DEPTH: Record<PickerView, number> = { years: 0, months: 1, days: 2 };

interface PickerFrame {
  view: PickerView;
  /** First of the month on show; its year drives the month and year views. */
  month: Date;
}

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
  startView: 'days' | 'years';
  onSelect: (dateISO: string) => void;
}

function monthKeyOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

function yearOf(dateISO: string): number {
  return Number(dateISO.slice(0, 4));
}

function frameKey(frame: PickerFrame): string {
  return `${frame.view}:${formatLocalISO(frame.month)}`;
}

/** The first of the month, pulled inside the bounds' months. */
function clampMonth(month: Date, minDate?: string, maxDate?: string): Date {
  const key = monthKeyOf(formatLocalISO(month));
  if (minDate && key < monthKeyOf(minDate)) return getMonthStart(parseLocalISO(minDate));
  if (maxDate && key > monthKeyOf(maxDate)) return getMonthStart(parseLocalISO(maxDate));
  return month;
}

function addMonths(month: Date, months: number): Date {
  const next = new Date(month);
  next.setMonth(next.getMonth() + months, 1);
  return next;
}

/**
 * Moves between picker frames with one motion vocabulary: going deeper zooms in, going
 * shallower zooms out, and paging within a view slides the way the arrow points. The old
 * frame leaves fast, the new one settles.
 */
function useFrameTransition(target: PickerFrame, reduced: boolean) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const requestRef = useRef(0);
  const enterRef = useRef<{ x: number; scale: number } | null>(null);
  const opacity = useSharedValue(1);
  const x = useSharedValue(0);
  const scale = useSharedValue(1);

  const commit = useCallback((frame: PickerFrame, request: number) => {
    if (request === requestRef.current) setShown(frame);
  }, []);

  useEffect(() => {
    const from = shownRef.current;
    if (frameKey(from) === frameKey(target)) return;
    const request = ++requestRef.current;
    if (reduced) {
      enterRef.current = null;
      setShown(target);
      return;
    }
    const depthChange = DEPTH[target.view] - DEPTH[from.view];
    const forward = target.month.getTime() > from.month.getTime();
    const exit = depthChange > 0
      ? { x: 0, scale: 1.04 }
      : depthChange < 0
        ? { x: 0, scale: 0.96 }
        : { x: forward ? -16 : 16, scale: 1 };
    enterRef.current = depthChange > 0
      ? { x: 0, scale: 0.92 }
      : depthChange < 0
        ? { x: 0, scale: 1.08 }
        : { x: forward ? 16 : -16, scale: 1 };
    const out = { duration: DURATION.exit, easing: EASING.emphasizedAccelerate };
    x.value = withTiming(exit.x, out);
    scale.value = withTiming(exit.scale, out);
    opacity.value = withTiming(0, out, (finished) => {
      if (finished) runOnJS(commit)(target, request);
    });
  }, [commit, opacity, reduced, scale, target, x]);

  useLayoutEffect(() => {
    const enter = enterRef.current;
    if (!enter) return;
    enterRef.current = null;
    x.value = enter.x;
    scale.value = enter.scale;
    const settle = { duration: DURATION.short, easing: EASING.emphasizedDecelerate };
    x.value = withTiming(0, settle);
    scale.value = withTiming(1, settle);
    opacity.value = withTiming(1, { duration: DURATION.enter, easing: EASING.emphasizedDecelerate });
  }, [opacity, scale, shown, x]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { scale: scale.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return { shown, style, labelStyle };
}

/** A white pill for the chosen month or year, and the faint disc tint for the current one. */
function ChoiceChip({
  label,
  selected,
  current,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  current: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      className="flex-1 items-center justify-center active:opacity-60"
    >
      <View className={`h-10 w-20 items-center justify-center rounded-full ${selected ? 'bg-m3-primary' : ''}`}>
        {current && !selected ? (
          <View
            className="absolute inset-0 rounded-full bg-m3-primary"
            style={{ opacity: CALENDAR_DAY.todayDiscOpacity }}
          />
        ) : null}
        <Text
          className={`text-sm font-bold tabular-nums ${
            selected
              ? 'text-m3-on-primary'
              : disabled
                ? 'text-m3-on-surface-variant/30'
                : current
                  ? 'text-m3-primary'
                  : 'text-m3-on-surface'
          }`}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The app's date picker: a tap-only day grid with a months and years drill-down behind the
 * header label. Choosing a day is the whole interaction.
 */
function DatePicker({ value, today, minDate, maxDate, startView, onSelect }: DatePickerProps) {
  const reduced = useReducedMotion();
  const [target, setTarget] = useState<PickerFrame>(() => ({
    view: startView,
    month: getMonthStart(parseLocalISO(value)),
  }));
  const { shown, style, labelStyle } = useFrameTransition(target, reduced);
  const { view, month } = shown;
  const shownYear = month.getFullYear();
  const todayYear = yearOf(today);
  const valueYear = yearOf(value);
  const valueMonthKey = monthKeyOf(value);
  const todayMonthKey = monthKeyOf(today);

  const weeks = useMemo(() => getFixedMonthGrid(month), [month]);
  const years = useMemo(() => {
    const first = minDate ? yearOf(minDate) : todayYear - UNBOUNDED_YEARS_BACK;
    const last = maxDate ? yearOf(maxDate) : todayYear + UNBOUNDED_YEARS_AHEAD;
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }, [maxDate, minDate, todayYear]);
  const yearRows = useMemo(() => {
    const rows: number[][] = [];
    for (let index = 0; index < years.length; index += CHOICE_COLUMNS) rows.push(years.slice(index, index + CHOICE_COLUMNS));
    return rows;
  }, [years]);

  const yearScrollRef = useRef<ScrollView>(null);
  const yearScrollY = Math.max(
    0,
    Math.floor(Math.max(0, years.indexOf(shownYear)) / CHOICE_COLUMNS) * YEAR_ROW_HEIGHT
      - GRID_HEIGHT / 2 + YEAR_ROW_HEIGHT / 2,
  );
  const monthKey = monthKeyOf(formatLocalISO(month));
  const canPageBack = view === 'days'
    ? !minDate || monthKey > monthKeyOf(minDate)
    : !minDate || shownYear > yearOf(minDate);
  const canPageForward = view === 'days'
    ? !maxDate || monthKey < monthKeyOf(maxDate)
    : !maxDate || shownYear < yearOf(maxDate);

  const go = (next: PickerFrame) => setTarget(next);
  const page = (direction: -1 | 1) => {
    go({ view, month: clampMonth(addMonths(month, view === 'days' ? direction : direction * 12), minDate, maxDate) });
  };
  const climb = () => {
    if (view === 'days') go({ view: 'months', month });
    else if (view === 'months') go({ view: 'years', month });
    else go({ view: 'days', month });
  };

  const arrowTurn = useSharedValue(view === 'years' ? 1 : 0);
  useEffect(() => {
    arrowTurn.value = withTiming(target.view === 'years' ? 1 : 0, {
      duration: reduced ? 0 : DURATION.short,
      easing: EASING.emphasized,
    });
  }, [arrowTurn, reduced, target.view]);
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${arrowTurn.value * 180}deg` }] }));

  const headerLabel = view === 'days'
    ? formatMonthLabel(month)
    : view === 'months'
      ? String(shownYear)
      : `${years[0]}–${years[years.length - 1]}`;
  const pagingHidden = view === 'years';

  const pageArrow = (direction: -1 | 1, enabled: boolean) => (
    <Pressable
      onPress={() => page(direction)}
      disabled={!enabled || pagingHidden}
      className="h-12 w-12 items-center justify-center active:opacity-50"
      accessibilityRole="button"
      accessibilityLabel={`${direction < 0 ? 'Previous' : 'Next'} ${view === 'days' ? 'month' : 'year'}`}
      accessibilityState={{ disabled: !enabled }}
      // Hidden in the year view but still laid out, so the label never shifts.
      style={{ opacity: pagingHidden ? 0 : 1 }}
      importantForAccessibility={pagingHidden ? 'no-hide-descendants' : 'auto'}
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
        {pageArrow(-1, canPageBack)}
        <Pressable
          onPress={climb}
          className="min-h-[48px] flex-row items-center gap-0.5 rounded-full pl-3 pr-1.5 active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel={
            view === 'days'
              ? `${headerLabel}, choose month`
              : view === 'months'
                ? `${headerLabel}, choose year`
                : 'Back to days'
          }
        >
          <Animated.Text style={labelStyle} className="text-sm font-bold tabular-nums text-m3-on-surface">
            {headerLabel}
          </Animated.Text>
          <Animated.View style={arrowStyle}>
            <MaterialIcons name="arrow-drop-down" size={20} color={M3.onSurfaceVariant} />
          </Animated.View>
        </Pressable>
        {pageArrow(1, canPageForward)}
      </View>

      <View className="overflow-hidden" style={{ height: GRID_HEIGHT }}>
        <Animated.View style={[{ height: GRID_HEIGHT }, style]}>
          {view === 'years' ? (
            <ScrollView
              ref={yearScrollRef}
              // Opens with the shown year centered, before the frame fades in.
              onLayout={() => yearScrollRef.current?.scrollTo({ y: yearScrollY, animated: false })}
              showsVerticalScrollIndicator={false}
            >
              {yearRows.map((row) => (
                <View key={row[0]} className="flex-row" style={{ height: YEAR_ROW_HEIGHT }}>
                  {row.map((year) => (
                    <ChoiceChip
                      key={year}
                      label={String(year)}
                      selected={year === valueYear}
                      current={year === todayYear}
                      disabled={false}
                      onPress={() => go({ view: 'months', month: clampMonth(new Date(year, month.getMonth(), 1), minDate, maxDate) })}
                    />
                  ))}
                  {/* A short last row keeps its columns aligned with the rows above. */}
                  {Array.from({ length: CHOICE_COLUMNS - row.length }, (_, index) => (
                    <View key={`pad-${index}`} className="flex-1" />
                  ))}
                </View>
              ))}
            </ScrollView>
          ) : view === 'months' ? (
            <View className="flex-1 justify-around py-2">
              {[0, 1, 2, 3].map((rowIndex) => (
                <View key={rowIndex} className="flex-row">
                  {MONTH_NAMES.slice(rowIndex * CHOICE_COLUMNS, rowIndex * CHOICE_COLUMNS + CHOICE_COLUMNS).map((name, column) => {
                    const monthIndex = rowIndex * CHOICE_COLUMNS + column;
                    const key = `${shownYear}-${String(monthIndex + 1).padStart(2, '0')}`;
                    const disabled = (minDate != null && key < monthKeyOf(minDate))
                      || (maxDate != null && key > monthKeyOf(maxDate));
                    return (
                      <ChoiceChip
                        key={name}
                        label={name}
                        selected={key === valueMonthKey}
                        current={key === todayMonthKey}
                        disabled={disabled}
                        onPress={() => go({ view: 'days', month: new Date(shownYear, monthIndex, 1) })}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          ) : (
            <View>
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
                    const inMonth = date.getMonth() === month.getMonth();
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
        </Animated.View>
      </View>
    </View>
  );
}

interface ShowDatePickerOptions extends DateBounds {
  /** The dialog label, e.g. "Log date" or "Birth date". */
  title: string;
  value: string;
  today: string;
  /** Birthdays start at the year grid; everything else starts at the days. */
  startView?: 'days' | 'years';
  onSelect: (dateISO: string) => void;
}

/** Opens the app's date picker as a modal dialog. Every date the app asks for goes through it. */
export function showDatePicker(
  showDialog: ShowSheetDialog,
  { title, value, today, minDate, maxDate, startView = 'days', onSelect }: ShowDatePickerOptions,
) {
  const todayChoosable = (!minDate || today >= minDate) && (!maxDate || today <= maxDate);
  const headline = formatLogDateLabel(value, parseLocalISO(today));
  showDialog({
    title,
    headline,
    accessory: value !== today && todayChoosable
      ? { label: 'Today', tone: 'neutral', onPress: () => onSelect(today) }
      : undefined,
    body: (close) => (
      <DatePicker
        value={value}
        today={today}
        minDate={minDate}
        maxDate={maxDate}
        startView={startView}
        onSelect={(dateISO) => {
          close();
          onSelect(dateISO);
        }}
      />
    ),
    actions: [{ label: 'Cancel', tone: 'cancel' }],
  });
}
