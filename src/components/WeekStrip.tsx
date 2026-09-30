import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Reanimated, {
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
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
  selectedDate: string;
}

interface MonthLayerProps {
  days: DayCell[];
  selectedDate: string;
  active: boolean;
  /** The second layer sits over the first, so the two months share one position. */
  stacked: boolean;
  onSelectDate: (isoDate: string) => void;
  opacity: SharedValue<number>;
  offset: SharedValue<number>;
}

/** One month of days with its own sliding disc. */
const MonthLayer = React.memo(function MonthLayer({
  days,
  selectedDate,
  active,
  stacked,
  onSelectDate,
  opacity,
  offset,
}: MonthLayerProps) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [cellWidth, setCellWidth] = useState(DEFAULT_CELL_WIDTH);
  const [discTop, setDiscTop] = useState<number | null>(null);
  const viewportWidthRef = useRef(0);
  const scrolledKeyRef = useRef<string | null>(null);
  const monthKey = days[0]?.isoDate ?? '';

  const layerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: offset.value }],
  }));

  const indicatorX = useSharedValue(-DISC_SIZE);
  const indicatorOpacity = useSharedValue(0);
  const placedRef = useRef<string | null>(null);
  const centersRef = useRef<number[]>([]);
  const selectedIndex = days.findIndex((d) => d.isoDate === selectedDate);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const [selectedMeasure, setSelectedMeasure] = useState(0);
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: indicatorOpacity.value,
    transform: [{ translateX: indicatorX.value - DISC_SIZE / 2 }],
  }));

  const scrollToSelected = useCallback((monthDays: DayCell[], date: string) => {
    const scroll = scrollRef.current;
    const viewport = viewportWidthRef.current;
    if (!scroll || viewport <= 0) return false;
    let idx = monthDays.findIndex((d) => d.isoDate === date);
    if (idx === -1) {
      const today = monthDays.find((d) => d.isToday);
      idx = today ? monthDays.indexOf(today) : monthDays.length - 1;
    }
    if (idx < 0) return false;
    const step = cellWidth + CELL_GAP;
    const maxScroll = Math.max(0, monthDays.length * step - viewport);
    scroll.scrollTo({ x: Math.min(Math.max(0, idx * step - 20), maxScroll), animated: false });
    return true;
  }, [cellWidth]);

  // A new month opens on the selected day. The layer is invisible until it enters, so the jump is free.
  useLayoutEffect(() => {
    if (monthKey !== scrolledKeyRef.current && scrollToSelected(days, selectedDate)) {
      scrolledKeyRef.current = monthKey;
    }
  }, [days, monthKey, scrollToSelected, selectedDate]);

  // One disc slides between days within a month; it jumps when the month changes.
  useLayoutEffect(() => {
    const x = selectedIndex < 0 ? undefined : centersRef.current[selectedIndex];
    if (x == null) {
      // Not in this month, or not measured yet; a measurement re-runs this.
      placedRef.current = null;
      indicatorOpacity.value = 0;
      return;
    }
    const slide = !reduced && placedRef.current === monthKey;
    placedRef.current = monthKey;
    indicatorX.value = slide
      ? withTiming(x, { duration: DURATION.medium, easing: EASING.emphasized })
      : x;
    indicatorOpacity.value = 1;
  }, [indicatorOpacity, indicatorX, monthKey, reduced, selectedIndex, selectedMeasure]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    if (w > 0) viewportWidthRef.current = w;
    if (monthKey !== scrolledKeyRef.current && scrollToSelected(days, selectedDate)) {
      scrolledKeyRef.current = monthKey;
    }
  }, [days, monthKey, scrollToSelected, selectedDate]);

  const handleMeasure = useCallback((index: number, width: number, center: number, measuredDiscTop: number) => {
    if (index === 0) setCellWidth((current) => (Math.abs(width - current) > 0.5 ? width : current));
    if (measuredDiscTop > 0) setDiscTop((current) => (current === measuredDiscTop ? current : measuredDiscTop));
    if (centersRef.current[index] === center) return;
    centersRef.current[index] = center;
    if (index === selectedIndexRef.current) setSelectedMeasure((count) => count + 1);
  }, []);

  return (
    <Reanimated.View
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      className={stacked ? 'absolute top-0 left-0 right-0' : undefined}
      style={layerStyle}
    >
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
            {days.map((day, index) => (
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
  );
});

function MonthLabel({ label, active, opacity, offset }: {
  label: string;
  active: boolean;
  opacity: SharedValue<number>;
  offset: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: offset.value }],
  }));
  return (
    // Never a touch target: a label that left sits translated over a chevron, and a touch that
    // lands on it would never reach the chevron's Pressable.
    <Reanimated.View
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center"
      style={style}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      <Text accessibilityRole="header" className="text-m3-on-surface text-sm font-bold">
        {label}
      </Text>
    </Reanimated.View>
  );
}

interface StripState {
  /** The layer showing the current month; the other holds the month that is leaving. */
  front: 0 | 1;
  frontKey: string;
  back: StripSnapshot;
  direction: number;
  /** Bumps per month change; that commit's layout effect plays the exit and entrance. */
  transition: number;
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
  const monthKey = days[0]?.isoDate ?? '';

  // A month change runs along the same time axis as a day change. The new month commits into the
  // hidden layer in the same render as the tap, so the swap after the exit is a hand-off on the UI
  // thread rather than a React commit, which would stall every running animation until it mounted.
  const lastFrontRef = useRef<StripSnapshot>({ days, monthLabel, selectedDate });
  const transitionAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [strip, setStrip] = useState<StripState>(() => ({
    front: 0,
    frontKey: monthKey,
    // Both layers start with real content, so a first scroll in the hidden layer has a real width.
    back: lastFrontRef.current,
    direction: 0,
    transition: 0,
  }));
  if (monthKey !== strip.frontKey) {
    // A change that lands before the pending month began entering reuses its still-invisible layer,
    // so the month already leaving keeps leaving instead of being overwritten mid-exit.
    const reuse = !reduced && performance.now() - transitionAtRef.current < DURATION.exit;
    setStrip({
      front: reuse ? strip.front : strip.front === 0 ? 1 : 0,
      frontKey: monthKey,
      back: reuse ? strip.back : lastFrontRef.current,
      direction: monthKey > strip.frontKey ? 1 : -1,
      transition: strip.transition + 1,
    });
  }

  useLayoutEffect(() => {
    lastFrontRef.current = { days, monthLabel, selectedDate };
  });

  const opacityA = useSharedValue(1);
  const opacityB = useSharedValue(0);
  const offsetA = useSharedValue(0);
  const offsetB = useSharedValue(0);
  const opacities = [opacityA, opacityB];
  const offsets = [offsetA, offsetB];

  useLayoutEffect(() => {
    if (strip.transition === 0) return;
    const front = strip.front;
    const back = front === 0 ? 1 : 0;
    if (reduced) {
      opacities[front].value = 1;
      offsets[front].value = 0;
      opacities[back].value = 0;
      return;
    }
    transitionAtRef.current = performance.now();
    const exit = { duration: DURATION.exit, easing: EASING.emphasizedAccelerate };
    offsets[back].value = withTiming(-MONTH_SHIFT * strip.direction, exit);
    opacities[back].value = withTiming(0, exit);
    offsets[front].value = MONTH_SHIFT * strip.direction;
    offsets[front].value = withDelay(DURATION.exit, withTiming(0, {
      duration: DURATION.medium,
      easing: EASING.emphasizedDecelerate,
    }));
    opacities[front].value = 0;
    opacities[front].value = withDelay(DURATION.exit, withTiming(1, {
      duration: DURATION.enter,
      easing: EASING.emphasizedDecelerate,
    }));
    // Shared values are stable; the transition counter is the only trigger.
  }, [strip.transition]);

  const layer = (index: 0 | 1) => {
    const active = index === strip.front;
    return {
      days: active ? days : strip.back.days,
      selectedDate: active ? selectedDate : strip.back.selectedDate,
      monthLabel: active ? monthLabel : strip.back.monthLabel,
      active,
      opacity: opacities[index],
      offset: offsets[index],
    };
  };
  const layers = [layer(0), layer(1)];

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

        <View className="flex-1 self-stretch">
          {layers.map((l, index) => (
            <MonthLabel key={index} label={l.monthLabel} active={l.active} opacity={l.opacity} offset={l.offset} />
          ))}
        </View>

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

      <View>
        {layers.map((l, index) => (
          <MonthLayer
            key={index}
            days={l.days}
            selectedDate={l.selectedDate}
            active={l.active}
            stacked={index === 1}
            onSelectDate={onSelectDate}
            opacity={l.opacity}
            offset={l.offset}
          />
        ))}
      </View>
    </View>
  );
}
