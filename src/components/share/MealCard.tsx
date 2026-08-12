import React from 'react';
import { Image, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { M3 } from '../../theme/tokens';
import { parseLocalISO } from '../../utils/calendar';
import { foodIcon } from '../../utils/foodIcons';
import type { MealCardLayout, MealShareData } from '../../utils/shareCards';
import {
  BrandMark,
  CANVAS_PADDING,
  CaloriesFigure,
  LiquidMacroCapsule,
  MealMacroRow,
  StoryCanvas,
} from './ShareCardPrimitives';

function displayTimestamp(data: MealShareData): string {
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(data.loggedAt);
  const timestampText = data.loggedAt.replace(' ', 'T');
  const normalized = hasExplicitZone ? timestampText : `${timestampText}Z`;
  const timestamp = new Date(normalized);
  const time = Number.isNaN(timestamp.getTime())
    ? ''
    : timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const date = parseLocalISO(data.logDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const meal = data.mealType.charAt(0).toUpperCase() + data.mealType.slice(1);
  return [meal, date, time].filter(Boolean).join(' · ');
}

function MealMedia({
  data,
  className,
  resizeMode,
  onLoad,
  onError,
}: {
  data: MealShareData;
  className: string;
  resizeMode: 'cover' | 'contain';
  onLoad?: () => void;
  onError?: () => void;
}) {
  if (!data.photoUri) {
    return (
      <View
        className={`${className} items-center justify-center bg-m3-surface-container-high`}
        onLayout={() => onLoad?.()}
      >
        <View className="h-12 w-12 items-center justify-center rounded-full bg-m3-surface-container-highest">
          <MaterialCommunityIcons name={foodIcon(data.name)} size={24} color={M3.onSurfaceVariant} />
        </View>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: data.photoUri }}
      className={className}
      resizeMode={resizeMode}
      fadeDuration={0}
      onLoad={onLoad}
      onError={onError}
      accessibilityIgnoresInvertColors
    />
  );
}

function FullBleedMeal({
  data,
  showBranding,
  onPhotoLoad,
  onPhotoError,
}: MealLayoutProps) {
  return (
    <View className="flex-1 bg-m3-surface-container-lowest">
      <MealMedia data={data} className="absolute inset-0 h-full w-full" resizeMode="cover" onLoad={onPhotoLoad} onError={onPhotoError} />
      <Svg
        pointerEvents="none"
        width={360}
        height={640}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <Defs>
          <LinearGradient id="meal-bottom-scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="36%" stopColor={M3.scrim} stopOpacity="0" />
            <Stop offset="68%" stopColor={M3.scrim} stopOpacity="0.72" />
            <Stop offset="100%" stopColor={M3.scrim} stopOpacity="0.96" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={360} height={640} fill="url(#meal-bottom-scrim)" />
      </Svg>
      {showBranding && (
        <View className="absolute right-6 top-7">
          <BrandMark dark />
        </View>
      )}
      <View className="absolute bottom-0 left-0 right-0 px-6 pb-7">
        <Text maxFontSizeMultiplier={1} className="text-3xl font-bold text-white" numberOfLines={3}>
          {data.name}
        </Text>
        <Text maxFontSizeMultiplier={1} className="mt-1.5 text-sm font-medium text-white/80">
          {displayTimestamp(data)}
        </Text>
        <View className="mt-5">
          <CaloriesFigure calories={data.calories} targetCalories={null} light compact />
        </View>
        <View className="mt-4">
          <MealMacroRow protein={data.protein} carbs={data.carbs} fat={data.fat} light />
        </View>
      </View>
    </View>
  );
}

function FramedMeal({
  data,
  showBranding,
  onPhotoLoad,
  onPhotoError,
}: MealLayoutProps) {
  return (
    <View
      className="flex-1 bg-m3-surface-container-lowest"
      style={{
        paddingHorizontal: CANVAS_PADDING.horizontal,
        paddingTop: CANVAS_PADDING.top,
        paddingBottom: CANVAS_PADDING.bottom,
      }}
    >
      <View className="min-h-[30px] flex-row items-center justify-between gap-3">
        <Text maxFontSizeMultiplier={1} className="flex-1 text-sm font-medium text-m3-on-surface-variant">
          {displayTimestamp(data)}
        </Text>
        {showBranding && <BrandMark />}
      </View>
      <View className="mt-5 h-[334px] overflow-hidden rounded-3xl bg-m3-surface-container-high">
        <MealMedia data={data} className="h-full w-full" resizeMode="cover" onLoad={onPhotoLoad} onError={onPhotoError} />
      </View>
      <Text maxFontSizeMultiplier={1} className="mt-5 text-2xl font-bold text-m3-on-surface" numberOfLines={2}>
        {data.name}
      </Text>
      <View className="mt-4 flex-row items-center gap-4">
        <View className="shrink-0">
          <Text maxFontSizeMultiplier={1} className="text-2xl font-bold text-m3-calories tabular-nums">
            {Math.round(data.calories).toLocaleString()}
          </Text>
          <Text maxFontSizeMultiplier={1} className="text-xs font-medium text-m3-on-surface-variant">kcal</Text>
        </View>
        <View className="h-10 w-px bg-m3-outline-variant" />
        <View className="min-w-0 flex-1">
          <MealMacroRow protein={data.protein} carbs={data.carbs} fat={data.fat} />
        </View>
      </View>
    </View>
  );
}

function StatMeal({
  data,
  showBranding,
  onPhotoLoad,
  onPhotoError,
}: MealLayoutProps) {
  return (
    <View
      className="flex-1 bg-m3-surface-container-lowest"
      style={{
        paddingHorizontal: CANVAS_PADDING.horizontal,
        paddingTop: CANVAS_PADDING.top,
        paddingBottom: CANVAS_PADDING.bottom,
      }}
    >
      <View className="min-h-[30px] items-end">
        {showBranding && <BrandMark />}
      </View>
      <View className="mt-5 flex-row items-center gap-4">
        <View className="h-[78px] w-[78px] overflow-hidden rounded-2xl bg-m3-surface-container-high">
          <MealMedia data={data} className="h-full w-full" resizeMode="cover" onLoad={onPhotoLoad} onError={onPhotoError} />
        </View>
        <View className="min-w-0 flex-1">
          <Text maxFontSizeMultiplier={1} className="text-2xl font-bold text-m3-on-surface" numberOfLines={2}>
            {data.name}
          </Text>
          <Text maxFontSizeMultiplier={1} className="mt-1 text-sm font-medium text-m3-on-surface-variant">
            {displayTimestamp(data)}
          </Text>
        </View>
      </View>
      <View className="mt-8">
        <CaloriesFigure calories={data.calories} targetCalories={data.targetCalories} compact />
      </View>
      <View className="mt-7 flex-1 justify-end">
        <View className="flex-row gap-3">
          <LiquidMacroCapsule label="Protein" value={data.protein} color={M3.protein} height={210} />
          <LiquidMacroCapsule label="Carbs" value={data.carbs} color={M3.carbs} height={210} />
          <LiquidMacroCapsule label="Fat" value={data.fat} color={M3.fat} height={210} />
        </View>
      </View>
    </View>
  );
}

interface MealLayoutProps {
  data: MealShareData;
  showBranding: boolean;
  onPhotoLoad?: () => void;
  onPhotoError?: () => void;
}

export default function MealCard({
  data,
  layout,
  showBranding,
  width,
  height,
  onPhotoLoad,
  onPhotoError,
}: MealLayoutProps & {
  layout: MealCardLayout;
  width: number;
  height: number;
}) {
  return (
    <StoryCanvas width={width} height={height}>
      {layout === 'photo' ? (
        <FullBleedMeal data={data} showBranding={showBranding} onPhotoLoad={onPhotoLoad} onPhotoError={onPhotoError} />
      ) : layout === 'framed' ? (
        <FramedMeal data={data} showBranding={showBranding} onPhotoLoad={onPhotoLoad} onPhotoError={onPhotoError} />
      ) : (
        <StatMeal data={data} showBranding={showBranding} onPhotoLoad={onPhotoLoad} onPhotoError={onPhotoError} />
      )}
    </StoryCanvas>
  );
}
