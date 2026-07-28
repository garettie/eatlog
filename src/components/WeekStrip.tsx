import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

import { M3 } from '../theme/tokens';

const RING_R = 15;
const RING_STROKE = 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
const ESTIMATED_CELL_WIDTH = 52;

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
}

export default function DayStrip({ days, selectedDate, monthLabel, onSelectDate, onPrevMonth, onNextMonth }: DayStripProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const idx = days.findIndex((d) => d.isoDate === selectedDate);
    if (idx !== -1 && scrollRef.current) {
      const x = Math.max(0, idx * ESTIMATED_CELL_WIDTH - 20);
      scrollRef.current.scrollTo({ x, animated: false });
    }
  }, [days, selectedDate]);

  return (
    <View>
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
          className="w-12 h-12 items-center justify-center active:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <MaterialIcons name="chevron-right" size={24} color={M3.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-2 pb-2 gap-1"
      >
        {days.map((day) => {
          const isSelected = day.isoDate === selectedDate;
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

          return (
            <Pressable
              key={day.isoDate}
              onPress={() => onSelectDate(day.isoDate)}
              disabled={day.isFuture}
              className="items-center py-1 px-1.5 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel={`${day.dayLetter} ${day.date.getDate()}${day.isToday ? ', today' : ''}`}
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

              <View
                className="items-center justify-center rounded-full"
                style={{
                  width: 36,
                  height: 36,
                  borderWidth: 1.5,
                  borderColor: isSelected
                    ? M3.primary
                    : day.isToday
                      ? M3.primary
                      : 'transparent',
                  backgroundColor: isSelected ? M3.primary : 'transparent',
                }}
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
                <Text className={`text-xs font-bold tabular-nums ${
                  isSelected
                    ? 'text-m3-on-primary'
                    : day.isToday
                      ? 'text-m3-primary'
                      : day.isFuture
                        ? 'text-m3-on-surface-variant/30'
                        : 'text-m3-on-surface'
                }`}>
                  {day.dayNumber}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
