import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { WeightLog, WeightUnit } from '../db/database';
import { calendarDaysBetween } from '../utils/calendar';
import { fromKilograms } from '../utils/weightUnits';
import { M3 } from '../theme/tokens';

interface WeightChartProps {
  logs: WeightLog[];
  startDate: string;
  endDate: string;
  height: number;
  showXAxisLabels?: boolean;
  targetWeightKg?: number | null;
  unit?: WeightUnit;
}

export default function WeightChart({
  logs,
  startDate,
  endDate,
  height,
  showXAxisLabels = false,
  targetWeightKg = null,
  unit = 'kg',
}: WeightChartProps) {
  const [width, setWidth] = useState(0);
  const sorted = useMemo(
    () => [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date)),
    [logs],
  );
  const xLabelHeight = showXAxisLabels ? 22 : 4;
  const topPadding = 8;
  const leftPadding = 42;
  const rightPadding = 8;
  const plotHeight = Math.max(1, height - xLabelHeight - topPadding);
  const plotWidth = Math.max(1, width - leftPadding - rightPadding);
  const totalDays = Math.max(1, calendarDaysBetween(startDate, endDate));
  const values = sorted.flatMap((log) => [log.scale_weight_kg, log.trend_weight_kg]);
  if (targetWeightKg != null) values.push(targetWeightKg);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;
  const rawRange = Math.max(1, maxValue - minValue);
  const padding = Math.max(0.25, rawRange * 0.1);
  const yMin = minValue - padding;
  const yMax = maxValue + padding;
  const yRange = Math.max(1, yMax - yMin);
  const yTicks = [yMax, (yMax + yMin) / 2, yMin];
  const x = (date: string) => leftPadding + calendarDaysBetween(startDate, date) / totalDays * plotWidth;
  const y = (value: number) => topPadding + (yMax - value) / yRange * plotHeight;
  const pathFor = (selector: (log: WeightLog) => number) => sorted
    .map((log, index) => `${index === 0 ? 'M' : 'L'} ${x(log.log_date)} ${y(selector(log))}`)
    .join(' ');
  const latest = sorted[sorted.length - 1];
  const rangeChange = sorted.length > 1 ? latest.trend_weight_kg - sorted[0].trend_weight_kg : 0;
  const unitName = unit === 'kg' ? 'kilograms' : 'pounds';
  const accessibilityLabel = sorted.length
    ? `${sorted.length} weight readings. Latest scale ${fromKilograms(latest.scale_weight_kg, unit).toFixed(1)} ${unitName}, latest trend ${fromKilograms(latest.trend_weight_kg, unit).toFixed(1)} ${unitName}, range change ${rangeChange >= 0 ? 'plus ' : 'minus '}${Math.abs(fromKilograms(rangeChange, unit)).toFixed(1)} ${unitName}.`
    : 'No weight readings in this range.';
  const midpoint = new Date((new Date(`${startDate}T00:00:00`).getTime() + new Date(`${endDate}T00:00:00`).getTime()) / 2);
  const dateLabel = (date: string | Date) => new Date(typeof date === 'string' ? `${date}T00:00:00` : date)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {width > 0 && (
        <Svg width={width} height={height} accessible={false}>
          {yTicks.map((tick, index) => (
            <React.Fragment key={index}>
              <Line
                x1={leftPadding}
                x2={width - rightPadding}
                y1={y(tick)}
                y2={y(tick)}
                stroke={M3.outlineVariant}
                strokeWidth={1}
              />
              <SvgText
                x={leftPadding - 7}
                y={y(tick) + 3.5}
                fill={M3.onSurfaceVariant}
                fontSize={10}
                textAnchor="end"
              >
                {fromKilograms(tick, unit).toFixed(1)}
              </SvgText>
            </React.Fragment>
          ))}
          {targetWeightKg != null && (
            <Line
              x1={leftPadding}
              x2={width - rightPadding}
              y1={y(targetWeightKg)}
              y2={y(targetWeightKg)}
              stroke={M3.onSurfaceVariant}
              strokeOpacity={0.75}
              strokeWidth={1}
              strokeDasharray="5 5"
            />
          )}
          {sorted.length >= 2 && (
            <Path
              d={pathFor((log) => log.trend_weight_kg)}
              fill="none"
              stroke={M3.expenditure}
              strokeOpacity={0.8}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {sorted.length >= 2 && (
            <Path
              d={pathFor((log) => log.scale_weight_kg)}
              fill="none"
              stroke={M3.onSurface}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {sorted.map((log) => (
            <Circle
              key={log.id}
              cx={x(log.log_date)}
              cy={y(log.scale_weight_kg)}
              r={3.25}
              fill={M3.onSurface}
              stroke={M3.surfaceContainer}
              strokeWidth={1.5}
            />
          ))}
          {showXAxisLabels && (
            <>
              <SvgText x={leftPadding} y={height - 3} fill={M3.onSurfaceVariant} fontSize={10}>{dateLabel(startDate)}</SvgText>
              <SvgText x={leftPadding + plotWidth / 2} y={height - 3} fill={M3.onSurfaceVariant} fontSize={10} textAnchor="middle">{dateLabel(midpoint)}</SvgText>
              <SvgText x={width - rightPadding} y={height - 3} fill={M3.onSurfaceVariant} fontSize={10} textAnchor="end">{dateLabel(endDate)}</SvgText>
            </>
          )}
        </Svg>
      )}
    </View>
  );
}
