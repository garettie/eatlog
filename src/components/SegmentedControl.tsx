import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DURATION, EASING } from '../theme/motion';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

/**
 * Shared white-pill segmented control used across dashboard, sheets, and forms.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const reduced = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const index = useSharedValue(selectedIndex);
  useEffect(() => {
    index.value = withTiming(selectedIndex, {
      duration: reduced ? 0 : DURATION.medium,
      easing: EASING.emphasized,
    });
  }, [selectedIndex, reduced]);

  const thumbStyle = useAnimatedStyle(() => {
    const segW = Math.max(0, (trackWidth - 4) / options.length);
    return {
      width: segW,
      transform: [{ translateX: index.value * segW }],
    };
  }, [trackWidth, options.length]);

  return (
    <View className="bg-m3-surface-container-high p-0.5 rounded-full border border-m3-outline-variant/30 overflow-hidden">
      <View
        className="flex-row relative"
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {trackWidth > 0 && (
          <Reanimated.View
            style={[
              {
                position: 'absolute',
                top: 2,
                bottom: 2,
                left: 2,
              },
              thumbStyle,
            ]}
            pointerEvents="none"
          >
            <View className="flex-1 rounded-full bg-white" />
          </Reanimated.View>
        )}
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="flex-1 min-h-[48px] px-2 rounded-full flex-row items-center justify-center gap-2 active:opacity-70"
            >
              {opt.icon && (
                <MaterialIcons
                  name={opt.icon}
                  size={20}
                  color={selected ? '#0f1117' : '#c4c6d0'}
                />
              )}
              <Text
                numberOfLines={1}
                className={`text-sm ${
                  selected
                    ? 'font-semibold text-m3-on-primary'
                    : 'font-medium text-m3-on-surface-variant'
                }`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
