import React, { useRef } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

import { M3 } from '../theme/tokens';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const RING_R = 17;
const RING_STROKE = 2.5;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
const SWIPE_THRESHOLD = 40;

interface DayCell {
  date: Date;
  isoDate: string;
  label: string;
  dayLetter: string;
  isToday: boolean;
  isFuture: boolean;
  calories: number;
  targetCalories: number;
}

interface WeekStripProps {
  days: DayCell[];
  selectedDate: string;
  onSelectDate: (isoDate: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  weekLabel: string;
}

export default function WeekStrip({ days, selectedDate, onSelectDate, onPrevWeek, onNextWeek, weekLabel }: WeekStripProps) {
  const slideX = useRef(new Animated.Value(0)).current;
  const gestureX = useRef(0);
  const navInProgress = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (navInProgress.current) return false;
        return Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy);
      },
      onPanResponderMove: (_, gs) => {
        gestureX.current = gs.dx;
        slideX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (navInProgress.current) return;

        if (gs.dx > SWIPE_THRESHOLD) {
          navInProgress.current = true;
          Animated.timing(slideX, {
            toValue: gs.dx * 2,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            gestureX.current = 0;
            slideX.setValue(0);
            onPrevWeek();
            navInProgress.current = false;
          });
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          navInProgress.current = true;
          Animated.timing(slideX, {
            toValue: gs.dx * 2,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            gestureX.current = 0;
            slideX.setValue(0);
            onNextWeek();
            navInProgress.current = false;
          });
        } else {
          Animated.spring(slideX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View>
      <View className="flex-row items-center justify-between px-2 py-2">
        <Pressable
          onPress={() => {
            if (navInProgress.current) return;
            slideX.setValue(300);
            Animated.timing(slideX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
            onPrevWeek();
          }}
          className="w-11 h-11 items-center justify-center active:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Previous week"
        >
          <MaterialIcons name="chevron-left" size={22} color={M3.onSurfaceVariant} />
        </Pressable>

        <Text className="text-m3-on-surface-variant text-[11px] font-semibold">
          {weekLabel}
        </Text>

        <Pressable
          onPress={() => {
            if (navInProgress.current) return;
            slideX.setValue(-300);
            Animated.timing(slideX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
            onNextWeek();
          }}
          className="w-11 h-11 items-center justify-center active:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Next week"
        >
          <MaterialIcons name="chevron-right" size={22} color={M3.onSurfaceVariant} />
        </Pressable>
      </View>

      <Animated.View
        style={{ transform: [{ translateX: slideX }] }}
        {...panResponder.panHandlers}
        className="flex-row justify-around px-2"
      >
        {days.map((day) => {
          const fraction = day.isFuture || day.targetCalories <= 0
            ? 0
            : Math.min(1, day.calories / day.targetCalories);
          const isOver = !day.isFuture && day.targetCalories > 0 && day.calories > day.targetCalories;
          const isSelected = day.isoDate === selectedDate;

          const ringStrokeColor = day.isFuture
            ? 'transparent'
            : isOver
              ? M3.error
              : M3.calories;
          const trackStrokeColor = day.isFuture ? 'transparent' : M3.outline;
          const offset = CIRCUMFERENCE * (1 - fraction);
          const selectionRingColor = day.isToday
            ? M3.primary
            : isSelected
              ? M3.outline
              : 'transparent';

          return (
            <Pressable
              key={day.isoDate}
              onPress={() => onSelectDate(day.isoDate)}
              className="items-center py-2 px-1 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel={`${day.label}${day.isToday ? ', today' : ''}`}
            >
              <Text className={`text-[10px] font-semibold mb-1 ${
                day.isToday
                  ? 'text-m3-primary'
                  : isSelected
                    ? 'text-m3-on-surface'
                    : 'text-m3-on-surface-variant'
              }`}>
                {day.dayLetter}
              </Text>

              <View
                className="items-center justify-center rounded-full"
                style={{
                  width: 42,
                  height: 42,
                  borderWidth: selectionRingColor !== 'transparent' ? 1.5 : 0,
                  borderColor: selectionRingColor !== 'transparent' ? selectionRingColor : undefined,
                }}
              >
                <Svg width={42} height={42} viewBox="0 0 42 42" style={{ position: 'absolute' }}>
                  {!day.isFuture && (
                    <Circle
                      cx={21}
                      cy={21}
                      r={RING_R}
                      fill="none"
                      stroke={trackStrokeColor}
                      strokeWidth={RING_STROKE}
                      opacity={0.5}
                    />
                  )}
                  {fraction > 0 && (
                    <Circle
                      cx={21}
                      cy={21}
                      r={RING_R}
                      fill="none"
                      stroke={ringStrokeColor}
                      strokeWidth={RING_STROKE}
                      strokeLinecap="round"
                      strokeDasharray={CIRCUMFERENCE}
                      strokeDashoffset={offset}
                      rotation={-90}
                      originX={21}
                      originY={21}
                    />
                  )}
                </Svg>
                <Text className={`text-xs font-bold tabular-nums ${
                  day.isToday
                    ? 'text-m3-primary'
                    : isSelected
                      ? 'text-m3-on-surface'
                      : 'text-m3-on-surface'
                }`}>
                  {day.date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}
