import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
 * M3 segmented control with animated sliding thumb.
 * Thumb slides via translateX on the UI thread; reduced motion snaps instantly.
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
    index.value = selectedIndex;
  }, [selectedIndex]);

  const thumbStyle = useAnimatedStyle(() => {
    const segW = trackWidth / options.length;
    return {
      width: segW,
      transform: [
        {
          translateX: withTiming(index.value * segW, {
            duration: reduced ? 0 : 220,
          }),
        },
      ],
    };
  }, [trackWidth, options.length]);

  return (
    <View className="bg-m3-surface-container p-1 rounded-2xl border border-m3-outline-variant/30">
      <View
        className="flex-row relative"
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {trackWidth > 0 && (
          <Reanimated.View
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
              },
              thumbStyle,
            ]}
            pointerEvents="none"
          >
            <View className="flex-1 rounded-xl bg-m3-surface-container-highest border border-m3-outline/60" />
          </Reanimated.View>
        )}
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              className="flex-1 py-4 rounded-xl flex-row items-center justify-center gap-2"
            >
              {opt.icon && (
                <MaterialIcons
                  name={opt.icon}
                  size={20}
                  color={selected ? '#ffffff' : '#c4c6d0'}
                />
              )}
              <Text
                className={`text-base ${
                  selected
                    ? 'font-semibold text-white'
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
