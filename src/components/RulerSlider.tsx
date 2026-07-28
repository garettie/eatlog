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
}

const TICK_STEP = 1;
const PX_PER_UNIT = 8;

export default function RulerSlider({ value, onValueChange, min, max, step = 1, unit, formatValue }: RulerSliderProps) {
  const [width, setWidth] = useState(0);
  const startXRef = useRef(0);
  const startValRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const configRef = useRef({ min, max, step });
  configRef.current = { min, max, step };

  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startXRef.current = e.nativeEvent.pageX;
        startValRef.current = valueRef.current;
      },
      onPanResponderMove: (e) => {
        const { min: lo, max: hi, step: s } = configRef.current;
        const dx = e.nativeEvent.pageX - startXRef.current;
        const delta = dx / PX_PER_UNIT;
        let newVal = startValRef.current - delta;
        newVal = Math.round(newVal / s) * s;
        newVal = Math.min(hi, Math.max(lo, newVal));
        onValueChangeRef.current(newVal);
      },
      onPanResponderRelease: () => {
        const { min: lo, max: hi, step: s } = configRef.current;
        const snapped = Math.round(valueRef.current / s) * s;
        onValueChangeRef.current(Math.min(hi, Math.max(lo, snapped)));
      },
    })
  ).current;

  const halfUnits = Math.ceil(width / (2 * PX_PER_UNIT));
  const start = Math.floor(value - halfUnits);
  const end = Math.ceil(value + halfUnits);

  const ticks: { v: number; x: number; isMajor: boolean }[] = [];
  for (let i = start; i <= end; i += TICK_STEP) {
    const isMajor = i % 5 === 0;
    const x = (i - value) * PX_PER_UNIT + width / 2;
    if (x >= -PX_PER_UNIT * 2 && x <= width + PX_PER_UNIT * 2) {
      ticks.push({ v: i, x, isMajor });
    }
  }

  function formatVal(v: number) {
    if (formatValue) return formatValue(v);
    return Number.isInteger(v) ? v.toString() : v.toFixed(1);
  }

  return (
    <View className="py-3">
      <Text className="text-m3-on-surface text-4xl font-bold text-center tabular-nums mb-3">
        {formatVal(value)}
        <Text className="text-m3-on-surface-variant text-sm ml-1"> {unit}</Text>
      </Text>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        className="relative h-11"
        {...pan.panHandlers}
      >
        {ticks.map((t) => (
          <View
            key={t.v}
            style={{
              position: 'absolute',
              left: t.x - (t.isMajor ? 1 : 0.5),
              top: t.isMajor ? 0 : 9,
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
            top: 0,
            width: 4,
            height: 44,
            alignItems: 'center',
          }}
          pointerEvents="none"
        >
          <View className="w-1 h-11 bg-white rounded-full" style={{ shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } }} />
        </View>
      </View>
      <View className="flex-row justify-between px-0.5 mt-1">
        <Text className="text-[10px] text-m3-on-surface-variant font-medium tabular-nums">{formatVal(min)} {unit}</Text>
        <Text className="text-[10px] text-m3-on-surface-variant font-medium tabular-nums">{formatVal(max)} {unit}</Text>
      </View>
    </View>
  );
}
