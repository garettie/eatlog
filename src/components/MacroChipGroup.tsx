import React from 'react';
import { Text, View } from 'react-native';

interface MacroChipGroupProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export default function MacroChipGroup({ calories: _calories, protein, carbs, fat }: MacroChipGroupProps) {
  return (
    <View className="flex-row gap-2">
      <View className="flex-1 bg-m3-surface-container-high rounded-xl p-3 items-center gap-0.5">
        <Text className="text-m3-on-surface font-bold text-sm num-tabular">{protein}g</Text>
        <Text className="text-[10px] text-m3-protein font-medium">Protein</Text>
      </View>
      <View className="flex-1 bg-m3-surface-container-high rounded-xl p-3 items-center gap-0.5">
        <Text className="text-m3-on-surface font-bold text-sm num-tabular">{carbs}g</Text>
        <Text className="text-[10px] text-m3-carbs font-medium">Carbs</Text>
      </View>
      <View className="flex-1 bg-m3-surface-container-high rounded-xl p-3 items-center gap-0.5">
        <Text className="text-m3-on-surface font-bold text-sm num-tabular">{fat}g</Text>
        <Text className="text-[10px] text-m3-fat font-medium">Fat</Text>
      </View>
    </View>
  );
}
