import React from 'react';
import { Text, View } from 'react-native';

import { M3, TYPE } from '../../theme/tokens';
import { parseLocalISO } from '../../utils/calendar';
import type { ConsistencyShareData } from '../../utils/shareCards';
import { BrandMark, CANVAS_PADDING, StoryCanvas } from './ShareCardPrimitives';

function displayDate(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ConsistencyCard({
  data,
  showBranding,
  width,
  height,
}: {
  data: ConsistencyShareData;
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
              Logging consistency
            </Text>
            <Text maxFontSizeMultiplier={1} className="mt-1 text-sm font-medium text-m3-on-surface-variant">
              30 days through {displayDate(data.endDate)}
            </Text>
          </View>
          {showBranding && <BrandMark />}
        </View>

        <View className="mt-14">
          <View className="flex-row items-baseline gap-3">
            <Text
              maxFontSizeMultiplier={1}
              className="text-m3-calories tabular-nums"
              style={{
                fontFamily: TYPE.family.bold,
                fontWeight: '400',
                fontSize: 72,
                lineHeight: 76,
                letterSpacing: -1.5,
              }}
            >
              {data.currentWeekCount}/7
            </Text>
            <Text maxFontSizeMultiplier={1} className="text-xl font-bold text-m3-on-surface">
              this week
            </Text>
          </View>
          <Text maxFontSizeMultiplier={1} className="mt-2 text-base font-medium text-m3-on-surface-variant">
            Food days logged
          </Text>
        </View>

        <View className="mt-auto border-t border-m3-outline-variant pt-7">
          <Text maxFontSizeMultiplier={1} className="text-base font-bold text-m3-on-surface">
            Last 30 days
          </Text>
          <View className="mt-6 gap-2">
            {data.rows.map((row) => (
              <View key={row[0].date} className="flex-row gap-2">
                {row.map((cell) => (
                  <View
                    key={cell.date}
                    className="aspect-square flex-1 rounded-md border"
                    style={{
                      backgroundColor: cell.logged ? M3.calories : M3.surfaceContainerHigh,
                      borderColor: cell.logged ? M3.calories : M3.outline,
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
          <View className="mt-5 flex-row items-center gap-5">
            <View className="flex-row items-center gap-2">
              <View className="h-3 w-3 rounded-sm bg-m3-calories" />
              <Text maxFontSizeMultiplier={1} className="text-xs font-medium text-m3-on-surface-variant">
                Logged
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="h-3 w-3 rounded-sm border border-m3-outline bg-m3-surface-container-high" />
              <Text maxFontSizeMultiplier={1} className="text-xs font-medium text-m3-on-surface-variant">
                Not logged
              </Text>
            </View>
          </View>
        </View>
      </View>
    </StoryCanvas>
  );
}
