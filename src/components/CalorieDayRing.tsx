import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { M3 } from '../theme/tokens';
import { targetOverflowProgress } from '../utils/calculations';

const RING_R = 15;
const RING_STROKE = 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

/** How full a day's calorie ring is, and how far past target its overflow refill runs. */
export function calorieRingProgress(calories: number, targetCalories: number, isFuture: boolean) {
  const fraction = isFuture || targetCalories <= 0 ? 0 : Math.min(1, calories / targetCalories);
  const overflowFraction = isFuture ? 0 : targetOverflowProgress(calories, targetCalories);
  return { fraction, overflowFraction };
}

/**
 * The calendar day's calorie ring: a faint track, calorie blue up to target, and the darker
 * overflow blue past it. Drawn absolutely inside a 36dp day circle; the day number sits on top.
 */
export default function CalorieDayRing({
  calories,
  targetCalories,
  isFuture,
}: {
  calories: number;
  targetCalories: number;
  isFuture: boolean;
}) {
  const { fraction, overflowFraction } = calorieRingProgress(calories, targetCalories, isFuture);

  if (fraction === 0) {
    return (
      <View
        className="absolute rounded-full"
        style={{ width: 32, height: 32, borderWidth: RING_STROKE, borderColor: M3.outline, opacity: 0.5 }}
      />
    );
  }

  return (
    <Svg width={36} height={36} viewBox="0 0 36 36" style={{ position: 'absolute' }}>
      <Circle cx={18} cy={18} r={RING_R} fill="none" stroke={M3.outline} strokeWidth={RING_STROKE} opacity={0.5} />
      <Circle
        cx={18}
        cy={18}
        r={RING_R}
        fill="none"
        stroke={M3.calories}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        rotation={-90}
        originX={18}
        originY={18}
      />
      {overflowFraction > 0 ? (
        <Circle
          cx={18}
          cy={18}
          r={RING_R}
          fill="none"
          stroke={M3.caloriesOverflow}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - overflowFraction)}
          rotation={-90}
          originX={18}
          originY={18}
        />
      ) : null}
    </Svg>
  );
}
