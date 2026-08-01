import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { buildLoggingHeatmap } from '../utils/loggingHeatmap';

interface LoggingHeatmapProps {
  kind: 'food' | 'weight';
  loggedDates: readonly string[];
  endDate: string;
  compact?: boolean;
}

const CHART_COPY = {
  food: {
    title: 'Food logging',
    filledClassName: 'bg-m3-calories',
  },
  weight: {
    title: 'Weight check-ins',
    filledClassName: 'bg-m3-expenditure',
  },
} as const;

function LoggingHeatmap({
  kind,
  loggedDates,
  endDate,
  compact = false,
}: LoggingHeatmapProps) {
  const model = useMemo(
    () => buildLoggingHeatmap(endDate, loggedDates),
    [endDate, loggedDates],
  );
  const copy = CHART_COPY[kind];
  const accessibilityLabel = `${copy.title}, last 30 days. ${model.currentWeekCount} of 7 days logged this week.`;

  return (
    <View
      className="flex-1 min-w-0 gap-3"
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <View className="min-h-[32px] justify-end">
        <Text className="text-m3-on-surface text-xs font-semibold" numberOfLines={2}>
          {copy.title}
        </Text>
      </View>

      <View
        className="w-full gap-1"
        importantForAccessibility="no-hide-descendants"
      >
        {model.rows.map((row) => (
          <View key={row[0].date} className="flex-row gap-1">
            {row.map((cell) => (
              <View
                key={cell.date}
                className={`flex-1 aspect-square rounded-sm ${
                  cell.logged
                    ? copy.filledClassName
                    : 'bg-m3-surface-container-highest'
                }`}
              />
            ))}
          </View>
        ))}
      </View>

      <View className="h-px bg-m3-outline-variant/50" />

      <View>
        <Text
          className={`${compact ? 'text-base' : 'text-lg'} text-m3-on-surface font-bold tabular-nums`}
          numberOfLines={1}
        >
          {model.currentWeekCount}/7
          <Text className="text-m3-on-surface-variant text-compact font-medium"> this week</Text>
        </Text>
      </View>
    </View>
  );
}

export default React.memo(LoggingHeatmap);
