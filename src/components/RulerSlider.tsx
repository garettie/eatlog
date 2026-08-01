import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { M3 } from '../theme/tokens';

interface RulerSliderProps {
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  label?: string;
  /** Custom formatter for the big value and bound labels (e.g. inches → 5'11"). */
  formatValue?: (v: number) => string;
  /** Hide the display value when the parent provides its own editable field. */
  showValue?: boolean;
  /** Horizontal drag distance for one whole unit; inferred from step by default. */
  pixelsPerUnit?: number;
  /** Visual tick interval, independent from the snapped value step. */
  tickStep?: number;
  /** Interval between emphasized ticks. Defaults to five visual tick intervals. */
  majorTickEvery?: number;
  /** Scale the active min/max range to fill the available track width. */
  fitRange?: boolean;
}

function decimalPlaces(step: number): number {
  const text = String(step);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

function snapValue(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step;
  const clamped = Math.min(max, Math.max(min, snapped));
  return Number(clamped.toFixed(decimalPlaces(step)));
}

export default function RulerSlider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  unit,
  label,
  formatValue,
  showValue = true,
  pixelsPerUnit,
  tickStep = 1,
  majorTickEvery = tickStep * 5,
  fitRange = false,
}: RulerSliderProps) {
  const [width, setWidth] = useState(0);
  const startValRef = useRef(0);
  const dragValRef = useRef(value);
  const lastEmittedRef = useRef(value);
  const lastHapticAtRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Tenths need more travel than whole-number height values or the ruler
  // advances several steps from tiny finger movement.
  const defaultPixelsPerUnit = pixelsPerUnit ?? (step < 1 ? 20 : 8);
  const resolvedPixelsPerUnit = fitRange && width > 0 && max > min
    ? Math.max(1, (width - 32) / (max - min))
    : defaultPixelsPerUnit;
  const configRef = useRef({ min, max, step, pixelsPerUnit: resolvedPixelsPerUnit });
  configRef.current = { min, max, step, pixelsPerUnit: resolvedPixelsPerUnit };

  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  useEffect(() => {
    dragValRef.current = value;
    lastEmittedRef.current = value;
  }, [value]);

  function emit(next: number) {
    if (Object.is(next, lastEmittedRef.current)) return;
    lastEmittedRef.current = next;
    dragValRef.current = next;
    onValueChangeRef.current(next);
    const now = Date.now();
    if (now - lastHapticAtRef.current >= 35) {
      lastHapticAtRef.current = now;
      void Haptics.selectionAsync();
    }
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gesture) =>
        Math.abs(gesture.dx) >= 3 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onPanResponderGrant: () => {
        startValRef.current = valueRef.current;
        dragValRef.current = valueRef.current;
        lastEmittedRef.current = valueRef.current;
      },
      onPanResponderMove: (_e, gesture) => {
        const { min: lo, max: hi, step: s, pixelsPerUnit: px } = configRef.current;
        const next = snapValue(startValRef.current - gesture.dx / px, lo, hi, s);
        emit(next);
      },
      onPanResponderRelease: () => {
        const { min: lo, max: hi, step: s } = configRef.current;
        emit(snapValue(dragValRef.current, lo, hi, s));
      },
      onPanResponderTerminate: () => {
        const { min: lo, max: hi, step: s } = configRef.current;
        emit(snapValue(dragValRef.current, lo, hi, s));
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const halfUnits = width / (2 * resolvedPixelsPerUnit);
  const startIndex = Math.floor((value - halfUnits) / tickStep) - 1;
  const endIndex = Math.ceil((value + halfUnits) / tickStep) + 1;
  const tickPrecision = Math.max(decimalPlaces(tickStep), decimalPlaces(majorTickEvery));

  const ticks: { v: number; x: number; isMajor: boolean }[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const tickValue = Number((index * tickStep).toFixed(tickPrecision));
    if (fitRange && (tickValue < min || tickValue > max)) continue;
    const majorRatio = tickValue / majorTickEvery;
    const isMajor = Math.abs(majorRatio - Math.round(majorRatio)) < 1e-6;
    const x = (tickValue - value) * resolvedPixelsPerUnit + width / 2;
    if (x >= -resolvedPixelsPerUnit * 2 && x <= width + resolvedPixelsPerUnit * 2) {
      ticks.push({ v: tickValue, x, isMajor });
    }
  }

  function formatVal(v: number) {
    if (formatValue) return formatValue(v);
    return Number.isInteger(v) ? v.toString() : v.toFixed(1);
  }

  return (
    <View className="py-3">
      {showValue && (
        <Text className="text-m3-on-surface text-4xl font-bold text-center tabular-nums mb-3">
          {formatVal(value)}
          <Text className="text-m3-on-surface-variant text-sm ml-1"> {unit}</Text>
        </Text>
      )}
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        className="relative h-14 overflow-hidden"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label ?? `Adjust ${unit || 'value'}`}
        accessibilityValue={{
          min,
          max,
          now: value,
          text: `${formatVal(value)}${unit ? ` ${unit}` : ''}`,
        }}
        accessibilityActions={[
          { name: 'increment', label: 'Increase' },
          { name: 'decrement', label: 'Decrease' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') {
            emit(snapValue(valueRef.current + step, min, max, step));
          } else if (event.nativeEvent.actionName === 'decrement') {
            emit(snapValue(valueRef.current - step, min, max, step));
          }
        }}
        {...pan.panHandlers}
      >
        {ticks.map((t) => (
          <View
            key={t.v}
            style={{
              position: 'absolute',
              left: t.x - (t.isMajor ? 1 : 0.5),
              top: t.isMajor ? 6 : 15,
              width: t.isMajor ? 2 : 1,
              height: t.isMajor ? 36 : 18,
              backgroundColor: t.isMajor ? M3.outline : M3.outlineVariant,
              borderRadius: 1,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            left: width > 0 ? width / 2 - 2 : 0,
            top: 4,
            width: 4,
            height: 44,
            alignItems: 'center',
          }}
          pointerEvents="none"
        >
          <View className="w-1 h-12 bg-white rounded-full" />
        </View>
      </View>
      <View className="flex-row justify-between px-0.5 mt-1">
        <Text className="text-compact text-m3-on-surface-variant font-medium tabular-nums">{formatVal(min)} {unit}</Text>
        <Text className="text-compact text-m3-on-surface-variant font-medium tabular-nums">{formatVal(max)} {unit}</Text>
      </View>
    </View>
  );
}
