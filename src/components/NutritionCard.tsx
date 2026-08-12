import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../theme/tokens';
import { foodIcon } from '../utils/foodIcons';

function MacroPill({ letter, grams, color }: { letter: string; grams: number; color: string }) {
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: color + '1A' }}>
      <Text className="text-compact font-bold tabular-nums" style={{ color }}>
        {letter} {Math.round(grams)}g
      </Text>
    </View>
  );
}

export interface NutritionCardProps {
  name: string;
  photoUri?: string | null;
  secondaryText: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  onPress: () => void;
  accessibilityHint: string;
  accessibilityActions?: Array<{ name: string; label: string }>;
  onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
  onPressMedia?: () => void;
  mediaAccessibilityLabel?: string;
  action?: React.ReactNode;
}

export default function NutritionCard({
  name,
  photoUri: sourcePhotoUri,
  secondaryText,
  calories,
  protein,
  carbs,
  fat,
  onPress,
  accessibilityHint,
  accessibilityActions,
  onAccessibilityAction,
  onPressMedia,
  mediaAccessibilityLabel,
  action,
}: NutritionCardProps) {
  const [failedPhotoUri, setFailedPhotoUri] = useState<string | null>(null);
  const photoUri = sourcePhotoUri && sourcePhotoUri !== failedPhotoUri ? sourcePhotoUri : null;

  useEffect(() => {
    setFailedPhotoUri(null);
  }, [sourcePhotoUri]);

  const media = photoUri ? (
    <Image
      source={{ uri: photoUri }}
      style={{ width: 112, flex: 1, objectFit: 'cover' }}
      resizeMode="cover"
      fadeDuration={0}
      onError={() => setFailedPhotoUri(photoUri)}
    />
  ) : (
    <View className="flex-1 items-center justify-center">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-m3-surface-container-highest">
        <MaterialCommunityIcons name={foodIcon(name)} size={20} color={M3.onSurfaceVariant} />
      </View>
    </View>
  );

  return (
    <View className="rounded-2xl overflow-hidden bg-m3-surface-container border border-m3-outline-variant/30">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${Math.round(calories)} calories`}
        accessibilityHint={accessibilityHint}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        className="flex-row items-stretch min-h-[112px] active:opacity-80"
      >
        {onPressMedia ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onPressMedia();
            }}
            accessibilityRole="button"
            accessibilityLabel={mediaAccessibilityLabel ?? `Share ${name}`}
            className="w-28 self-stretch overflow-hidden bg-m3-surface-container-highest active:opacity-80"
          >
            {media}
            <View
              pointerEvents="none"
              className="absolute bottom-2 right-2 h-9 w-9 items-center justify-center rounded-full border border-m3-outline-variant bg-m3-surface-container-lowest"
            >
              <MaterialIcons name="share" size={18} color={M3.onSurface} />
            </View>
          </Pressable>
        ) : (
          <View className="w-28 self-stretch items-center justify-center">
            {media}
          </View>
        )}
        <View className="flex-1 min-w-0 px-5 py-5">
          <Text className="text-m3-on-surface text-base font-bold leading-5" numberOfLines={2}>
            {name}
          </Text>
          <Text className="text-m3-on-surface-variant text-xs mt-0.5" numberOfLines={1}>
            {secondaryText}
          </Text>
          <View className="flex-row gap-1.5 flex-wrap mt-2">
            <MacroPill letter="P" grams={protein} color={M3.protein} />
            <MacroPill letter="C" grams={carbs} color={M3.carbs} />
            <MacroPill letter="F" grams={fat} color={M3.fat} />
          </View>
        </View>
        <View className="w-24 shrink-0 items-end pt-14 pr-5">
          <Text className="text-m3-on-surface text-base font-bold tabular-nums">
            {Math.round(calories)}
            <Text className="text-m3-on-surface-variant text-compact font-medium"> kcal</Text>
          </Text>
        </View>
      </Pressable>
      {action}
    </View>
  );
}
