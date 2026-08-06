import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';

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

function dateLabel(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  const xForDate = (date: string) => left
    + (dayNumber(date) - startDay) / Math.max(1, endDay - startDay) * plotWidth;
  const xForPoint = (point: EnergyHistoryPoint) => (
    xForDate(point.startDate) + xForDate(point.endDate)
  ) / 2;
  const yForValue = (value: number) => top + (yMax - value) / yMax * plotHeight;
  const barSlot = plotWidth / Math.max(1, model.points.length);
  const barWidth = Math.max(2, Math.min(10, barSlot * 0.62));
  const intakePath = linePath(model.points, (point) => point.intakeTrendCalories, xForPoint, yForValue);
  const targetPath = stepPath(model.points, (point) => point.targetCalories, xForPoint, yForValue);
  const expenditurePath = stepPath(model.points, (point) => point.expenditureCalories, xForPoint, yForValue);
  const currentTarget = [...targetHistory]
    .filter((target) => target.effective_date <= endDate)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.id - a.id)[0];
  const planUpdates = targetHistory.filter(
    (target) => target.effective_date >= startDate && target.effective_date <= endDate,
  );
  const accessibilityLabel = model.loggedDayCount === 0
    ? 'Energy history. No food-logged days in this range.'
    : `Energy history. ${model.loggedDayCount} of ${model.totalDayCount} days logged. Average intake ${Math.round(model.averageCalories ?? 0)} calories. Current target ${Math.round(currentTarget?.target_calories ?? 0)} calories. Estimated daily expenditure ${Math.round(currentTarget?.tdee_estimate ?? 0)} calories.`;

  return (
    <View
      className="gap-3"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={{ height }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
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
              const coverage = point.loggedDayCount / point.dayCount;
              return (
                <Rect
                  key={point.startDate}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={top + plotHeight - y}
                  rx={Math.min(2, barWidth / 2)}
                  fill={M3.calories}
                  opacity={0.3 + coverage * 0.45}
                />
              );
            })}
            <Path d={targetPath} fill="none" stroke={M3.calories} strokeWidth={1.25} strokeDasharray="5 4" />
            <Path d={expenditurePath} fill="none" stroke={M3.expenditure} strokeWidth={1.25} strokeDasharray="2 4" />
            <Path d={intakePath} fill="none" stroke={M3.onSurface} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {planUpdates.map((target) => {
              const x = xForDate(target.effective_date);
              return (
                <Line
                  key={target.id}
                  x1={x}
                  x2={x}
                  y1={top}
                  y2={top + plotHeight}
                  stroke={M3.onSurfaceVariant}
                  strokeWidth={1}
                  strokeDasharray="2 5"
                  opacity={0.55}
                />
              );
            })}
            <SvgText x={left} y={height - 3} fill={M3.onSurfaceVariant} fontSize={TYPE.compact.fontSize} fontFamily={TYPE.family.regular}>{dateLabel(startDate)}</SvgText>
            <SvgText x={width - right} y={height - 3} fill={M3.onSurfaceVariant} fontSize={TYPE.compact.fontSize} fontFamily={TYPE.family.regular} textAnchor="end">{dateLabel(endDate)}</SvgText>
          </Svg>
        ) : null}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-2" importantForAccessibility="no-hide-descendants">
        <View className="flex-row items-center gap-1.5">
          <View className="h-2 w-2 rounded-sm bg-m3-calories/70" />
          <Text className="text-m3-on-surface-variant text-compact font-medium">Logged intake</Text>
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
          <Text className="text-m3-on-surface-variant text-compact font-medium">Estimated expenditure</Text>
        </View>
        {planUpdates.length > 0 ? (
          <View className="flex-row items-center gap-1.5">
            <View className="h-3 border-l border-dashed border-m3-on-surface-variant" />
            <Text className="text-m3-on-surface-variant text-compact font-medium">Plan update</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(EnergyChart);
