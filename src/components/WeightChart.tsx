import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import { WeightLog, WeightUnit } from '../db/database';
import { DURATION, EASING } from '../theme/motion';
import { M3 } from '../theme/tokens';
import { fromKilograms } from '../utils/weightUnits';

interface WeightChartProps {
  logs: WeightLog[];
  startDate: string;
  endDate: string;
  height: number;
  showXAxisLabels?: boolean;
  targetWeightKg?: number | null;
  unit?: WeightUnit;
}

interface ChartPoint {
  day: number;
  scale: number;
  trend: number;
}

const DAY_MS = 86_400_000;
const POINT_RADIUS = 3.25;
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedPath = Animated.createAnimatedComponent(Path);

function dayNumber(dateISO: string): number {
  const [year, month, day] = dateISO.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function chartX(
  day: number,
  startDay: number,
  endDay: number,
  left: number,
  width: number,
): number {
  'worklet';
  return left + (day - startDay) / Math.max(1, endDay - startDay) * width;
}

function chartY(
  value: number,
  min: number,
  max: number,
  top: number,
  height: number,
): number {
  'worklet';
  return top + (max - value) / Math.max(1, max - min) * height;
}

function linePath(
  points: ChartPoint[],
  field: 'scale' | 'trend',
  startDay: number,
  endDay: number,
  min: number,
  max: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  'worklet';
  let path = '';
  let visibleIndex = 0;
  for (const point of points) {
    if (point.day < startDay || point.day > endDay) continue;
    const x = chartX(point.day, startDay, endDay, left, width);
    const y = chartY(point[field], min, max, top, height);
    path += `${visibleIndex === 0 ? 'M' : 'L'} ${x} ${y} `;
    visibleIndex += 1;
  }
  return path;
}

function pointPath(
  points: ChartPoint[],
  startDay: number,
  endDay: number,
  min: number,
  max: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  'worklet';
  let path = '';
  for (const point of points) {
    if (point.day < startDay || point.day > endDay) continue;
    const x = chartX(point.day, startDay, endDay, left, width);
    const y = chartY(point.scale, min, max, top, height);
    path += `M ${x - POINT_RADIUS} ${y} `
      + `a ${POINT_RADIUS} ${POINT_RADIUS} 0 1 0 ${POINT_RADIUS * 2} 0 `
      + `a ${POINT_RADIUS} ${POINT_RADIUS} 0 1 0 ${-POINT_RADIUS * 2} 0 `;
  }
  return path;
}

function endpointPath(
  points: ChartPoint[],
  field: 'scale' | 'trend',
  startDay: number,
  endDay: number,
  min: number,
  max: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  'worklet';
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point.day < startDay || point.day > endDay) continue;
    const x = chartX(point.day, startDay, endDay, left, width);
    const y = chartY(point[field], min, max, top, height);
    return `M ${x - POINT_RADIUS} ${y} `
      + `a ${POINT_RADIUS} ${POINT_RADIUS} 0 1 0 ${POINT_RADIUS * 2} 0 `
      + `a ${POINT_RADIUS} ${POINT_RADIUS} 0 1 0 ${-POINT_RADIUS * 2} 0 `;
  }
  return '';
}

function nearestPointIndex(
  points: ChartPoint[],
  touchX: number,
  startDay: number,
  endDay: number,
  left: number,
  width: number,
  maxDistance: number,
): number {
  'worklet';
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const x = chartX(points[index].day, startDay, endDay, left, width);
    const distance = Math.abs(x - touchX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestDistance <= maxDistance ? nearestIndex : -1;
}

function nearestPointIndex2D(
  points: ChartPoint[],
  touchX: number,
  touchY: number,
  startDay: number,
  endDay: number,
  min: number,
  max: number,
  left: number,
  top: number,
  width: number,
  height: number,
  maxDistance: number,
): number {
  'worklet';
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const x = chartX(point.day, startDay, endDay, left, width);
    const y = chartY(point.scale, min, max, top, height);
    const distance = Math.hypot(x - touchX, y - touchY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestDistance <= maxDistance ? nearestIndex : -1;
}

function WeightChart({
  logs,
  startDate,
  endDate,
  height,
  showXAxisLabels = false,
  targetWeightKg = null,
  unit = 'kg',
}: WeightChartProps) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedIndexRef = useRef<number | null>(null);
  const sorted = useMemo(
    () => [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date)),
    [logs],
  );
  const points = useMemo(
    () => sorted.map((log) => ({
      day: dayNumber(log.log_date),
      scale: log.scale_weight_kg,
      trend: log.trend_weight_kg,
    })),
    [sorted],
  );
  const visible = useMemo(
    () => sorted.filter((log) => log.log_date >= startDate && log.log_date <= endDate),
    [endDate, sorted, startDate],
  );
  const visiblePoints = useMemo(
    () => visible.map((log) => ({
      day: dayNumber(log.log_date),
      scale: log.scale_weight_kg,
      trend: log.trend_weight_kg,
    })),
    [visible],
  );

  const xLabelHeight = showXAxisLabels ? 22 : 4;
  const topPadding = 8;
  const leftPadding = 42;
  const rightPadding = 8;
  const plotHeight = Math.max(1, height - xLabelHeight - topPadding);
  const plotWidth = Math.max(1, width - leftPadding - rightPadding);
  const plotGutter = POINT_RADIUS + 2;
  const dataLeft = leftPadding + plotGutter;
  const dataWidth = Math.max(1, plotWidth - plotGutter * 2);
  const nextStartDay = dayNumber(startDate);
  const nextEndDay = dayNumber(endDate);
  const values = visible.flatMap((log) => [log.scale_weight_kg, log.trend_weight_kg]);
  if (targetWeightKg != null) values.push(targetWeightKg);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;
  const rawRange = Math.max(1, maxValue - minValue);
  const padding = Math.max(0.25, rawRange * 0.1);
  const nextYMin = minValue - padding;
  const nextYMax = maxValue + padding;
  const yTicks = [nextYMax, (nextYMax + nextYMin) / 2, nextYMin];

  const animatedStartDay = useSharedValue(nextStartDay);
  const animatedEndDay = useSharedValue(nextEndDay);
  const animatedYMin = useSharedValue(nextYMin);
  const animatedYMax = useSharedValue(nextYMax);

  useEffect(() => {
    selectedIndexRef.current = null;
    setSelectedIndex(null);
  }, [endDate, startDate]);

  useEffect(() => {
    const config = {
      duration: reduced ? 0 : DURATION.medium,
      easing: EASING.emphasized,
    };
    animatedStartDay.value = withTiming(nextStartDay, config);
    animatedEndDay.value = withTiming(nextEndDay, config);
    animatedYMin.value = withTiming(nextYMin, config);
    animatedYMax.value = withTiming(nextYMax, config);
  }, [
    animatedEndDay,
    animatedStartDay,
    animatedYMax,
    animatedYMin,
    nextEndDay,
    nextStartDay,
    nextYMax,
    nextYMin,
    reduced,
  ]);

  const scalePathProps = useAnimatedProps(() => ({
    d: linePath(
      points,
      'scale',
      animatedStartDay.value,
      animatedEndDay.value,
      animatedYMin.value,
      animatedYMax.value,
      dataLeft,
      topPadding,
      dataWidth,
      plotHeight,
    ),
  }));
  const trendPathProps = useAnimatedProps(() => ({
    d: linePath(
      points,
      'trend',
      animatedStartDay.value,
      animatedEndDay.value,
      animatedYMin.value,
      animatedYMax.value,
      dataLeft,
      topPadding,
      dataWidth,
      plotHeight,
    ),
  }));
  const pointPathProps = useAnimatedProps(() => ({
    d: pointPath(
      points,
      animatedStartDay.value,
      animatedEndDay.value,
      animatedYMin.value,
      animatedYMax.value,
      dataLeft,
      topPadding,
      dataWidth,
      plotHeight,
    ),
  }));
  const trendEndpointProps = useAnimatedProps(() => ({
    d: endpointPath(
      points,
      'trend',
      animatedStartDay.value,
      animatedEndDay.value,
      animatedYMin.value,
      animatedYMax.value,
      dataLeft,
      topPadding,
      dataWidth,
      plotHeight,
    ),
  }));
  const targetLineProps = useAnimatedProps(() => {
    const y = chartY(
      targetWeightKg ?? 0,
      animatedYMin.value,
      animatedYMax.value,
      topPadding,
      plotHeight,
    );
    return { y1: y, y2: y };
  });

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
      const index = nearestPointIndex(
        visiblePoints,
        event.x,
        nextStartDay,
        nextEndDay,
        dataLeft,
        dataWidth,
        Number.POSITIVE_INFINITY,
      );
      runOnJS(scrubPoint)(index);
    })
    .onUpdate((event) => {
      const index = nearestPointIndex(
        visiblePoints,
        event.x,
        nextStartDay,
        nextEndDay,
        dataLeft,
        dataWidth,
        Number.POSITIVE_INFINITY,
      );
      runOnJS(scrubPoint)(index);
    }), [
    dataLeft,
    dataWidth,
    nextEndDay,
    nextStartDay,
    scrubPoint,
    visiblePoints,
  ]);

  const tapGesture = useMemo(() => Gesture.Tap()
    .maxDistance(12)
    .onEnd((event) => {
      const index = nearestPointIndex2D(
        visiblePoints,
        event.x,
        event.y,
        nextStartDay,
        nextEndDay,
        nextYMin,
        nextYMax,
        dataLeft,
        topPadding,
        dataWidth,
        plotHeight,
        28,
      );
      runOnJS(selectPoint)(index);
    }), [
    dataLeft,
    dataWidth,
    nextEndDay,
    nextStartDay,
    nextYMax,
    nextYMin,
    plotHeight,
    selectPoint,
    visiblePoints,
  ]);
  const chartGesture = useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture],
  );

  const latest = visible[visible.length - 1];
  const rangeChange = visible.length > 1
    ? latest.trend_weight_kg - visible[0].trend_weight_kg
    : 0;
  const unitName = unit === 'kg' ? 'kilograms' : 'pounds';
  const accessibilityLabel = visible.length
    ? `${visible.length} weight readings. Latest scale ${fromKilograms(latest.scale_weight_kg, unit).toFixed(1)} ${unitName}, latest trend ${fromKilograms(latest.trend_weight_kg, unit).toFixed(1)} ${unitName}, range change ${rangeChange >= 0 ? 'plus ' : 'minus '}${Math.abs(fromKilograms(rangeChange, unit)).toFixed(1)} ${unitName}.`
    : 'No weight readings in this range.';
  const midpoint = new Date((new Date(`${startDate}T00:00:00`).getTime() + new Date(`${endDate}T00:00:00`).getTime()) / 2);
  const dateLabel = (date: string | Date) => new Date(typeof date === 'string' ? `${date}T00:00:00` : date)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const clipId = 'weight-chart-plot';
  const selectedLog = selectedIndex == null ? null : visible[selectedIndex] ?? null;
  const selectedPoint = selectedIndex == null ? null : visiblePoints[selectedIndex] ?? null;
  const selectedX = selectedPoint == null
    ? 0
    : chartX(selectedPoint.day, nextStartDay, nextEndDay, dataLeft, dataWidth);
  const selectedY = selectedPoint == null
    ? 0
    : chartY(selectedPoint.scale, nextYMin, nextYMax, topPadding, plotHeight);
  const tooltipWidth = 156;
  const tooltipLeft = Math.max(
    leftPadding,
    Math.min(selectedX - tooltipWidth / 2, width - rightPadding - tooltipWidth),
  );
  const tooltipTop = selectedY > 70 ? selectedY - 64 : selectedY + 12;

  return (
    <GestureDetector gesture={chartGesture}>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        {width > 0 && (
          <Svg width={width} height={height} accessible={false}>
          <Defs>
            <ClipPath id={clipId}>
              <Rect
                x={leftPadding}
                y={topPadding}
                width={plotWidth}
                height={plotHeight}
              />
            </ClipPath>
          </Defs>
          {yTicks.map((tick, index) => {
            const y = topPadding + index * plotHeight / 2;
            return (
              <React.Fragment key={index}>
                <Line
                  x1={leftPadding}
                  x2={width - rightPadding}
                  y1={y}
                  y2={y}
                  stroke={M3.outlineVariant}
                  strokeWidth={1}
                />
                <SvgText
                  x={leftPadding - 7}
                  y={y + 3.5}
                  fill={M3.onSurfaceVariant}
                  fontSize={10}
                  textAnchor="end"
                >
                  {fromKilograms(tick, unit).toFixed(1)}
                </SvgText>
              </React.Fragment>
            );
          })}
          <AnimatedLine
            x1={leftPadding}
            x2={width - rightPadding}
            animatedProps={targetLineProps}
            stroke={M3.onSurfaceVariant}
            strokeOpacity={targetWeightKg == null ? 0 : 0.75}
            strokeWidth={1}
            strokeDasharray="5 5"
            clipPath={`url(#${clipId})`}
          />
          <AnimatedPath
            animatedProps={trendPathProps}
            fill="none"
            stroke={M3.expenditure}
            strokeOpacity={0.8}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${clipId})`}
          />
          <AnimatedPath
            animatedProps={trendEndpointProps}
            fill={M3.expenditure}
            stroke={M3.surfaceContainer}
            strokeWidth={1.5}
            clipPath={`url(#${clipId})`}
          />
          <AnimatedPath
            animatedProps={scalePathProps}
            fill="none"
            stroke={M3.onSurface}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${clipId})`}
          />
          <AnimatedPath
            animatedProps={pointPathProps}
            fill={M3.onSurface}
            stroke={M3.surfaceContainer}
            strokeWidth={1.5}
            clipPath={`url(#${clipId})`}
          />
          {selectedPoint && (
            <Circle
              cx={selectedX}
              cy={selectedY}
              r={6}
              fill={M3.surfaceContainer}
              stroke={M3.onSurface}
              strokeWidth={2}
            />
          )}
          {showXAxisLabels && (
            <>
              <SvgText x={leftPadding} y={height - 3} fill={M3.onSurfaceVariant} fontSize={10}>{dateLabel(startDate)}</SvgText>
              <SvgText x={leftPadding + plotWidth / 2} y={height - 3} fill={M3.onSurfaceVariant} fontSize={10} textAnchor="middle">{dateLabel(midpoint)}</SvgText>
              <SvgText x={width - rightPadding} y={height - 3} fill={M3.onSurfaceVariant} fontSize={10} textAnchor="end">{dateLabel(endDate)}</SvgText>
            </>
          )}
          </Svg>
        )}
        {selectedLog && (
          <View
            pointerEvents="none"
            className="absolute rounded-xl border border-m3-outline-variant/60 bg-m3-surface-container-highest px-3 py-2"
            style={{ left: tooltipLeft, top: tooltipTop, width: tooltipWidth }}
          >
            <Text className="text-m3-on-surface-variant text-[10px] font-semibold">
              {dateLabel(selectedLog.log_date)}
            </Text>
            <Text className="text-m3-on-surface text-xs font-bold tabular-nums">
              Scale {fromKilograms(selectedLog.scale_weight_kg, unit).toFixed(1)} {unit}
            </Text>
            <Text className="text-m3-expenditure text-[10px] font-semibold tabular-nums">
              Trend {fromKilograms(selectedLog.trend_weight_kg, unit).toFixed(1)} {unit}
            </Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

export default React.memo(WeightChart);
