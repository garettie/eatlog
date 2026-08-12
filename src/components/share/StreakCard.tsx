import React from 'react';
import { Text, View } from 'react-native';

import { M3, TYPE } from '../../theme/tokens';
import { parseLocalISO } from '../../utils/calendar';
import type { StreakShareData } from '../../utils/shareCards';
import { BrandBadge, StoryCanvas } from './ShareCardPrimitives';

function displayDate(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function StreakCard({
  data,
  showBranding,
  width,
  height,
}: {
  data: StreakShareData;
  showBranding: boolean;
  width: number;
  height: number;
}) {
  const completed = data.lastSevenDays.filter((day) => day.complete).length;
  return (
    <StoryCanvas width={width} height={height}>
      <View className="flex-1 bg-m3-surface-container-lowest px-7 pb-8 pt-8">
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1">
            <Text maxFontSizeMultiplier={1} className="text-3xl font-bold text-m3-on-surface">
              Logging streak
            </Text>
            <Text maxFontSizeMultiplier={1} className="mt-1 text-sm font-medium text-m3-on-surface-variant">
              Through {displayDate(data.endDate)}
            </Text>
          </View>
          {showBranding && <BrandBadge />}
        </View>

        <View className="mt-14">
          <View className="flex-row items-baseline gap-3">
            <Text
              maxFontSizeMultiplier={1}
              className="text-m3-calories tabular-nums"
              style={{
                fontFamily: TYPE.family.bold,
                fontWeight: '400',
                fontSize: 96,
                lineHeight: 100,
                letterSpacing: -2,
              }}
            >
              {data.currentStreak}
            </Text>
            <Text maxFontSizeMultiplier={1} className="text-2xl font-bold text-m3-on-surface">
              {data.currentStreak === 1 ? 'day' : 'days'}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={1} className="mt-1 text-base font-medium text-m3-on-surface-variant">
            Current food-logging streak
          </Text>
        </View>

        <View
          className="mt-10 flex-row items-center justify-between py-5"
          style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: M3.outlineVariant }}
        >
          <Text maxFontSizeMultiplier={1} className="text-sm font-medium text-m3-on-surface-variant">
            Longest streak
          </Text>
          <Text maxFontSizeMultiplier={1} className="text-2xl font-bold text-m3-on-surface tabular-nums">
            {data.longestStreak} {data.longestStreak === 1 ? 'day' : 'days'}
          </Text>
        </View>

        <View className="mt-auto">
          <View className="flex-row items-baseline justify-between gap-3">
            <Text maxFontSizeMultiplier={1} className="text-lg font-bold text-m3-on-surface">Last 7 days</Text>
            <Text maxFontSizeMultiplier={1} className="text-sm font-semibold text-m3-on-surface-variant tabular-nums">
              {completed}/7 logged
            </Text>
          </View>
          <View className="mt-5 flex-row gap-2">
            {data.lastSevenDays.map((day) => {
              const parsed = parseLocalISO(day.date);
              const label = parsed.toLocaleDateString(undefined, { weekday: 'narrow' });
              return (
                <View key={day.date} className="flex-1 items-center gap-2">
                  <View
                    className="h-[58px] w-full rounded-full border"
                    style={{
                      backgroundColor: day.complete ? M3.calories : M3.surfaceContainerHigh,
                      borderColor: day.complete ? M3.calories : M3.outline,
                    }}
                  />
                  <Text
                    maxFontSizeMultiplier={1}
                    className="text-xs font-semibold"
                    style={{ color: day.complete ? M3.onSurface : M3.onSurfaceVariant }}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </StoryCanvas>
  );
}
