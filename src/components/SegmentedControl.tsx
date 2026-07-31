import React, { startTransition, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DURATION, EASING } from '../theme/motion';
import { M3 } from '../theme/tokens';

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
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const trackWidth = useSharedValue(0);
  const measuredRef = useRef(false);
  const requestedIndexRef = useRef(selectedIndex);
  const pendingValueRef = useRef<T | null>(null);
  const [visualIndex, setVisualIndex] = useState(selectedIndex);
  const index = useSharedValue(selectedIndex);
  useEffect(() => {
    if (pendingValueRef.current != null) {
      if (value !== pendingValueRef.current) return;
      pendingValueRef.current = null;
    }
    setVisualIndex((currentIndex) => currentIndex === selectedIndex ? currentIndex : selectedIndex);
    if (!measuredRef.current) return;
    if (requestedIndexRef.current === selectedIndex) return;
    requestedIndexRef.current = selectedIndex;
    index.value = withTiming(selectedIndex, {
      duration: reduced ? 0 : DURATION.short,
      easing: EASING.emphasized,
    });
  }, [selectedIndex, reduced, value]);

  const thumbStyle = useAnimatedStyle(() => {
    const segmentWidth = Math.max(0, (trackWidth.value - 4) / options.length);
    return {
      width: segmentWidth,
      opacity: trackWidth.value > 0 ? 1 : 0,
      transform: [{ translateX: index.value * segmentWidth }],
    };
  }, [options.length]);

  return (
    <View className="bg-m3-surface-container-high p-0.5 rounded-full border border-m3-outline-variant/30 overflow-hidden">
      <View
        className="flex-row relative"
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (!measuredRef.current) {
            index.value = selectedIndex;
            requestedIndexRef.current = selectedIndex;
            measuredRef.current = true;
          }
          trackWidth.value = nextWidth;
        }}
      >
        <Reanimated.View
          style={[
            {
              position: 'absolute',
              top: 2,
              bottom: 2,
              left: 2,
              borderRadius: 9999,
              backgroundColor: M3.primary,
            },
            thumbStyle,
          ]}
          pointerEvents="none"
        />
        {options.map((opt, optionIndex) => {
          const selected = optionIndex === visualIndex;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                if (optionIndex === requestedIndexRef.current) return;
                requestedIndexRef.current = optionIndex;
                pendingValueRef.current = opt.value;
                setVisualIndex(optionIndex);
                index.value = withTiming(optionIndex, {
                  duration: reduced ? 0 : DURATION.short,
                  easing: EASING.emphasized,
                });
                startTransition(() => onChange(opt.value));
              }}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected }}
              className="flex-1 min-h-[48px] px-2 rounded-full flex-row items-center justify-center gap-2 active:opacity-70"
            >
              {opt.icon && (
                <MaterialIcons
                  name={opt.icon}
                  size={20}
                  color={selected ? M3.onPrimary : M3.onSurfaceVariant}
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
