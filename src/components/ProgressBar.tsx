import React from 'react';
import { Text, View } from 'react-native';

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

export default function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const pct = (currentStep / totalSteps) * 100;
  return (
    <View className="mb-6">
      <Text className="text-m3-on-surface-variant text-xs font-semibold mb-2">
        Step {currentStep} of {totalSteps}
      </Text>
      <View className="h-1 bg-m3-surface-container-highest rounded-full overflow-hidden">
        <View className="h-full bg-m3-primary rounded-full" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}
