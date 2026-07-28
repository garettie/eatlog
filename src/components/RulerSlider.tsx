import React, { useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';

interface RulerSliderProps {
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  /** Custom formatter for the big value and bound labels (e.g. inches → 5'11"). */
  formatValue?: (v: number) => string;
  /** Hide the display value when the parent provides its own editable field. */
  showValue?: boolean;
  /** Horizontal drag distance for one whole unit; inferred from step by default. */
  pixelsPerUnit?: number;
}

const TICK_STEP = 1;

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
  formatValue,
  showValue = true,
  pixelsPerUnit,
}: RulerSliderProps) {
  const [width, setWidth] = useState(0);
  const startValRef = useRef(0);
  const dragValRef = useRef(value);
  const lastEmittedRef = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Tenths need more travel than whole-number height values or the ruler
  // advances several steps from tiny finger movement.
  const resolvedPixelsPerUnit = pixelsPerUnit ?? (step < 1 ? 20 : 8);
  const configRef = useRef({ min, max, step, pixelsPerUnit: resolvedPixelsPerUnit });
  configRef.current = { min, max, step, pixelsPerUnit: resolvedPixelsPerUnit };

  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  function emit(next: number) {
    if (Object.is(next, lastEmittedRef.current)) return;
    lastEmittedRef.current = next;
    dragValRef.current = next;
    onValueChangeRef.current(next);
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

  const halfUnits = Math.ceil(width / (2 * resolvedPixelsPerUnit));
  const start = Math.floor(value - halfUnits);
  const end = Math.ceil(value + halfUnits);

  const ticks: { v: number; x: number; isMajor: boolean }[] = [];
  for (let i = start; i <= end; i += TICK_STEP) {
    const isMajor = i % 5 === 0;
    const x = (i - value) * resolvedPixelsPerUnit + width / 2;
    if (x >= -resolvedPixelsPerUnit * 2 && x <= width + resolvedPixelsPerUnit * 2) {
      ticks.push({ v: i, x, isMajor });
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
        className="relative h-14"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Adjust ${unit || 'value'}`}
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
              backgroundColor: t.isMajor ? '#6b6f78' : '#44474f',
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
          <View className="w-1 h-12 bg-white rounded-full" style={{ shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } }} />
        </View>
      </View>
      <View className="flex-row justify-between px-0.5 mt-1">
        <Text className="text-[10px] text-m3-on-surface-variant font-medium tabular-nums">{formatVal(min)} {unit}</Text>
        <Text className="text-[10px] text-m3-on-surface-variant font-medium tabular-nums">{formatVal(max)} {unit}</Text>
      </View>
    </View>
  );
}
