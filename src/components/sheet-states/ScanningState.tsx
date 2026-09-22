import React from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { M3 } from '../../theme/tokens';

/** The spinner variant's height, used to size the sheet before it is measured. */
export const SCANNING_SPINNER_HEIGHT = 240;

interface ScanningStateProps {
  onCancel: () => void;
  /** The photo being estimated. It stays where Identify meal showed it while the estimate runs. */
  photoUri?: string | null;
  /** Holds the height of the view this one replaced, so the sheet does not resize mid-flow. */
  minHeight?: number;
}

export default function ScanningState({ onCancel, photoUri, minHeight }: ScanningStateProps) {
  const cancel = (
    <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel scanning" className="min-h-[48px] justify-center bg-m3-surface-container-highest rounded-full px-5 py-2.5 active:opacity-60">
      <Text className="text-m3-on-surface text-xs font-semibold">Cancel</Text>
    </Pressable>
  );

  if (photoUri) {
    return (
      <View style={{ minHeight }} className="px-5 pt-2 pb-6 gap-4">
        <View className="min-h-[48px] justify-center">
          <Text accessibilityRole="header" className="text-base font-bold text-m3-on-surface">
            Estimating meal
          </Text>
        </View>
        <Image
          source={{ uri: photoUri }}
          resizeMode="cover"
          accessible
          accessibilityLabel="Meal photo being estimated"
          accessibilityIgnoresInvertColors
          className="h-40 w-full rounded-2xl bg-m3-surface-container-high"
        />
        <View className="flex-1 items-center justify-center gap-3">
          <View accessibilityLiveRegion="polite" className="flex-row items-center gap-3">
            <ActivityIndicator size="small" color={M3.primary} />
            <Text className="text-m3-on-surface text-sm font-semibold">Reading ingredients and portions…</Text>
          </View>
          <Text className="text-m3-on-surface-variant text-sm text-center">
            You'll review estimates before logging.
          </Text>
          {cancel}
        </View>
      </View>
    );
  }

  return (
    <View style={{ minHeight: SCANNING_SPINNER_HEIGHT }} className="px-5 pt-2 pb-6 gap-4 items-center justify-center">
      <View className="w-full items-center gap-3">
        <ActivityIndicator size="large" color={M3.primary} />
        <Text className="text-m3-on-surface text-sm font-semibold text-center">Reading ingredients and portions…</Text>
        <Text className="text-m3-on-surface-variant text-sm text-center">
          You'll review estimates before logging.
        </Text>
        {cancel}
      </View>
    </View>
  );
}
