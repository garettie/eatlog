import React from 'react';
import { Text, View } from 'react-native';

interface MacroChipGroupProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export default function MacroChipGroup({ calories, protein, carbs, fat }: MacroChipGroupProps) {
  return (
    <View className="flex-row gap-2">
      <View className="flex-1 bg-m3-surface-container-high rounded-xl p-3 items-center gap-0.5">
        <Text className="text-[10px] text-white/70 font-semibold tracking-wider">CAL</Text>
        <Text className="text-white font-bold text-sm num-tabular">{calories}</Text>
      </View>
      <View className="flex-1 bg-m3-surface-container-high rounded-xl p-3 items-center gap-0.5">
        <Text className="text-[10px] text-m3-protein font-semibold tracking-wider">PRO</Text>
        <Text className="text-m3-on-surface font-bold text-sm num-tabular">{protein}g</Text>
      </View>
      <View className="flex-1 bg-m3-surface-container-high rounded-xl p-3 items-center gap-0.5">
        <Text className="text-[10px] text-m3-carbs font-semibold tracking-wider">CARB</Text>
        <Text className="text-m3-on-surface font-bold text-sm num-tabular">{carbs}g</Text>
      </View>
      <View className="flex-1 bg-m3-surface-container-high rounded-xl p-3 items-center gap-0.5">
        <Text className="text-[10px] text-m3-fat font-semibold tracking-wider">FAT</Text>
        <Text className="text-m3-on-surface font-bold text-sm num-tabular">{fat}g</Text>
      </View>
    </View>
  );
}
