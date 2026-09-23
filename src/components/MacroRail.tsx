import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { DURATION, EASING } from '../theme/motion';
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
  const overflow = target > 0 ? Math.min(1, Math.max(0, (consumed - target) / target)) : 0;
  const reduced = useReducedMotion();
  // Bars settle from the previous day's values instead of jumping when the day changes.
  const fill = useSharedValue(fraction);
  const overflowFill = useSharedValue(overflow);
  useEffect(() => {
    const settle = { duration: reduced ? 0 : DURATION.bar, easing: EASING.decelerate };
    fill.value = withTiming(fraction, settle);
    overflowFill.value = withTiming(overflow, settle);
  }, [fill, fraction, overflow, overflowFill, reduced]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const overflowStyle = useAnimatedStyle(() => ({ width: `${overflowFill.value * 100}%` }));

  return (
    <View className="flex-1 min-w-0 gap-1" accessibilityLabel={`${unit === 'kcal' ? 'Calories' : letter === 'P' ? 'Protein' : letter === 'C' ? 'Carbohydrates' : 'Fat'}: ${Math.round(consumed)} of ${Math.round(target)} ${unit}`} accessibilityRole="text">
      <View className="flex-row items-center justify-center gap-1">
        {icon ? (
          <MaterialIcons name={icon as any} size={11} color={M3.onSurface} />
        ) : (
          <Text className="text-compact font-bold leading-none" style={{ color: M3.onSurface }}>
            {letter}
          </Text>
        )}
        <Text
          className="text-m3-on-surface-variant text-compact font-semibold tabular-nums leading-none shrink"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {unit === 'kcal' ? Math.round(consumed).toLocaleString() : Math.round(consumed)}
          <Text className="text-m3-on-surface-variant/60"> / {unit === 'kcal' ? Math.round(target).toLocaleString() : Math.round(target)}</Text>
        </Text>
      </View>
      <View className="h-1 bg-m3-surface-container-highest rounded-full overflow-hidden">
        <Reanimated.View
          className="h-full rounded-full"
          style={[{ backgroundColor: barColor }, fillStyle]}
        >
          <Reanimated.View className="absolute right-0 h-full bg-black/25" style={overflowStyle} />
        </Reanimated.View>
      </View>
    </View>
  );
}

function MacroRail({ cells }: MacroRailProps) {
  return (
    <View className="flex-row items-end gap-3 px-4 py-3">
      {cells.map((cell, i) => (
        <MacroCellView key={cell.icon || cell.letter || i} {...cell} />
      ))}
    </View>
  );
}

export default React.memo(MacroRail);
