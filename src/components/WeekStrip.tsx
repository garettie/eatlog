import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Reanimated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { M3 } from '../theme/tokens';
import { targetOverflowProgress } from '../utils/calculations';
import { DURATION, EASING } from '../theme/motion';
import { CALENDAR_DAY } from '../theme/calendarDay';

const DAY_SIZE = CALENDAR_DAY.size;
const DAY_CENTER = DAY_SIZE / 2;
const DISC_SIZE = CALENDAR_DAY.discRadius * 2;
const CIRCUMFERENCE = 2 * Math.PI * CALENDAR_DAY.ringRadius;
const DEFAULT_CELL_WIDTH = 48;
const CELL_GAP = 4;
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

interface DayCell {
  date: Date;
  isoDate: string;
  dayNumber: number;
  dayLetter: string;
  isToday: boolean;
  isFuture: boolean;
  calories: number;
  targetCalories: number;
}

interface DayStripProps {
  days: DayCell[];
  selectedDate: string;
  monthLabel: string;
  onSelectDate: (isoDate: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canGoNext?: boolean;
}

interface DayButtonProps {
  day: DayCell;
  isSelected: boolean;
  onSelectDate: (isoDate: string) => void;
  onFirstLayout?: (width: number) => void;
}

const DayButton = React.memo(function DayButton({
  day,
  isSelected,
  onSelectDate,
  onFirstLayout,
}: DayButtonProps) {
  const reduced = useReducedMotion();
  const selectedProgress = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withTiming(isSelected ? 1 : 0, {
      duration: reduced ? 0 : DURATION.short,
      easing: EASING.emphasized,
    });
  }, [isSelected, reduced, selectedProgress]);

  const baseNumberColor = day.isToday
    ? M3.primary
    : day.isFuture
      ? M3.onSurfaceVariant
      : M3.onSurface;
  const discStyle = useAnimatedStyle(() => ({ opacity: selectedProgress.value }));
  const numberStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selectedProgress.value, [0, 1], [baseNumberColor, M3.onPrimary]),
  }), [baseNumberColor]);

  const fraction = day.isFuture || day.targetCalories <= 0
    ? 0
    : Math.min(1, day.calories / day.targetCalories);
  const overflowFraction = day.isFuture
    ? 0
    : targetOverflowProgress(day.calories, day.targetCalories);
  const offset = CIRCUMFERENCE * (1 - fraction);
  const overflowOffset = CIRCUMFERENCE * (1 - overflowFraction);
  const calorieHint = day.targetCalories > 0
    ? overflowFraction > 0
      ? `${Math.round(day.calories)} calories logged, ${Math.round(day.calories - day.targetCalories)} over target`
      : `${Math.round(day.calories)} of ${Math.round(day.targetCalories)} calories logged`
    : day.calories > 0
      ? `${Math.round(day.calories)} calories logged`
      : 'No calories logged';

  return (
    <Pressable
      onLayout={onFirstLayout
        ? (event) => onFirstLayout(event.nativeEvent.layout.width)
        : undefined}
      onPress={() => onSelectDate(day.isoDate)}
      className="items-center py-1 px-1.5 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={DAY_LABEL_FORMATTER.format(day.date) + (day.isToday ? ', today' : '')}
      accessibilityState={{ selected: isSelected }}
      accessibilityHint={day.isFuture ? 'Select to add food for this day in advance' : calorieHint}
    >
      <Text className={`text-compact font-semibold mb-0.5 ${
        day.isToday
          ? 'text-m3-primary'
          : day.isFuture
            ? 'text-m3-on-surface-variant/60'
            : 'text-m3-on-surface-variant'
      }`}>
        {day.dayLetter}
      </Text>

      <View className="items-center justify-center" style={{ width: DAY_SIZE, height: DAY_SIZE }}>
        {day.isToday && (
          <View
            className="absolute rounded-full bg-m3-primary"
            style={{ width: DISC_SIZE, height: DISC_SIZE, opacity: CALENDAR_DAY.todayDiscOpacity }}
          />
        )}
        <Reanimated.View
          className="absolute rounded-full bg-m3-primary"
          style={[{ width: DISC_SIZE, height: DISC_SIZE }, discStyle]}
        />
        {fraction === 0 && (
          <View
            className="absolute rounded-full"
            style={{
              width: DAY_SIZE,
              height: DAY_SIZE,
              borderWidth: CALENDAR_DAY.ringStroke,
              borderColor: M3.outline,
              opacity: CALENDAR_DAY.trackOpacity,
            }}
          />
        )}
        {fraction > 0 && (
          <Svg width={DAY_SIZE} height={DAY_SIZE} viewBox={`0 0 ${DAY_SIZE} ${DAY_SIZE}`} style={{ position: 'absolute' }}>
            <Circle
              cx={DAY_CENTER}
              cy={DAY_CENTER}
              r={CALENDAR_DAY.ringRadius}
              fill="none"
              stroke={M3.outline}
              strokeWidth={CALENDAR_DAY.ringStroke}
              opacity={CALENDAR_DAY.trackOpacity}
            />
            <Circle
              cx={DAY_CENTER}
              cy={DAY_CENTER}
              r={CALENDAR_DAY.ringRadius}
              fill="none"
              stroke={M3.calories}
              strokeWidth={CALENDAR_DAY.ringStroke}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              rotation={-90}
              originX={DAY_CENTER}
              originY={DAY_CENTER}
            />
            {overflowFraction > 0 ? (
              <Circle
                cx={DAY_CENTER}
                cy={DAY_CENTER}
                r={CALENDAR_DAY.ringRadius}
                fill="none"
                stroke={M3.caloriesOverflow}
                strokeWidth={CALENDAR_DAY.ringStroke}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={overflowOffset}
                rotation={-90}
                originX={DAY_CENTER}
                originY={DAY_CENTER}
              />
            ) : null}
          </Svg>
        )}
        <Reanimated.Text className="text-xs font-bold tabular-nums" style={numberStyle}>
          {day.dayNumber}
        </Reanimated.Text>
      </View>
    </Pressable>
  );
});

export default function DayStrip({
  days,
  selectedDate,
  monthLabel,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  canGoNext = true,
}: DayStripProps) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [cellWidth, setCellWidth] = useState(DEFAULT_CELL_WIDTH);
  const viewportWidthRef = useRef(0);
  const pendingScrollRef = useRef<{ selectedDate: string; monthLabel: string } | null>(null);
  const daysRef = useRef(days);
  const cellWidthRef = useRef(cellWidth);
  const periodOffset = useSharedValue(0);
  const periodOpacity = useSharedValue(1);
  const previousMonthLabelRef = useRef(monthLabel);
  const previousPeriodStartRef = useRef(days[0]?.date.getTime() ?? 0);
  const lastScrollMonthRef = useRef<string | null>(null);
  daysRef.current = days;
  cellWidthRef.current = cellWidth;

  useLayoutEffect(() => {
    if (previousMonthLabelRef.current === monthLabel) return;
    previousMonthLabelRef.current = monthLabel;
    const nextPeriodStart = days[0]?.date.getTime() ?? previousPeriodStartRef.current;
    const direction = nextPeriodStart >= previousPeriodStartRef.current ? 1 : -1;
    previousPeriodStartRef.current = nextPeriodStart;
    if (reduced) return;
    periodOffset.value = 12 * direction;
    periodOpacity.value = 0.72;
    periodOffset.value = withTiming(0, {
      duration: DURATION.medium,
      easing: EASING.emphasizedDecelerate,
    });
    periodOpacity.value = withTiming(1, { duration: DURATION.short });
  }, [days, monthLabel, periodOffset, periodOpacity, reduced]);

  const periodStyle = useAnimatedStyle(() => ({
    opacity: periodOpacity.value,
    transform: [{ translateX: periodOffset.value }],
  }));

  const performScroll = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const viewport = viewportWidthRef.current;
    if (viewport <= 0) return;
    const currentDays = daysRef.current;
    const currentCellWidth = cellWidthRef.current;
    const target = pendingScrollRef.current;
    if (!target) return;

    let idx = currentDays.findIndex((d) => d.isoDate === target.selectedDate);
    if (idx === -1) {
      const today = currentDays.find((d) => d.isToday);
      idx = today ? currentDays.indexOf(today) : currentDays.length - 1;
    }
    if (idx < 0) return;

    const step = currentCellWidth + CELL_GAP;
    const contentWidth = currentDays.length * step;
    const maxScroll = Math.max(0, contentWidth - viewport);
    const x = Math.min(Math.max(0, idx * step - 20), maxScroll);
    scroll.scrollTo({ x, animated: false });
    pendingScrollRef.current = null;
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    if (w > 0) viewportWidthRef.current = w;
    if (pendingScrollRef.current) {
      requestAnimationFrame(() => performScroll());
    }
  }, [performScroll]);

  useEffect(() => {
    if (lastScrollMonthRef.current === monthLabel) return;
    lastScrollMonthRef.current = monthLabel;
    pendingScrollRef.current = { selectedDate, monthLabel };
    requestAnimationFrame(() => performScroll());
  }, [monthLabel, selectedDate, performScroll]);

  const handleFirstLayout = useCallback((measured: number) => {
    if (measured > 0 && Math.abs(measured - cellWidth) > 0.5) setCellWidth(measured);
  }, [cellWidth]);

  return (
    <View className="overflow-hidden">
      <View className="flex-row items-center justify-between px-2 py-2">
        <Pressable
          onPress={onPrevMonth}
          className="w-12 h-12 items-center justify-center active:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <MaterialIcons name="chevron-left" size={24} color={M3.onSurfaceVariant} />
        </Pressable>

        <Text accessibilityRole="header" className="text-m3-on-surface text-sm font-bold">
          {monthLabel}
        </Text>

        <Pressable
          onPress={onNextMonth}
          disabled={!canGoNext}
          className="w-12 h-12 items-center justify-center active:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canGoNext }}
        >
          <MaterialIcons name="chevron-right" size={24} color={canGoNext ? M3.onSurfaceVariant : M3.outlineVariant} />
        </Pressable>
      </View>

      <Reanimated.View style={periodStyle}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-2 pb-2 gap-1"
          onLayout={handleLayout}
        >
          {days.map((day, index) => {
            return (
              <DayButton
                key={`month-slot-${index}`}
                day={day}
                isSelected={day.isoDate === selectedDate}
                onSelectDate={onSelectDate}
                onFirstLayout={day === days[0] ? handleFirstLayout : undefined}
              />
            );
          })}
        </ScrollView>
      </Reanimated.View>
    </View>
  );
}
