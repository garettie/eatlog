import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { DailyTarget } from '../db/database';
import { DURATION, EASING } from '../theme/motion';
import { M3, TYPE } from '../theme/tokens';
import {
  DailyEnergy,
  EnergyHistoryPoint,
  EnergyRange,
  buildEnergyHistory,
} from '../utils/energyHistory';
import { parseLocalISO } from '../utils/calendar';

interface EnergyChartProps {
  range: EnergyRange;
  startDate: string;
  endDate: string;
  dailyCalories: DailyEnergy[];
  targetHistory: DailyTarget[];
  height: number;
}

const DAY_MS = 86_400_000;
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

function dayNumber(dateISO: string): number {
  const [year, month, day] = dateISO.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function chartX(
  day: number,
  startDay: number,
  endDay: number,
  left: number,
  plotWidth: number,
): number {
  'worklet';
  return left + (day - startDay) / Math.max(1, endDay - startDay) * plotWidth;
}

function chartY(value: number, yMax: number, top: number, plotHeight: number): number {
  'worklet';
  return top + (yMax - value) / Math.max(1, yMax) * plotHeight;
}

function linePath(
  points: readonly EnergyHistoryPoint[],
  pointDays: readonly number[],
  startDay: number,
  endDay: number,
  yMax: number,
  left: number,
  top: number,
  plotWidth: number,
  plotHeight: number,
): string {
  'worklet';
  let path = '';
  let drawing = false;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[index].intakeTrendCalories;
    if (next == null) {
      drawing = false;
      continue;
    }
    const x = chartX(pointDays[index], startDay, endDay, left, plotWidth);
    const y = chartY(next, yMax, top, plotHeight);
    path += `${drawing ? 'L' : 'M'} ${x} ${y} `;
    drawing = true;
  }
  return path;
}

function stepPath(
  points: readonly EnergyHistoryPoint[],
  pointDays: readonly number[],
  valueKey: 'targetCalories' | 'expenditureCalories',
  startDay: number,
  endDay: number,
  yMax: number,
  left: number,
  top: number,
  plotWidth: number,
  plotHeight: number,
): string {
  'worklet';
  let path = '';
  let previousValue: number | null = null;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[index][valueKey];
    if (next == null) {
      previousValue = null;
      continue;
    }
    const x = chartX(pointDays[index], startDay, endDay, left, plotWidth);
    const y = chartY(next, yMax, top, plotHeight);
    if (previousValue == null) {
      path += `M ${x} ${y} `;
    } else {
      path += `L ${x} ${chartY(previousValue, yMax, top, plotHeight)} L ${x} ${y} `;
    }
    previousValue = next;
  }
  return path;
}

function barsPath(
  points: readonly EnergyHistoryPoint[],
  pointDays: readonly number[],
  startDay: number,
  endDay: number,
  yMax: number,
  left: number,
  top: number,
  plotWidth: number,
  plotHeight: number,
): string {
  'worklet';
  let path = '';
  const barSlot = plotWidth / Math.max(1, points.length);
  const barWidth = Math.max(2, Math.min(10, barSlot * 0.62));
  const radius = Math.min(2, barWidth / 2);
  const chartBottom = top + plotHeight;
  for (let index = 0; index < points.length; index += 1) {
    const value = points[index].averageCalories;
    if (value == null) continue;
    const centerX = chartX(pointDays[index], startDay, endDay, left, plotWidth);
    const x = centerX - barWidth / 2;
    const y = chartY(value, yMax, top, plotHeight);
    const barHeight = chartBottom - y;
    if (barHeight <= 0) continue;
    const r = Math.min(radius, barHeight / 2);
    path += `M ${x + r} ${y} H ${x + barWidth - r} A ${r} ${r} 0 0 1 ${x + barWidth} ${y + r} V ${chartBottom - r} A ${r} ${r} 0 0 1 ${x + barWidth - r} ${chartBottom} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${chartBottom - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z `;
  }
  return path;
}

function nearestPointIndex(
  pointDays: readonly number[],
  touchX: number,
  startDay: number,
  endDay: number,
  left: number,
  width: number,
): number {
  'worklet';
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < pointDays.length; index += 1) {
    const x = left + (pointDays[index] - startDay) / Math.max(1, endDay - startDay) * width;
    const distance = Math.abs(x - touchX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

function dateLabel(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function periodLabel(point: EnergyHistoryPoint): string {
  return point.startDate === point.endDate
    ? dateLabel(point.startDate)
    : `${dateLabel(point.startDate)}–${dateLabel(point.endDate)}`;
}

function calorieValue(value: number | null): string {
  return value == null ? '—' : Math.round(value).toLocaleString();
}

function EnergyChart({
  range,
  startDate,
  endDate,
  dailyCalories,
  targetHistory,
  height,
}: EnergyChartProps) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedIndexRef = useRef<number | null>(null);
  const scrubbedIndex = useSharedValue(-1);
  const model = useMemo(
    () => buildEnergyHistory(range, startDate, endDate, dailyCalories, targetHistory),
    [dailyCalories, endDate, range, startDate, targetHistory],
  );
  const values = model.points.flatMap((point) => [
    point.averageCalories,
    point.intakeTrendCalories,
    point.targetCalories,
    point.expenditureCalories,
  ]).filter((value): value is number => value != null);
  const yMax = Math.max(1000, ...values) * 1.08;
  const left = 42;
  const right = 8;
  const top = 8;
  const bottom = 22;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = Math.max(1, height - top - bottom);
  const startDay = dayNumber(startDate);
  const endDay = dayNumber(endDate);
  const pointDays = useMemo(
    () => model.points.map((point) => (dayNumber(point.startDate) + dayNumber(point.endDate)) / 2),
    [model.points],
  );

  const animatedStartDay = useSharedValue(startDay);
  const animatedEndDay = useSharedValue(endDay);
  const animatedYMax = useSharedValue(yMax);

  useEffect(() => {
    scrubbedIndex.value = -1;
    selectedIndexRef.current = null;
    setSelectedIndex(null);
  }, [endDate, range, scrubbedIndex, startDate]);

  useEffect(() => {
    const config = {
      duration: reduced ? 0 : DURATION.medium,
      easing: EASING.emphasized,
    };
    animatedStartDay.value = withTiming(startDay, config);
    animatedEndDay.value = withTiming(endDay, config);
    animatedYMax.value = withTiming(yMax, config);
  }, [animatedEndDay, animatedStartDay, animatedYMax, endDay, reduced, startDay, yMax]);

  const animatedPaths = useDerivedValue(() => ({
    bars: barsPath(
      model.points,
      pointDays,
      animatedStartDay.value,
      animatedEndDay.value,
      animatedYMax.value,
      left,
      top,
      plotWidth,
      plotHeight,
    ),
    intake: linePath(
      model.points,
      pointDays,
      animatedStartDay.value,
      animatedEndDay.value,
      animatedYMax.value,
      left,
      top,
      plotWidth,
      plotHeight,
    ),
    target: stepPath(
      model.points,
      pointDays,
      'targetCalories',
      animatedStartDay.value,
      animatedEndDay.value,
      animatedYMax.value,
      left,
      top,
      plotWidth,
      plotHeight,
    ),
    expenditure: stepPath(
      model.points,
      pointDays,
      'expenditureCalories',
      animatedStartDay.value,
      animatedEndDay.value,
      animatedYMax.value,
      left,
      top,
      plotWidth,
      plotHeight,
    ),
  }));

  const barsProps = useAnimatedProps(() => ({
    d: animatedPaths.value.bars,
  }));
  const intakeProps = useAnimatedProps(() => ({
    d: animatedPaths.value.intake,
  }));
  const targetProps = useAnimatedProps(() => ({
    d: animatedPaths.value.target,
  }));
  const expenditureProps = useAnimatedProps(() => ({
    d: animatedPaths.value.expenditure,
  }));

  const tickPositions = useDerivedValue(() => ({
    top: chartY(yMax, animatedYMax.value, top, plotHeight),
    middle: chartY(yMax / 2, animatedYMax.value, top, plotHeight),
    bottom: chartY(0, animatedYMax.value, top, plotHeight),
  }));
  const gridTopProps = useAnimatedProps(() => ({
    y1: tickPositions.value.top,
    y2: tickPositions.value.top,
  }));
  const gridMidProps = useAnimatedProps(() => ({
    y1: tickPositions.value.middle,
    y2: tickPositions.value.middle,
  }));
  const gridBottomProps = useAnimatedProps(() => ({
    y1: tickPositions.value.bottom,
    y2: tickPositions.value.bottom,
  }));
  const tickTopProps = useAnimatedProps(() => ({
    y: tickPositions.value.top + 3.5,
  }));
  const tickMidProps = useAnimatedProps(() => ({
    y: tickPositions.value.middle + 3.5,
  }));
  const tickBottomProps = useAnimatedProps(() => ({
    y: tickPositions.value.bottom + 3.5,
  }));

  const yForValueStatic = (value: number) => chartY(value, yMax, top, plotHeight);
  const xForDay = (day: number) => chartX(day, startDay, endDay, left, plotWidth);
  const currentTarget = [...targetHistory]
    .filter((target) => target.effective_date <= endDate)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.id - a.id)[0];

  const selectPoint = useCallback((index: number) => {
    const nextIndex = index < 0 || selectedIndexRef.current === index ? null : index;
    selectedIndexRef.current = nextIndex;
    setSelectedIndex(nextIndex);
  }, []);

  const scrubPoint = useCallback((index: number) => {
    if (index < 0 || selectedIndexRef.current === index) return;
    selectedIndexRef.current = index;
    setSelectedIndex(index);
  }, []);

  const panGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-8, 8])
    .onStart((event) => {
      const nextIndex = nearestPointIndex(pointDays, event.x, startDay, endDay, left, plotWidth);
      scrubbedIndex.value = nextIndex;
      runOnJS(scrubPoint)(nextIndex);
    })
    .onUpdate((event) => {
      const nextIndex = nearestPointIndex(pointDays, event.x, startDay, endDay, left, plotWidth);
      if (nextIndex === scrubbedIndex.value) return;
      scrubbedIndex.value = nextIndex;
      runOnJS(scrubPoint)(nextIndex);
    })
    .onFinalize(() => {
      scrubbedIndex.value = -1;
    }), [endDay, plotWidth, pointDays, scrubbedIndex, scrubPoint, startDay]);

  const tapGesture = useMemo(() => Gesture.Tap()
    .maxDistance(12)
    .onEnd((event) => {
      runOnJS(selectPoint)(nearestPointIndex(pointDays, event.x, startDay, endDay, left, plotWidth));
    }), [endDay, plotWidth, pointDays, selectPoint, startDay]);

  const chartGesture = useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture],
  );
  const selectedPoint = selectedIndex == null ? null : model.points[selectedIndex] ?? null;
  const selectedX = selectedIndex == null ? 0 : xForDay(pointDays[selectedIndex]);
  const selectedY = selectedPoint?.averageCalories == null
    ? top + plotHeight
    : yForValueStatic(selectedPoint.averageCalories);
  const tooltipWidth = 172;
  const tooltipLeft = Math.max(left, Math.min(selectedX - tooltipWidth / 2, width - right - tooltipWidth));
  const tooltipTop = selectedY > 82 ? selectedY - 76 : selectedY + 12;
  const selectedAccessibilityText = selectedPoint
    ? `${periodLabel(selectedPoint)}. ${selectedPoint.averageCalories == null ? 'No intake logged' : `Average intake ${Math.round(selectedPoint.averageCalories)} calories`}. Target ${Math.round(selectedPoint.targetCalories ?? 0)} calories. Total daily energy expenditure ${Math.round(selectedPoint.expenditureCalories ?? 0)} calories.`
    : model.loggedDayCount === 0
      ? 'No food logged in this range.'
      : `${model.loggedDayCount} of ${model.totalDayCount} days logged. Average intake ${Math.round(model.averageCalories ?? 0)} calories. Target ${Math.round(currentTarget?.target_calories ?? 0)} calories. Total daily energy expenditure ${Math.round(currentTarget?.tdee_estimate ?? 0)} calories.`;

  return (
    <View className="gap-3">
      <GestureDetector gesture={chartGesture}>
        <View
          style={{ height }}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Calorie history chart"
          accessibilityValue={{ text: selectedAccessibilityText }}
          accessibilityHint="Swipe up or down to move through periods."
          accessibilityActions={[
            { name: 'increment', label: 'Next period' },
            { name: 'decrement', label: 'Previous period' },
          ]}
          onAccessibilityAction={(event) => {
            if (model.points.length === 0) return;
            const current = selectedIndexRef.current;
            const next = event.nativeEvent.actionName === 'increment'
              ? Math.min((current ?? -1) + 1, model.points.length - 1)
              : Math.max((current ?? model.points.length) - 1, 0);
            selectedIndexRef.current = next;
            setSelectedIndex(next);
          }}
        >
          {width > 0 ? (
            <Svg width={width} height={height} accessible={false}>
              <AnimatedLine x1={left} x2={width - right} animatedProps={gridTopProps} stroke={M3.outlineVariant} strokeWidth={1} />
              <AnimatedSvgText
                x={left - 7}
                animatedProps={tickTopProps}
                fill={M3.onSurfaceVariant}
                fontSize={TYPE.compact.fontSize}
                fontFamily={TYPE.family.regular}
                textAnchor="end"
              >
                {Math.round(yMax).toLocaleString()}
              </AnimatedSvgText>
              <AnimatedLine x1={left} x2={width - right} animatedProps={gridMidProps} stroke={M3.outlineVariant} strokeWidth={1} />
              <AnimatedSvgText
                x={left - 7}
                animatedProps={tickMidProps}
                fill={M3.onSurfaceVariant}
                fontSize={TYPE.compact.fontSize}
                fontFamily={TYPE.family.regular}
                textAnchor="end"
              >
                {Math.round(yMax / 2).toLocaleString()}
              </AnimatedSvgText>
              <AnimatedLine x1={left} x2={width - right} animatedProps={gridBottomProps} stroke={M3.outlineVariant} strokeWidth={1} />
              <AnimatedSvgText
                x={left - 7}
                animatedProps={tickBottomProps}
                fill={M3.onSurfaceVariant}
                fontSize={TYPE.compact.fontSize}
                fontFamily={TYPE.family.regular}
                textAnchor="end"
              >
                0
              </AnimatedSvgText>

              <AnimatedPath animatedProps={barsProps} fill={M3.calories} opacity={0.68} />
              <AnimatedPath animatedProps={targetProps} fill="none" stroke={M3.calories} strokeWidth={1.5} strokeDasharray="5 4" />
              <AnimatedPath animatedProps={expenditureProps} fill="none" stroke={M3.expenditure} strokeWidth={1.5} strokeDasharray="2 4" />
              <AnimatedPath animatedProps={intakeProps} fill="none" stroke={M3.onSurface} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" />
              {selectedPoint ? (
                <>
                  <Line
                    x1={selectedX}
                    x2={selectedX}
                    y1={top}
                    y2={top + plotHeight}
                    stroke={M3.onSurfaceVariant}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    opacity={0.7}
                  />
                  {selectedPoint.averageCalories != null ? (
                    <Circle
                      cx={selectedX}
                      cy={selectedY}
                      r={5}
                      fill={M3.surfaceContainer}
                      stroke={M3.calories}
                      strokeWidth={2}
                    />
                  ) : null}
                </>
              ) : null}
              <SvgText x={left} y={height - 3} fill={M3.onSurfaceVariant} fontSize={TYPE.compact.fontSize} fontFamily={TYPE.family.regular}>{dateLabel(startDate)}</SvgText>
              <SvgText x={width - right} y={height - 3} fill={M3.onSurfaceVariant} fontSize={TYPE.compact.fontSize} fontFamily={TYPE.family.regular} textAnchor="end">{dateLabel(endDate)}</SvgText>
            </Svg>
          ) : null}
          {selectedPoint ? (
            <View
              pointerEvents="none"
              className="absolute rounded-xl border border-m3-outline-variant/60 bg-m3-surface-container-highest px-3 py-2"
              style={{ left: tooltipLeft, top: tooltipTop, width: tooltipWidth }}
            >
              <Text className="text-m3-on-surface-variant text-compact font-semibold">
                {periodLabel(selectedPoint)}
              </Text>
              <Text className="text-m3-on-surface text-xs font-bold tabular-nums">
                Intake {calorieValue(selectedPoint.averageCalories)} kcal
              </Text>
              <Text className="text-m3-calories text-compact font-semibold tabular-nums">
                Target {calorieValue(selectedPoint.targetCalories)} kcal
              </Text>
              <Text className="text-m3-expenditure text-compact font-semibold tabular-nums">
                TDEE {calorieValue(selectedPoint.expenditureCalories)} kcal
              </Text>
            </View>
          ) : null}
        </View>
      </GestureDetector>
      <View className="flex-row flex-wrap gap-x-4 gap-y-2" importantForAccessibility="no-hide-descendants">
        <View className="flex-row items-center gap-1.5">
          <View className="h-2 w-2 rounded-sm bg-m3-calories" />
          <Text className="text-m3-on-surface-variant text-compact font-medium">Intake</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-3.5 border-t-2 border-m3-on-surface" />
          <Text className="text-m3-on-surface-variant text-compact font-medium">{range === '1M' ? '7-day average' : 'Weekly average'}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-3.5 border-t border-dashed border-m3-calories" />
          <Text className="text-m3-on-surface-variant text-compact font-medium">Target</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-3.5 border-t border-dashed border-m3-expenditure" />
          <Text className="text-m3-on-surface-variant text-compact font-medium">TDEE</Text>
        </View>
      </View>
    </View>
  );
}

export default React.memo(EnergyChart);
