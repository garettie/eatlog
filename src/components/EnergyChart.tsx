import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { DailyTarget } from '../db/database';
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

function dayNumber(dateISO: string): number {
  const [year, month, day] = dateISO.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function linePath(
  points: readonly EnergyHistoryPoint[],
  value: (point: EnergyHistoryPoint) => number | null,
  x: (point: EnergyHistoryPoint) => number,
  y: (value: number) => number,
): string {
  let path = '';
  let drawing = false;
  for (const point of points) {
    const next = value(point);
    if (next == null) {
      drawing = false;
      continue;
    }
    path += `${drawing ? 'L' : 'M'} ${x(point)} ${y(next)} `;
    drawing = true;
  }
  return path;
}

function stepPath(
  points: readonly EnergyHistoryPoint[],
  value: (point: EnergyHistoryPoint) => number | null,
  x: (point: EnergyHistoryPoint) => number,
  y: (value: number) => number,
): string {
  let path = '';
  let previousValue: number | null = null;
  for (const point of points) {
    const next = value(point);
    if (next == null) {
      previousValue = null;
      continue;
    }
    const nextX = x(point);
    const nextY = y(next);
    if (previousValue == null) {
      path += `M ${nextX} ${nextY} `;
    } else {
      path += `L ${nextX} ${y(previousValue)} L ${nextX} ${nextY} `;
    }
    previousValue = next;
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
  const xForDay = (day: number) => left
    + (day - startDay) / Math.max(1, endDay - startDay) * plotWidth;
  const xForPoint = (point: EnergyHistoryPoint) => (
    xForDay((dayNumber(point.startDate) + dayNumber(point.endDate)) / 2)
  );
  const yForValue = (value: number) => top + (yMax - value) / yMax * plotHeight;
  const barSlot = plotWidth / Math.max(1, model.points.length);
  const barWidth = Math.max(2, Math.min(10, barSlot * 0.62));
  const intakePath = linePath(model.points, (point) => point.intakeTrendCalories, xForPoint, yForValue);
  const targetPath = stepPath(model.points, (point) => point.targetCalories, xForPoint, yForValue);
  const expenditurePath = stepPath(model.points, (point) => point.expenditureCalories, xForPoint, yForValue);
  const currentTarget = [...targetHistory]
    .filter((target) => target.effective_date <= endDate)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.id - a.id)[0];

  useEffect(() => {
    scrubbedIndex.value = -1;
    selectedIndexRef.current = null;
    setSelectedIndex(null);
  }, [endDate, range, scrubbedIndex, startDate]);

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
    : yForValue(selectedPoint.averageCalories);
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
              {[yMax, yMax / 2, 0].map((tick, index) => {
                const y = top + index * plotHeight / 2;
                return (
                  <React.Fragment key={index}>
                    <Line x1={left} x2={width - right} y1={y} y2={y} stroke={M3.outlineVariant} strokeWidth={1} />
                    <SvgText
                      x={left - 7}
                      y={y + 3.5}
                      fill={M3.onSurfaceVariant}
                      fontSize={TYPE.compact.fontSize}
                      fontFamily={TYPE.family.regular}
                      textAnchor="end"
                    >
                      {Math.round(tick).toLocaleString()}
                    </SvgText>
                  </React.Fragment>
                );
              })}
              {model.points.map((point) => {
                if (point.averageCalories == null) return null;
                const x = xForPoint(point) - barWidth / 2;
                const y = yForValue(point.averageCalories);
                return (
                  <Rect
                    key={point.startDate}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={top + plotHeight - y}
                    rx={Math.min(2, barWidth / 2)}
                    fill={M3.calories}
                    opacity={0.68}
                  />
                );
              })}
              <Path d={targetPath} fill="none" stroke={M3.calories} strokeWidth={1.5} strokeDasharray="5 4" />
              <Path d={expenditurePath} fill="none" stroke={M3.expenditure} strokeWidth={1.5} strokeDasharray="2 4" />
              <Path d={intakePath} fill="none" stroke={M3.onSurface} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" />
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
