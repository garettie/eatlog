import React, { useCallback, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

import { M3 } from '../theme/tokens';
import { todayISO, parseLocalISO } from '../utils/calendar';
import { targetOverflowProgress } from '../utils/calculations';
import {
  CalorieCalendarDay,
  CalorieCalendarMonth,
  CalorieCalendarWeek,
} from '../utils/energyHistory';

const RING_R = 15;
const RING_STROKE = 2;
const RING_VIEWBOX_SIZE = 36;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
const WEEKDAYS = [
  { short: 'M', long: 'Monday' },
  { short: 'T', long: 'Tuesday' },
  { short: 'W', long: 'Wednesday' },
  { short: 'T', long: 'Thursday' },
  { short: 'F', long: 'Friday' },
  { short: 'S', long: 'Saturday' },
  { short: 'S', long: 'Sunday' },
];

export interface MonthlyCalorieCalendarProps {
  month: CalorieCalendarMonth | null;
  monthLabel: string;
  isCurrentMonth: boolean;
  loading: boolean;
  error: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onRetry: () => void;
}

function formatCalories(value: number): string {
  return Math.round(value).toLocaleString();
}

function statusLabel(day: CalorieCalendarDay): string {
  switch (day.status) {
    case 'under':
      return `${formatCalories(day.calories ?? 0)} calories, ${formatCalories(Math.abs(day.deltaCalories ?? 0))} under target`;
    case 'target':
      return `${formatCalories(day.calories ?? 0)} calories, on target`;
    case 'over':
      return `${formatCalories(day.calories ?? 0)} calories, ${formatCalories(Math.abs(day.deltaCalories ?? 0))} over target`;
    case 'future':
      return 'Future day';
    case 'missing':
      return 'No log';
    default:
      return day.calories == null
        ? 'Target unavailable'
        : `${formatCalories(day.calories)} calories, target unavailable`;
  }
}

function dateLabel(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function comparisonLabel(week: CalorieCalendarWeek): string {
  if (week.loggedDays === 0) return 'No log';
  if (week.deltaCalories == null) return 'Target unavailable';
  if (week.deltaCalories === 0) return 'On target';
  return `${formatCalories(Math.abs(week.deltaCalories))} ${week.deltaCalories > 0 ? 'over' : 'under'}`;
}

function DayRing({ day, size, currentDate }: { day: CalorieCalendarDay; size: number; currentDate: string }) {
  const overflowProgress = day.status === 'over' && day.calories != null && day.targetCalories != null
    ? targetOverflowProgress(day.calories, day.targetCalories)
    : 0;
  const offset = CIRCUMFERENCE * (1 - day.progress);
  const overflowOffset = CIRCUMFERENCE * (1 - overflowProgress);
  const dayNumber = parseLocalISO(day.date).getDate();
  const isToday = day.date === currentDate;
  const muted = !day.inMonth;
  const future = day.status === 'future';
  const targetUnavailable = day.status === 'target-unavailable';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${dateLabel(day.date)}: ${statusLabel(day)}`}
      className={`items-center justify-center rounded-full ${isToday ? 'border border-m3-primary' : ''}`}
      style={{ width: size, height: size }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${RING_VIEWBOX_SIZE} ${RING_VIEWBOX_SIZE}`}
        style={{ position: 'absolute', opacity: muted ? 0.55 : future ? 0.45 : 1 }}
      >
        <Circle
          cx={RING_VIEWBOX_SIZE / 2}
          cy={RING_VIEWBOX_SIZE / 2}
          r={RING_R}
          fill="none"
          stroke={targetUnavailable ? M3.onSurfaceVariant : M3.outline}
          strokeWidth={RING_STROKE}
          strokeDasharray={targetUnavailable ? '2 3' : undefined}
          opacity={targetUnavailable ? 0.85 : 0.5}
        />
        {day.progress > 0 ? (
          <Circle
            cx={RING_VIEWBOX_SIZE / 2}
            cy={RING_VIEWBOX_SIZE / 2}
            r={RING_R}
            fill="none"
            stroke={M3.calories}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            rotation={-90}
            originX={RING_VIEWBOX_SIZE / 2}
            originY={RING_VIEWBOX_SIZE / 2}
          />
        ) : null}
        {overflowProgress > 0 ? (
          <Circle
            cx={RING_VIEWBOX_SIZE / 2}
            cy={RING_VIEWBOX_SIZE / 2}
            r={RING_R}
            fill="none"
            stroke={M3.caloriesOverflow}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={overflowOffset}
            rotation={-90}
            originX={RING_VIEWBOX_SIZE / 2}
            originY={RING_VIEWBOX_SIZE / 2}
          />
        ) : null}
      </Svg>
      <Text
        className="text-xs font-bold tabular-nums"
        style={{ color: isToday ? M3.primary : muted || future ? M3.onSurfaceVariant : M3.onSurface }}
      >
        {dayNumber}
      </Text>
    </View>
  );
}

function WeekRow({ week, size, summaryWidth, currentDate }: { week: CalorieCalendarWeek; size: number; summaryWidth: number; currentDate: string }) {
  const comparison = comparisonLabel(week);
  const accessibilityLabel = `Week ${dateLabel(week.startDate)} through ${dateLabel(week.endDate)}: ${week.loggedDays === 0 ? 'no log' : `${formatCalories(week.totalCalories)} calories, ${comparison}`}, ${week.loggedDays} of 7 logged`;

  return (
    <View className="flex-row items-center py-0.5">
      <View className="flex-1 flex-row items-center">
        {week.days.map((day) => (
          <View key={day.date} className="flex-1 min-w-0 items-center justify-center">
            <DayRing day={day} size={size} currentDate={currentDate} />
          </View>
        ))}
      </View>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel}
        className="ml-1 gap-0.5"
        style={{ width: summaryWidth }}
      >
        <Text className="text-m3-on-surface text-compact font-semibold tabular-nums" numberOfLines={1}>
          {week.loggedDays === 0 ? 'No log' : `${formatCalories(week.totalCalories)} kcal`}
        </Text>
        {week.loggedDays > 0 ? (
          <Text className="text-m3-on-surface-variant text-compact tabular-nums" numberOfLines={2}>
            {comparison}
          </Text>
        ) : null}
        <Text className="text-m3-on-surface-variant text-compact tabular-nums" numberOfLines={1}>
          {week.loggedDays}/7 logged
        </Text>
      </View>
    </View>
  );
}

export default function MonthlyCalorieCalendar({
  month,
  monthLabel,
  isCurrentMonth,
  loading,
  error,
  onPreviousMonth,
  onNextMonth,
  onRetry,
}: MonthlyCalorieCalendarProps) {
  const { fontScale } = useWindowDimensions();
  const currentDate = todayISO();
  const [contentWidth, setContentWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setContentWidth(event.nativeEvent.layout.width);
  }, []);
  const baseSummaryWidth = contentWidth < 300 ? 84 : contentWidth < 380 ? 96 : 112;
  const summaryWidth = baseSummaryWidth + (fontScale > 1.2 ? 8 : 0);
  const dayWidth = contentWidth > 0 ? (contentWidth - summaryWidth - 4) / 7 : 26;
  const ringSize = Math.max(22, Math.min(36, Math.floor(dayWidth - 2)));
  const previousDisabled = loading;
  const nextDisabled = loading || isCurrentMonth;

  return (
    <View className="gap-3" onLayout={handleLayout}>
      <View className="gap-1">
        <Text className="text-m3-on-surface text-sm font-bold">Calendar</Text>
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={onPreviousMonth}
            disabled={previousDisabled}
            className="w-12 h-12 items-center justify-center rounded-full active:bg-m3-surface-container-high"
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: previousDisabled }}
          >
            <MaterialIcons name="chevron-left" size={24} color={previousDisabled ? M3.outlineVariant : M3.onSurfaceVariant} />
          </Pressable>
          <Text accessibilityRole="header" className="text-m3-on-surface text-sm font-bold tabular-nums">
            {monthLabel}
          </Text>
          <Pressable
            onPress={onNextMonth}
            disabled={nextDisabled}
            className="w-12 h-12 items-center justify-center rounded-full active:bg-m3-surface-container-high"
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: nextDisabled }}
          >
            <MaterialIcons name="chevron-right" size={24} color={nextDisabled ? M3.outlineVariant : M3.onSurfaceVariant} />
          </Pressable>
        </View>
      </View>

      {loading && !error ? (
        <View className="flex-row items-center justify-center gap-2" accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
          <Text className="text-m3-on-surface-variant text-sm">
            {month ? `Refreshing ${monthLabel}` : `Loading ${monthLabel}`}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
          <MaterialIcons name="error-outline" size={18} color={M3.error} />
          <Text className="flex-1 text-m3-on-surface-variant text-sm">Couldn't load {monthLabel}</Text>
          <Pressable
            onPress={onRetry}
            disabled={loading}
            className="min-h-[48px] px-3 items-center justify-center rounded-full active:bg-m3-surface-container-high"
            accessibilityRole="button"
            accessibilityLabel={`Retry loading ${monthLabel}`}
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
            ) : (
              <Text className="text-m3-on-surface text-sm font-semibold">Retry</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {month ? (
        <>
          <View className="flex-row items-center">
            <View className="flex-1 flex-row">
              {WEEKDAYS.map((weekday) => (
                <Text
                  key={weekday.long}
                  accessible
                  accessibilityLabel={weekday.long}
                  className="flex-1 text-center text-m3-on-surface-variant text-compact font-semibold"
                >
                  {weekday.short}
                </Text>
              ))}
            </View>
            <Text
              className="ml-1 text-m3-on-surface-variant text-compact font-semibold"
              style={{ width: summaryWidth }}
            >
              Week
            </Text>
          </View>

          <View className="gap-2">
            {month.weeks.map((week) => (
              <WeekRow key={week.startDate} week={week} size={ringSize} summaryWidth={summaryWidth} currentDate={currentDate} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
