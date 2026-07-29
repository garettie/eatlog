import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { M3 } from '../theme/tokens';
import { DURATION, EASING } from '../theme/motion';

const RING_R = 15;
const RING_STROKE = 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
const DEFAULT_CELL_WIDTH = 48;
const CELL_GAP = 4;

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
  const selection = useSharedValue(isSelected ? 1 : 0);
  const fraction = day.isFuture || day.targetCalories <= 0
    ? 0
    : Math.min(1, day.calories / day.targetCalories);
  const isOver = !day.isFuture && day.targetCalories > 0 && day.calories > day.targetCalories;
  const ringStrokeColor = day.isFuture
    ? 'transparent'
    : isOver
      ? M3.error
      : M3.calories;
  const trackStrokeColor = day.isFuture ? 'transparent' : M3.outline;
  const offset = CIRCUMFERENCE * (1 - fraction);
  const restingBorderColor = day.isToday ? M3.primary : 'rgba(255, 255, 255, 0)';

  useEffect(() => {
    selection.value = withTiming(isSelected ? 1 : 0, {
      duration: reduced ? 0 : DURATION.short,
      easing: EASING.emphasizedDecelerate,
    });
  }, [isSelected, reduced, selection]);

  const selectionStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      selection.value,
      [0, 1],
      ['rgba(51, 53, 58, 0)', M3.surfaceContainerHighest],
    ),
    borderColor: interpolateColor(
      selection.value,
      [0, 1],
      [restingBorderColor, M3.primary],
    ),
    transform: [{ scale: 0.96 + selection.value * 0.04 }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      selection.value,
      [0, 1],
      [
        day.isToday
          ? M3.primary
          : day.isFuture
            ? 'rgba(196, 198, 208, 0.3)'
            : M3.onSurface,
        M3.onSurface,
      ],
    ),
  }));

  return (
    <Pressable
      onLayout={onFirstLayout
        ? (event) => onFirstLayout(event.nativeEvent.layout.width)
        : undefined}
      onPress={() => onSelectDate(day.isoDate)}
      disabled={day.isFuture}
      className="items-center py-1 px-1.5 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={day.date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }) + (day.isToday ? ', today' : '')}
      accessibilityState={{ selected: isSelected, disabled: day.isFuture }}
      accessibilityHint={day.isFuture ? undefined : `${Math.round(day.calories)} of ${Math.round(day.targetCalories)} calories logged`}
    >
      <Text className={`text-[10px] font-semibold mb-0.5 ${
        day.isToday
          ? 'text-m3-primary'
          : day.isFuture
            ? 'text-m3-on-surface-variant/30'
            : 'text-m3-on-surface-variant'
      }`}>
        {day.dayLetter}
      </Text>

      <Animated.View
        className="items-center justify-center rounded-full"
        style={[
          {
            width: 36,
            height: 36,
            borderWidth: 1.5,
          },
          selectionStyle,
        ]}
      >
        <Svg width={36} height={36} viewBox="0 0 36 36" style={{ position: 'absolute' }}>
          {!day.isFuture && (
            <Circle
              cx={18}
              cy={18}
              r={RING_R}
              fill="none"
              stroke={trackStrokeColor}
              strokeWidth={RING_STROKE}
              opacity={0.5}
            />
          )}
          {fraction > 0 && (
            <Circle
              cx={18}
              cy={18}
              r={RING_R}
              fill="none"
              stroke={ringStrokeColor}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              rotation={-90}
              originX={18}
              originY={18}
            />
          )}
        </Svg>
        <Animated.Text className="text-xs font-bold tabular-nums" style={textStyle}>
          {day.dayNumber}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
});

export default function DayStrip({ days, selectedDate, monthLabel, onSelectDate, onPrevMonth, onNextMonth, canGoNext = true }: DayStripProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [cellWidth, setCellWidth] = useState(DEFAULT_CELL_WIDTH);
  useEffect(() => {
    const idx = days.findIndex((d) => d.isoDate === selectedDate);
    if (idx !== -1 && scrollRef.current) {
      const x = Math.max(0, idx * (cellWidth + CELL_GAP) - 20);
      scrollRef.current.scrollTo({ x, animated: false });
    }
  }, [cellWidth, monthLabel]);

  const handleFirstLayout = React.useCallback((measured: number) => {
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

        <Text className="text-m3-on-surface text-sm font-bold">
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

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-2 pb-2 gap-1"
      >
        {days.map((day) => {
          return (
            <DayButton
              key={day.isoDate}
              day={day}
              isSelected={day.isoDate === selectedDate}
              onSelectDate={onSelectDate}
              onFirstLayout={day === days[0] ? handleFirstLayout : undefined}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
