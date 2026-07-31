import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import type { GoalType } from '../db/database';
import { useReducedMotion } from 'react-native-reanimated';
import { M3 } from '../theme/tokens';

const GOALS: {
  type: GoalType;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
}[] = [
  { type: 'cut', icon: 'trending-down', title: 'Cut', subtitle: 'Weight Loss' },
  { type: 'maintain', icon: 'drag-handle', title: 'Maintain', subtitle: 'Stay Steady' },
  { type: 'bulk', icon: 'trending-up', title: 'Bulk', subtitle: 'Gain Muscle' },
];

interface GoalTypeSelectorProps {
  value: GoalType;
  onChange: (goal: GoalType) => void;
}

function GoalTypeSelector({ value, onChange }: GoalTypeSelectorProps) {
  const reduced = useReducedMotion();
  return (
    <View className="flex-row gap-3">
      {GOALS.map((goal) => {
        const selected = value === goal.type;
        return (
          <Pressable
            key={goal.type}
            onPress={() => onChange(goal.type)}
            accessibilityRole="radio"
            accessibilityLabel={`${goal.title}: ${goal.subtitle}`}
            accessibilityState={{ checked: selected }}
            className={`flex-1 p-5 rounded-2xl items-center gap-1 ${reduced ? '' : 'active:scale-[0.97]'} ${
              selected
                ? 'bg-m3-surface-container-high border-2 border-m3-primary'
                : 'bg-m3-surface-container border border-m3-outline-variant/30'
            }`}
          >
            <MaterialIcons
              name={goal.icon}
              size={24}
              color={selected ? M3.primary : M3.onSurfaceVariant}
            />
            <Text className={`font-bold text-base ${selected ? 'text-m3-primary' : 'text-m3-on-surface'}`}>
              {goal.title}
            </Text>
            <Text className="text-xs text-m3-on-surface-variant">{goal.subtitle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default React.memo(GoalTypeSelector);
