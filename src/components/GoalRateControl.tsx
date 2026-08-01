import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import type { GoalType, WeightUnit } from '../db/database';
import { M3 } from '../theme/tokens';
import {
  GOAL_RATE_RANGES,
  GOAL_RATE_STEP_KG,
  GOAL_RATE_WARNING_THRESHOLD,
  goalRateSeverity,
  normalizeGoalRate,
} from '../utils/goalRate';
import { fromKilograms, toKilograms } from '../utils/weightUnits';

import RulerSlider from './RulerSlider';

interface GoalRateControlProps {
  goal: Exclude<GoalType, 'maintain'>;
  valueKgPerWeek: number;
  onValueChange: (valueKgPerWeek: number) => void;
  weightUnit: WeightUnit;
}

function mixColor(from: string, to: string, progress: number): string {
  const amount = Math.min(1, Math.max(0, progress));
  const fromChannels = [1, 3, 5].map((index) => Number.parseInt(from.slice(index, index + 2), 16));
  const toChannels = [1, 3, 5].map((index) => Number.parseInt(to.slice(index, index + 2), 16));
  const mixed = fromChannels.map((channel, index) =>
    Math.round(channel + (toChannels[index] - channel) * amount)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${mixed.join('')}`;
}

function severityColor(severity: number): string {
  if (severity <= 0.5) {
    return mixColor(M3.goalRateSafe, M3.primary, severity * 2);
  }
  return mixColor(M3.primary, M3.goalRateExtreme, (severity - 0.5) * 2);
}

function parseRate(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export default function GoalRateControl({
  goal,
  valueKgPerWeek,
  onValueChange,
  weightUnit,
}: GoalRateControlProps) {
  const displayValue = fromKilograms(valueKgPerWeek, weightUnit);
  const formatDisplayValue = (value: number) => fromKilograms(value, weightUnit).toFixed(2);
  const [inputText, setInputText] = useState(() => displayValue.toFixed(2));
  const [editing, setEditing] = useState(false);
  const range = GOAL_RATE_RANGES[goal];
  const severity = goalRateSeverity(valueKgPerWeek, goal);
  const color = useMemo(() => severityColor(severity), [severity]);
  const warning = severity >= GOAL_RATE_WARNING_THRESHOLD;
  const unitLabel = `${weightUnit} / week`;
  const rulerUnit = `${weightUnit}/wk`;

  useEffect(() => {
    if (!editing) setInputText(displayValue.toFixed(2));
  }, [displayValue, editing]);

  const applyDisplayRate = (displayRate: number) => {
    const rateKg = toKilograms(displayRate, weightUnit);
    onValueChange(normalizeGoalRate(rateKg, goal));
  };

  const handleInputChange = (text: string) => {
    if (!/^[+-]?(?:\d*(?:[.,]\d{0,2})?)?$/.test(text)) return;
    setInputText(text);
    const parsed = parseRate(text);
    if (parsed != null) applyDisplayRate(parsed);
  };

  const commitInput = () => {
    setEditing(false);
    const parsed = parseRate(inputText);
    if (parsed == null) {
      setInputText(displayValue.toFixed(2));
      return;
    }
    const normalized = normalizeGoalRate(toKilograms(parsed, weightUnit), goal);
    onValueChange(normalized);
    setInputText(formatDisplayValue(normalized));
  };

  const handleRulerChange = (nextRate: number) => {
    onValueChange(nextRate);
    setInputText(formatDisplayValue(nextRate));
  };

  const warningLabel = goal === 'cut' ? 'loss' : 'gain';

  return (
    <View className="gap-4">
      <View className="flex-row items-baseline justify-center gap-1.5">
        <TextInput
          value={inputText}
          onChangeText={handleInputChange}
          onFocus={() => setEditing(true)}
          onBlur={commitInput}
          onSubmitEditing={commitInput}
          accessibilityLabel={`Target ${warningLabel} rate in ${unitLabel}`}
          accessibilityHint={warning ? `Very fast ${warningLabel} target` : undefined}
          keyboardType="decimal-pad"
          selectTextOnFocus
          textAlign="center"
          underlineColorAndroid="transparent"
          selectionColor={color}
          maxLength={7}
          className="w-32 py-1 text-center text-4xl font-bold tabular-nums"
          style={{ color }}
        />
        <Text className="shrink-0 text-sm font-medium" style={{ color }}>
          {unitLabel}
        </Text>
      </View>

      <RulerSlider
        value={valueKgPerWeek}
        onValueChange={handleRulerChange}
        min={range.min}
        max={range.max}
        step={GOAL_RATE_STEP_KG}
        tickStep={GOAL_RATE_STEP_KG}
        majorTickEvery={0.25}
        fitRange
        unit={rulerUnit}
        label={`Target ${warningLabel} rate`}
        formatValue={formatDisplayValue}
        showValue={false}
      />

      <View className="flex-row justify-between">
        <Text className="text-sm font-medium text-m3-on-surface-variant">
          {goal === 'cut' ? 'Fast' : 'Slow'}
        </Text>
        <Text className="text-sm font-medium text-m3-on-surface-variant">
          {goal === 'cut' ? 'Slow' : 'Fast'}
        </Text>
      </View>

      {warning ? (
        <View
          className="flex-row items-start gap-2 rounded-2xl bg-m3-surface-container-high px-4 py-3"
          accessibilityLiveRegion="polite"
        >
          <MaterialIcons name="warning-amber" size={20} color={color} />
          <Text className="flex-1 text-sm leading-5" style={{ color }}>
            Very fast {warningLabel} target. A slower pace may be easier to sustain.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
