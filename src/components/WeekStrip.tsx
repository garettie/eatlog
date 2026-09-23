import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Reanimated, {
  runOnJS,
  type SharedValue,
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
/** How far the strip travels along the time axis when the month changes. */
const MONTH_SHIFT = 24;
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
  index: number;
  isSelected: boolean;
  onSelectDate: (isoDate: string) => void;
  /** Reports this day's measured center and disc top, in the day row's coordinates. */
  onMeasure: (index: number, width: number, center: number, discTop: number) => void;
  /** Center x of the sliding selection disc, in the day row's coordinates. */
  indicatorX: SharedValue<number>;
  indicatorOpacity: SharedValue<number>;
}

const DayButton = React.memo(function DayButton({
  day,
  index,
  isSelected,
  onSelectDate,
  onMeasure,
  indicatorX,
  indicatorOpacity,
}: DayButtonProps) {
  // Measured, not computed: the disc lines up with wherever layout actually put this day.
  const layoutRef = useRef({ x: 0, width: 0, discTop: 0 });
  const center = useSharedValue(Number.NEGATIVE_INFINITY);

  const baseNumberColor = day.isToday
    ? M3.primary
    : day.isFuture
      ? M3.onSurfaceVariant
      : M3.onSurface;
  // The number inverts wherever the sliding disc covers it, so it reads through the whole slide.
  // A dark copy fades in over the base number: opacity stays on the UI thread's fast path, where an
  // animated text color would re-render text every frame.
  const invertedStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.abs(indicatorX.value - center.value) / (DISC_SIZE * 0.75)) * indicatorOpacity.value,
  }));

  const reportLayout = () => {
    const { x, width, discTop } = layoutRef.current;
    if (width <= 0) return;
    center.value = x + width / 2;
    onMeasure(index, width, x + width / 2, discTop);
  };

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
      onLayout={(event) => {
        layoutRef.current.x = event.nativeEvent.layout.x;
        layoutRef.current.width = event.nativeEvent.layout.width;
        reportLayout();
      }}
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

      <View
        className="items-center justify-center"
        style={{ width: DAY_SIZE, height: DAY_SIZE }}
        onLayout={(event) => {
          layoutRef.current.discTop = event.nativeEvent.layout.y + (DAY_SIZE - DISC_SIZE) / 2;
          reportLayout();
        }}
      >
        {day.isToday && (
          <View
            className="absolute rounded-full bg-m3-primary"
            style={{ width: DISC_SIZE, height: DISC_SIZE, opacity: CALENDAR_DAY.todayDiscOpacity }}
          />
        )}
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
        <Text className="text-xs font-bold tabular-nums" style={{ color: baseNumberColor }}>
          {day.dayNumber}
        </Text>
        <Reanimated.View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
          style={invertedStyle}
          importantForAccessibility="no-hide-descendants"
        >
          <Text className="text-xs font-bold tabular-nums text-m3-on-primary">{day.dayNumber}</Text>
        </Reanimated.View>
      </View>
    </Pressable>
  );
});

interface StripSnapshot {
  days: DayCell[];
  monthLabel: string;
  key: string;
}

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
  const [discTop, setDiscTop] = useState<number | null>(null);
  const viewportWidthRef = useRef(0);
  const scrolledKeyRef = useRef<string | null>(null);
  const monthKey = days[0]?.isoDate ?? '';
  const latestKeyRef = useRef(monthKey);
  latestKeyRef.current = monthKey;

  // A month change runs along the same time axis as a day change: the old month stays on screen
  // while it leaves, the new one swaps in while invisible, then enters from the side it lives on.
  const [leaving, setLeaving] = useState<StripSnapshot | null>(null);
  const [shownKey, setShownKey] = useState(monthKey);
  const lastShownRef = useRef<StripSnapshot>({ days, monthLabel, key: monthKey });
  const enterDirectionRef = useRef(0);
  if (monthKey !== shownKey && leaving == null) {
    if (reduced) setShownKey(monthKey);
    else setLeaving(lastShownRef.current);
  }
  const shown: StripSnapshot = leaving ?? { days, monthLabel, key: monthKey };

  const periodOffset = useSharedValue(0);
  const periodOpacity = useSharedValue(1);
  const periodStyle = useAnimatedStyle(() => ({
    opacity: periodOpacity.value,
    transform: [{ translateX: periodOffset.value }],
  }));

  const indicatorX = useSharedValue(-DISC_SIZE);
  const indicatorOpacity = useSharedValue(0);
  const placedRef = useRef<string | null>(null);
  const centersRef = useRef<number[]>([]);
  const selectedIndex = shown.days.findIndex((d) => d.isoDate === selectedDate);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const [selectedMeasure, setSelectedMeasure] = useState(0);
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: indicatorOpacity.value,
    transform: [{ translateX: indicatorX.value - DISC_SIZE / 2 }],
  }));

  const scrollToSelected = useCallback((snapshot: StripSnapshot, date: string) => {
    const scroll = scrollRef.current;
    const viewport = viewportWidthRef.current;
    if (!scroll || viewport <= 0) return false;
    let idx = snapshot.days.findIndex((d) => d.isoDate === date);
    if (idx === -1) {
      const today = snapshot.days.find((d) => d.isToday);
      idx = today ? snapshot.days.indexOf(today) : snapshot.days.length - 1;
    }
    if (idx < 0) return false;
    const step = cellWidth + CELL_GAP;
    const maxScroll = Math.max(0, snapshot.days.length * step - viewport);
    scroll.scrollTo({ x: Math.min(Math.max(0, idx * step - 20), maxScroll), animated: false });
    return true;
  }, [cellWidth]);

  const finishMonthExit = useCallback((direction: number) => {
    enterDirectionRef.current = direction;
    setLeaving(null);
    setShownKey(latestKeyRef.current);
  }, []);

  useLayoutEffect(() => {
    if (!leaving) return;
    const direction = latestKeyRef.current > leaving.key ? 1 : -1;
    const exit = { duration: DURATION.exit, easing: EASING.emphasizedAccelerate };
    periodOffset.value = withTiming(-MONTH_SHIFT * direction, exit);
    periodOpacity.value = withTiming(0, exit, (finished) => {
      if (finished) runOnJS(finishMonthExit)(direction);
    });
  }, [finishMonthExit, leaving, periodOffset, periodOpacity]);

  useLayoutEffect(() => {
    if (leaving) return;
    lastShownRef.current = shown;
    // A new month opens on the selected day. Mid-transition it is still invisible, so the jump is free.
    if (shown.key !== scrolledKeyRef.current && scrollToSelected(shown, selectedDate)) {
      scrolledKeyRef.current = shown.key;
    }
    const direction = enterDirectionRef.current;
    if (direction === 0) return;
    enterDirectionRef.current = 0;
    periodOffset.value = MONTH_SHIFT * direction;
    periodOffset.value = withTiming(0, { duration: DURATION.medium, easing: EASING.emphasizedDecelerate });
    periodOpacity.value = withTiming(1, { duration: DURATION.enter, easing: EASING.emphasizedDecelerate });
  });

  // One disc slides between days within a month; it jumps when the month changes.
  useLayoutEffect(() => {
    if (leaving) return;
    const x = selectedIndex < 0 ? undefined : centersRef.current[selectedIndex];
    if (x == null) {
      // Not in this month, or not measured yet; a measurement re-runs this.
      placedRef.current = null;
      indicatorOpacity.value = 0;
      return;
    }
    const slide = !reduced && placedRef.current === shown.key;
    placedRef.current = shown.key;
    indicatorX.value = slide
      ? withTiming(x, { duration: DURATION.medium, easing: EASING.emphasized })
      : x;
    indicatorOpacity.value = 1;
  }, [indicatorOpacity, indicatorX, leaving, reduced, selectedIndex, selectedMeasure, shown.key]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    if (w > 0) viewportWidthRef.current = w;
    const current = lastShownRef.current;
    if (current.key !== scrolledKeyRef.current && scrollToSelected(current, selectedDate)) {
      scrolledKeyRef.current = current.key;
    }
  }, [scrollToSelected, selectedDate]);

  const handleMeasure = useCallback((index: number, width: number, center: number, measuredDiscTop: number) => {
    if (index === 0) setCellWidth((current) => (Math.abs(width - current) > 0.5 ? width : current));
    if (measuredDiscTop > 0) setDiscTop((current) => (current === measuredDiscTop ? current : measuredDiscTop));
    if (centersRef.current[index] === center) return;
    centersRef.current[index] = center;
    if (index === selectedIndexRef.current) setSelectedMeasure((count) => count + 1);
  }, []);

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

        <Reanimated.View style={periodStyle}>
          <Text accessibilityRole="header" className="text-m3-on-surface text-sm font-bold">
            {shown.monthLabel}
          </Text>
        </Reanimated.View>

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
          contentContainerClassName="px-2 pb-2"
          onLayout={handleLayout}
        >
          {/* No padding on this wrapper, so the disc and the day row share one origin. */}
          <View>
            {discTop != null ? (
              <Reanimated.View
                pointerEvents="none"
                className="absolute rounded-full bg-m3-primary"
                style={[{ left: 0, top: discTop, width: DISC_SIZE, height: DISC_SIZE }, indicatorStyle]}
              />
            ) : null}
            <View className="flex-row gap-1">
              {shown.days.map((day, index) => (
                <DayButton
                  key={`month-slot-${index}`}
                  day={day}
                  index={index}
                  isSelected={day.isoDate === selectedDate}
                  onSelectDate={onSelectDate}
                  onMeasure={handleMeasure}
                  indicatorX={indicatorX}
                  indicatorOpacity={indicatorOpacity}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </Reanimated.View>
    </View>
  );
}
