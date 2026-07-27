import React from 'react';
import { Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../theme/tokens';

interface MacroCell {
  icon?: string;
  letter?: string;
  consumed: number;
  target: number;
  barColor: string;
  unit: string;
}

interface MacroRailProps {
  cells: MacroCell[];
}

function MacroCellView({ icon, letter, consumed, target, barColor, unit }: MacroCell) {
  const fraction = target > 0 ? Math.min(1, consumed / target) : 0;

  return (
    <View className="flex-1 gap-0.5">
      <View className="flex-row items-baseline justify-center gap-1">
        {icon ? (
          <MaterialIcons name={icon as any} size={13} color={M3.onSurface} />
        ) : (
          <Text className="text-[12px] font-bold" style={{ color: M3.onSurface }}>
            {letter}
          </Text>
        )}
        <Text className="text-m3-on-surface-variant text-[10px] font-semibold num-tabular">
          {unit === 'kcal' ? Math.round(consumed).toLocaleString() : Math.round(consumed)}
          <Text className="text-m3-on-surface-variant/40"> / {unit === 'kcal' ? Math.round(target).toLocaleString() : Math.round(target)}</Text>
        </Text>
      </View>
      <View className="h-0.5 bg-m3-surface-container-highest rounded-full overflow-hidden">
        <View
          className="h-full rounded-full"
          style={{ width: `${fraction * 100}%`, backgroundColor: barColor }}
        />
      </View>
    </View>
  );
}

export default function MacroRail({ cells }: MacroRailProps) {
  return (
    <View className="flex-row items-end gap-3 px-4 py-3">
      {cells.map((cell, i) => (
        <MacroCellView key={cell.icon || cell.letter || i} {...cell} />
      ))}
    </View>
  );
}
