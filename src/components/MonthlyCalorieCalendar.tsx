import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';

import { M3, TYPE } from '../theme/tokens';
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
const CALENDAR_ROW_HEIGHT = 40;
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
  requestedMonthLabel: string;
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

function signedCalories(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatCalories(Math.abs(value))}`;
}

function weekAccessibilityLabel(week: CalorieCalendarWeek): string {
  if (week.loggedDays === 0) return 'No calories logged';
  const total = `${formatCalories(week.totalCalories)} calories total`;
  if (week.deltaCalories == null) return `${total}, target unavailable`;
  if (week.deltaCalories === 0) return `${total}, on target`;
  return `${total}, ${formatCalories(Math.abs(week.deltaCalories))} calories ${week.deltaCalories > 0 ? 'over' : 'under'} target`;
}

function selectedDateLabel(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function WeekRow({
  week,
  size,
  dayAreaWidth,
  summaryWidth,
  currentDate,
  selectedDate,
  onSelectDate,
}: {
  week: CalorieCalendarWeek;
  size: number;
  dayAreaWidth: number;
  summaryWidth: number;
  currentDate: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const accessibilityLabel = `Week ${dateLabel(week.startDate)} through ${dateLabel(week.endDate)}: ${weekAccessibilityLabel(week)}`;
  const deviationColor = week.deltaCalories != null && week.deltaCalories > 0
    ? M3.caloriesOverflow
    : M3.calories;
  const cellWidth = dayAreaWidth / 7;
  const ringScale = size / RING_VIEWBOX_SIZE;
  const ringRadius = RING_R * ringScale;
  const ringStroke = RING_STROKE * ringScale;
  const circumference = 2 * Math.PI * ringRadius;
  const centerY = CALENDAR_ROW_HEIGHT / 2;

  return (
    <View className="flex-row items-center py-1">
      <View style={{ width: dayAreaWidth, height: CALENDAR_ROW_HEIGHT }}>
        <Svg width={dayAreaWidth} height={CALENDAR_ROW_HEIGHT} accessible={false}>
          {week.days.map((day, index) => {
            const centerX = cellWidth * (index + 0.5);
            const overflowProgress = day.status === 'over' && day.calories != null && day.targetCalories != null
              ? targetOverflowProgress(day.calories, day.targetCalories)
              : 0;
            const isToday = day.date === currentDate;
            const muted = !day.inMonth;
            const future = day.status === 'future';
            const targetUnavailable = day.status === 'target-unavailable';
            const selected = selectedDate === day.date;
            const ringOpacity = muted ? 0.55 : future ? 0.45 : 1;

            return (
              <React.Fragment key={day.date}>
                {selected ? (
                  <Circle
                    cx={centerX}
                    cy={centerY}
                    r={size / 2}
                    fill={M3.surfaceContainerHighest}
                  />
                ) : null}
                {isToday ? (
                  <Circle
                    cx={centerX}
                    cy={centerY}
                    r={Math.max(0, (size - 1) / 2)}
                    fill="none"
                    stroke={M3.primary}
                    strokeWidth={1}
                  />
                ) : null}
                <G opacity={ringOpacity}>
                  <Circle
                    cx={centerX}
                    cy={centerY}
                    r={ringRadius}
                    fill="none"
                    stroke={targetUnavailable ? M3.onSurfaceVariant : M3.outline}
                    strokeWidth={ringStroke}
                    strokeDasharray={targetUnavailable ? `${2 * ringScale} ${3 * ringScale}` : undefined}
                    opacity={targetUnavailable ? 0.85 : 0.5}
                  />
                  {day.progress > 0 ? (
                    <Circle
                      cx={centerX}
                      cy={centerY}
                      r={ringRadius}
                      fill="none"
                      stroke={M3.calories}
                      strokeWidth={ringStroke}
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - day.progress)}
                      rotation={-90}
                      originX={centerX}
                      originY={centerY}
                    />
                  ) : null}
                  {overflowProgress > 0 ? (
                    <Circle
                      cx={centerX}
                      cy={centerY}
                      r={ringRadius}
                      fill="none"
                      stroke={M3.caloriesOverflow}
                      strokeWidth={ringStroke}
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - overflowProgress)}
                      rotation={-90}
                      originX={centerX}
                      originY={centerY}
                    />
                  ) : null}
                </G>
                <SvgText
                  x={centerX}
                  y={centerY + 4}
                  fill={isToday ? M3.primary : muted || future ? M3.onSurfaceVariant : M3.onSurface}
                  fontSize={12}
                  fontFamily={TYPE.family.bold}
                  fontWeight="400"
                  textAnchor="middle"
                >
                  {parseLocalISO(day.date).getDate()}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
        <View
          className="absolute inset-0 flex-row"
          importantForAccessibility="no"
        >
          {week.days.map((day) => {
            const selected = selectedDate === day.date;
            return (
              <Pressable
                key={day.date}
                onPress={() => onSelectDate(day.date)}
                accessibilityRole="button"
                accessibilityLabel={`${dateLabel(day.date)}: ${statusLabel(day)}`}
                accessibilityHint="Shows calorie details for this day"
                accessibilityState={{ selected }}
                className="items-center justify-center active:opacity-80"
                style={{ width: cellWidth, height: CALENDAR_ROW_HEIGHT }}
                hitSlop={{ top: 4, bottom: 4, left: 7, right: 7 }}
              />
            );
          })}
        </View>
      </View>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel}
        className="ml-2 items-end justify-center"
        style={{ width: summaryWidth, minHeight: CALENDAR_ROW_HEIGHT }}
      >
        {week.loggedDays === 0 ? (
          <Text className="text-m3-on-surface-variant text-compact font-semibold text-right">No logs</Text>
        ) : (
          <>
            <Text className="text-m3-on-surface text-compact font-semibold tabular-nums text-right">
              {formatCalories(week.totalCalories)} kcal
            </Text>
            <Text className="text-compact font-semibold tabular-nums text-right" style={{ color: deviationColor }}>
              {week.deltaCalories == null ? 'No target' : signedCalories(week.deltaCalories)}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const MemoizedWeekRow = React.memo(WeekRow);

function MonthlyCalorieCalendar({
  month,
  monthLabel,
  requestedMonthLabel,
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedDay = useMemo(
    () => month?.weeks.flatMap((week) => week.days).find((day) => day.date === selectedDate) ?? null,
    [month, selectedDate],
  );
  useEffect(() => {
    setSelectedDate(null);
  }, [month?.monthStart]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setContentWidth(event.nativeEvent.layout.width);
  }, []);
  const baseSummaryWidth = contentWidth < 300 ? 92 : contentWidth < 380 ? 104 : 120;
  const summaryWidth = baseSummaryWidth + (fontScale > 1.2 ? 12 : 0);
  const dayAreaWidth = contentWidth > 0
    ? Math.max(7, contentWidth - summaryWidth - 8)
    : 26 * 7;
  const dayWidth = dayAreaWidth / 7;
  const ringSize = Math.max(22, Math.min(36, Math.floor(dayWidth - 2)));
  const previousDisabled = loading;
  const nextDisabled = loading || isCurrentMonth;

  return (
    <View className="gap-3" onLayout={handleLayout}>
      <View className="gap-1">
        <View className="gap-0.5">
          <Text className="text-m3-on-surface text-base font-bold">Weekly target adherence</Text>
          <Text className="text-m3-on-surface-variant text-xs">Daily calories by month</Text>
        </View>
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
            Loading {requestedMonthLabel}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
          <MaterialIcons name="error-outline" size={18} color={M3.error} />
          <Text className="flex-1 text-m3-on-surface-variant text-sm">
            Couldn't load {requestedMonthLabel}{month ? `. Showing ${monthLabel}.` : '.'}
          </Text>
          <Pressable
            onPress={onRetry}
            disabled={loading}
            className="min-h-[48px] px-3 items-center justify-center rounded-full active:bg-m3-surface-container-high"
            accessibilityRole="button"
            accessibilityLabel={`Retry loading ${requestedMonthLabel}`}
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
          <View className="flex-row items-center justify-center">
            <View className="flex-row items-center justify-center" style={{ width: dayAreaWidth }}>
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
            <View className="ml-2 items-end" style={{ width: summaryWidth }}>
              <Text className="text-m3-on-surface-variant text-compact font-semibold text-right">
                Week total
              </Text>
              <Text className="text-m3-on-surface-variant text-compact text-right">
                vs target
              </Text>
            </View>
          </View>

          <View className="gap-2">
            {month.weeks.map((week) => (
              <MemoizedWeekRow
                key={week.startDate}
                week={week}
                size={ringSize}
                dayAreaWidth={dayAreaWidth}
                summaryWidth={summaryWidth}
                currentDate={currentDate}
                selectedDate={week.days.some((day) => day.date === selectedDate) ? selectedDate : null}
                onSelectDate={setSelectedDate}
              />
            ))}
          </View>

          {selectedDay ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${dateLabel(selectedDay.date)}: ${statusLabel(selectedDay)}`}
              accessibilityLiveRegion="polite"
              className="flex-row items-center justify-between gap-3 rounded-2xl bg-m3-surface-container-high px-3 py-2.5"
            >
              <Text className="flex-1 text-m3-on-surface text-xs font-semibold">
                {selectedDateLabel(selectedDay.date)}
              </Text>
              {selectedDay.calories == null ? (
                <Text className="text-m3-on-surface-variant text-xs font-semibold">
                  {selectedDay.status === 'future' ? 'Future day' : 'No log'}
                </Text>
              ) : (
                <View className="items-end">
                  <Text className="text-m3-on-surface text-xs font-bold tabular-nums">
                    {formatCalories(selectedDay.calories)} kcal
                  </Text>
                  <Text
                    className="text-compact font-semibold tabular-nums"
                    style={{
                      color: selectedDay.deltaCalories != null && selectedDay.deltaCalories > 0
                        ? M3.caloriesOverflow
                        : M3.calories,
                    }}
                  >
                    {selectedDay.deltaCalories == null ? 'No target' : `${signedCalories(selectedDay.deltaCalories)} vs target`}
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export default React.memo(MonthlyCalorieCalendar);
