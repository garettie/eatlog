import React from 'react';
import { Text, View } from 'react-native';

import { M3 } from '../theme/tokens';

interface WeightChartLegendProps {
  /** Show the dashed goal-line entry when a target weight is set. */
  showGoal?: boolean;
  showPlan?: boolean;
  showPlanUpdates?: boolean;
}

export default function WeightChartLegend({
  showGoal = false,
  showPlan = false,
  showPlanUpdates = false,
}: WeightChartLegendProps) {
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-2">
      <View className="flex-row items-center gap-1.5">
        <View className="w-2 h-2 rounded-full bg-m3-on-surface-variant/70" />
        <Text className="text-m3-on-surface-variant text-compact font-medium">Scale</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <View className="w-3.5 border-t-2 border-m3-expenditure" />
        <Text className="text-m3-on-surface-variant text-compact font-medium">Trend</Text>
      </View>
      {showPlan ? (
        <View className="flex-row items-center gap-1.5">
          <View
            className="w-3.5 border-t border-dashed"
            style={{ borderTopColor: M3.goalRateSafe }}
          />
          <Text className="text-m3-on-surface-variant text-compact font-medium">Current plan pace</Text>
        </View>
      ) : null}
      {showGoal && (
        <View className="flex-row items-center gap-1.5">
          <View
            className="w-3.5 border-t border-dashed border-m3-on-surface-variant"
            style={{ borderTopWidth: 1.5 }}
          />
          <Text className="text-m3-on-surface-variant text-compact font-medium">Goal</Text>
        </View>
      )}
      {showPlanUpdates ? (
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 border-l border-dashed border-m3-on-surface-variant" />
          <Text className="text-m3-on-surface-variant text-compact font-medium">Plan update</Text>
        </View>
      ) : null}
    </View>
  );
}
