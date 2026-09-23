import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';

import { useResponsiveLayout } from '../theme/layout';
import { M3 } from '../theme/tokens';

export interface ChoiceCardOption<T extends string> {
  value: T;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle?: string;
}

interface ChoiceCardsProps<T extends string> {
  options: ChoiceCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/**
 * A choice list of side-by-side cards (stacked on narrow screens): the selected card steps up one
 * surface tone with a 2dp White Action outline. Goal, sex, and units all choose through it.
 */
export default function ChoiceCards<T extends string>({ options, value, onChange, accessibilityLabel }: ChoiceCardsProps<T>) {
  const reduced = useReducedMotion();
  const { isNarrow } = useResponsiveLayout();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} className={isNarrow ? 'gap-3' : 'flex-row gap-3'}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.subtitle ? `${option.title}: ${option.subtitle}` : option.title}
            accessibilityState={{ checked: selected }}
            className={`${isNarrow ? 'w-full flex-row items-center gap-3' : 'flex-1 items-center'} p-5 rounded-2xl gap-1 ${reduced ? '' : 'active:scale-[0.97]'} ${
              selected
                ? 'bg-m3-surface-container-high border-2 border-m3-primary'
                : 'bg-m3-surface-container border border-m3-outline-variant/30'
            }`}
          >
            <MaterialIcons
              name={option.icon}
              size={24}
              color={selected ? M3.primary : M3.onSurfaceVariant}
            />
            <View className={isNarrow ? 'flex-1 min-w-0 gap-0.5' : 'items-center gap-1'}>
              <Text className={`font-bold text-base ${selected ? 'text-m3-primary' : 'text-m3-on-surface'}`}>
                {option.title}
              </Text>
              {option.subtitle ? (
                <Text className="text-xs text-m3-on-surface-variant">{option.subtitle}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
