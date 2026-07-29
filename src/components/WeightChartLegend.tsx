import React from 'react';
import { Text, View } from 'react-native';

import { M3 } from '../theme/tokens';

interface WeightChartLegendProps {
  /** Show the dashed goal-line entry when a target weight is set. */
  showGoal?: boolean;
}

export default function WeightChartLegend({ showGoal = false }: WeightChartLegendProps) {
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-2">
      <View className="flex-row items-center gap-1.5">
        <View className="w-2 h-2 rounded-full bg-m3-on-surface" />
        <Text className="text-m3-on-surface-variant text-[10px] font-medium">Scale</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <View className="w-2 h-2 rounded-full bg-m3-expenditure" />
        <Text className="text-m3-on-surface-variant text-[10px] font-medium">Trend</Text>
      </View>
      {showGoal && (
        <View className="flex-row items-center gap-1.5">
          <View
            className="w-3.5 border-t border-dashed border-m3-on-surface-variant"
            style={{ borderTopWidth: 1.5 }}
          />
          <Text className="text-m3-on-surface-variant text-[10px] font-medium">Goal</Text>
        </View>
      )}
    </View>
  );
}
