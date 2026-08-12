import type React from 'react';
import { Image, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { M3, TYPE } from '../../theme/tokens';
import type { ShareMacroValue } from '../../utils/shareCards';

export const STORY_DESIGN_WIDTH = 360;
export const STORY_DESIGN_HEIGHT = 640;

export const CANVAS_PADDING = {
  horizontal: 28,
  top: 32,
  bottom: 32,
} as const;

export function StoryCanvas({
  width,
  height,
  children,
  backgroundColor = M3.surfaceContainerLowest,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
  backgroundColor?: string;
}) {
  const scale = width / STORY_DESIGN_WIDTH;
  return (
    <View style={{ width, height, overflow: 'hidden', backgroundColor }}>
      <View
        style={{
          position: 'absolute',
          width: STORY_DESIGN_WIDTH,
          height: STORY_DESIGN_HEIGHT,
          left: (width - STORY_DESIGN_WIDTH) / 2,
          top: (height - STORY_DESIGN_HEIGHT) / 2,
          transform: [{ scale }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <View
      className="min-h-[32px] flex-row items-center gap-2 rounded-full px-2.5"
      style={{
        backgroundColor: dark ? `${M3.surfaceContainerLowest}d9` : M3.surfaceContainerHigh,
        borderColor: dark ? `${M3.primary}33` : M3.outlineVariant,
        borderWidth: 1,
      }}
      accessible={false}
    >
      <View className="h-[22px] w-[22px] overflow-hidden">
        <Image
          source={require('../../../assets/adaptive-icon.png')}
          resizeMode="contain"
          fadeDuration={0}
          style={{ position: 'absolute', width: 44, height: 44, left: -11, top: -11 }}
          accessible={false}
        />
      </View>
      <Text
        maxFontSizeMultiplier={1}
        className="text-xs font-semibold"
        style={{ color: dark ? M3.primary : M3.onSurface }}
      >
        Eatlog
      </Text>
    </View>
  );
}

export function LiquidMacroCapsule({
  label,
  value,
  color,
  height = 224,
}: {
  label: string;
  value: ShareMacroValue;
  color: string;
  height?: number;
}) {
  const progress = Math.min(1, Math.max(0, value.percentOfGoal ?? 0));
  const capsuleWidth = 68;
  const capsuleRadius = 33;
  const capsuleLeft = 1;
  const capsuleRight = capsuleWidth - 1;
  const capsuleCenterX = capsuleWidth / 2;
  const innerHeight = height - 2;
  const fillHeight = Math.round(innerHeight * progress);
  const fillLevel = 1 + innerHeight - fillHeight;
  const curveDepth = Math.min(16, fillHeight, Math.max(0, fillLevel - 1));
  const fillPath = progress >= 1
    ? `M ${capsuleLeft} 1 H ${capsuleRight} V ${height - 1} H ${capsuleLeft} Z`
    : fillHeight > 0
      ? [
          `M ${capsuleLeft} ${fillLevel}`,
          `C 10 ${fillLevel} 18 ${fillLevel - curveDepth} ${capsuleCenterX} ${fillLevel - curveDepth}`,
          `C 50 ${fillLevel - curveDepth} 58 ${fillLevel} ${capsuleRight} ${fillLevel}`,
          `V ${height}`,
          `H ${capsuleLeft}`,
          'Z',
        ].join(' ')
      : null;
  const clipId = `macro-capsule-fill-${label.toLowerCase()}`;
  const percentLabel = value.percentOfGoal == null
    ? 'No goal'
    : `${Math.round(value.percentOfGoal * 100)}%`;

  return (
    <View className="flex-1 items-center">
      <Text
        maxFontSizeMultiplier={1}
        className="text-lg font-bold tabular-nums"
        style={{ color }}
      >
        {Math.round(value.grams)}g
      </Text>
      <View className="mt-3" style={{ width: capsuleWidth, height }}>
        <Svg width={capsuleWidth} height={height} pointerEvents="none">
          <Defs>
            <ClipPath id={clipId}>
              <Rect
                x={capsuleLeft}
                y={1}
                width={capsuleWidth - 2}
                height={innerHeight}
                rx={capsuleRadius}
              />
            </ClipPath>
          </Defs>
          <Rect
            x={0.5}
            y={0.5}
            width={capsuleWidth - 1}
            height={height - 1}
            rx={capsuleWidth / 2 - 0.5}
            fill={M3.surfaceContainerHigh}
          />
          {fillPath && (
            <Path
              d={fillPath}
              fill={color}
              clipPath={`url(#${clipId})`}
            />
          )}
          <Rect
            x={0.5}
            y={0.5}
            width={capsuleWidth - 1}
            height={height - 1}
            rx={capsuleWidth / 2 - 0.5}
            fill="none"
            stroke={M3.outline}
          />
        </Svg>
      </View>
      <Text maxFontSizeMultiplier={1} className="mt-3 text-sm font-semibold text-m3-on-surface">
        {label}
      </Text>
      <Text maxFontSizeMultiplier={1} className="mt-0.5 text-xs font-medium text-m3-on-surface-variant tabular-nums">
        {percentLabel}
      </Text>
    </View>
  );
}

export function CaloriesFigure({
  calories,
  targetCalories,
  light = false,
  compact = false,
}: {
  calories: number;
  targetCalories: number | null;
  light?: boolean;
  compact?: boolean;
}) {
  return (
    <View>
      <View className="flex-row items-baseline gap-2">
        <Text
          maxFontSizeMultiplier={1}
          className="tabular-nums"
          style={{
            color: M3.primary,
            fontFamily: TYPE.family.bold,
            fontWeight: '400',
            fontSize: compact ? 48 : 60,
            lineHeight: compact ? 52 : 64,
            letterSpacing: -1.2,
          }}
        >
          {Math.round(calories).toLocaleString()}
        </Text>
        <Text
          maxFontSizeMultiplier={1}
          className="text-sm font-semibold"
          style={{ color: light ? `${M3.primary}cc` : M3.onSurfaceVariant }}
        >
          kcal
        </Text>
      </View>
      {targetCalories != null && (
        <Text
          maxFontSizeMultiplier={1}
          className="mt-1 text-sm font-medium tabular-nums"
          style={{ color: light ? `${M3.primary}cc` : M3.onSurfaceVariant }}
        >
          {Math.round(targetCalories).toLocaleString()} kcal daily target
        </Text>
      )}
    </View>
  );
}

export function MealMacroRow({
  protein,
  carbs,
  fat,
  light = false,
}: {
  protein: ShareMacroValue;
  carbs: ShareMacroValue;
  fat: ShareMacroValue;
  light?: boolean;
}) {
  const macros = [
    { label: 'Protein', value: protein, color: M3.protein },
    { label: 'Carbs', value: carbs, color: M3.carbs },
    { label: 'Fat', value: fat, color: M3.fat },
  ];
  return (
    <View className="flex-row gap-2">
      {macros.map((macro) => (
        <View
          key={macro.label}
          className="flex-1 rounded-2xl px-2 py-3"
          style={{ backgroundColor: light ? `${M3.surfaceContainerLowest}b3` : `${macro.color}14` }}
        >
          <Text maxFontSizeMultiplier={1} className="text-xs font-semibold" style={{ color: macro.color }}>
            {macro.label}
          </Text>
          <Text
            maxFontSizeMultiplier={1}
            className="mt-0.5 text-lg font-bold tabular-nums"
            style={{ color: light ? M3.primary : M3.onSurface }}
          >
            {Math.round(macro.value.grams)}g
          </Text>
          <View className="mt-2 h-1 overflow-hidden rounded-full" style={{ backgroundColor: M3.outlineVariant }}>
            <View
              style={{
                height: 4,
                width: `${Math.min(1, Math.max(0, macro.value.percentOfGoal ?? 0)) * 100}%`,
                backgroundColor: macro.color,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
