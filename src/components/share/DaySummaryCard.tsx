import React from 'react';
import { Text, View } from 'react-native';

import { M3 } from '../../theme/tokens';
import { parseLocalISO } from '../../utils/calendar';
import type { DaySummaryShareData } from '../../utils/shareCards';
import {
  BrandBadge,
  CANVAS_PADDING,
  CaloriesFigure,
  LiquidMacroCapsule,
  StoryCanvas,
} from './ShareCardPrimitives';

function displayDate(logDate: string): string {
  return parseLocalISO(logDate).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DaySummaryCard({
  data,
  showBranding,
  width,
  height,
}: {
  data: DaySummaryShareData;
  showBranding: boolean;
  width: number;
  height: number;
}) {
  return (
    <StoryCanvas width={width} height={height}>
      <View
        className="flex-1 bg-m3-surface-container-lowest"
        style={{
          paddingHorizontal: CANVAS_PADDING.horizontal,
          paddingTop: CANVAS_PADDING.top,
          paddingBottom: CANVAS_PADDING.bottom,
        }}
      >
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1">
            <Text maxFontSizeMultiplier={1} className="text-3xl font-bold text-m3-on-surface">
              Daily summary
            </Text>
            <Text maxFontSizeMultiplier={1} className="mt-1 text-sm font-medium text-m3-on-surface-variant">
              {displayDate(data.logDate)}
            </Text>
          </View>
          {showBranding && <BrandBadge />}
        </View>

        <View className="mt-9">
          <CaloriesFigure calories={data.calories} targetCalories={data.targetCalories} />
        </View>

        <View className="mt-10 flex-1 justify-end">
          <View className="flex-row gap-3">
            <LiquidMacroCapsule label="Protein" value={data.protein} color={M3.protein} />
            <LiquidMacroCapsule label="Carbs" value={data.carbs} color={M3.carbs} />
            <LiquidMacroCapsule label="Fat" value={data.fat} color={M3.fat} />
          </View>
        </View>
      </View>
    </StoryCanvas>
  );
}
