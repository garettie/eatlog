import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import ResponsiveContent from '../ResponsiveContent';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../../theme/layout';
import { M3 } from '../../theme/tokens';
import { PAID_PLAN_NAME } from '../../services/tierNames';

interface AiChoiceContentProps {
  onUseKey: () => void;
  onEatlogAi: () => void;
  onNotNow: () => void;
  busy?: boolean;
  error?: string | null;
  scrollable?: boolean;
}

function ChoiceRow({
  icon,
  title,
  detail,
  onPress,
  disabled,
  showDivider,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
  showDivider: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: M3.surfaceContainer }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={{ disabled }}
      className="min-h-[76px] flex-row items-center gap-4 px-4 py-3 active:opacity-70"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-m3-surface-container-high">
        <MaterialIcons name={icon} size={22} color={M3.onSurface} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-semibold text-m3-on-surface">{title}</Text>
        <Text className="text-sm text-m3-on-surface-variant">{detail}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={M3.onSurfaceVariant} />
      {showDivider ? <View className="absolute bottom-0 left-[76px] right-4 h-px bg-m3-outline-variant/50" /> : null}
    </Pressable>
  );
}

/**
 * How AI estimates are funded, asked once in onboarding and again whenever someone without a key
 * or Itik reaches for Scan, Photo, or Describe. Choosing here sends nothing.
 */
export default function AiChoiceContent({
  onUseKey,
  onEatlogAi,
  onNotNow,
  busy = false,
  error = null,
  scrollable = false,
}: AiChoiceContentProps) {
  const { horizontalPadding } = useResponsiveLayout();
  const body = (
    <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="flex-1">
      <View className="flex-1 justify-center gap-7 py-8">
        <View className="items-center gap-5">
          <View className="h-16 w-16 items-center justify-center rounded-full border border-m3-outline-variant/50 bg-m3-surface-container-high">
            <MaterialIcons name="auto-awesome" size={30} color={M3.primary} />
          </View>
          <Text accessibilityRole="header" className="text-center text-2xl font-bold text-m3-on-surface">
            AI meal estimates
          </Text>
          <Text className="text-center text-base leading-6 text-m3-on-surface-variant">
            Estimate a meal from a photo or a few words. Logging, search, and everything else work without it.
          </Text>
        </View>
        <View className="overflow-hidden rounded-2xl bg-m3-surface-container-low">
          <ChoiceRow
            icon="key"
            title="Use my Google key"
            detail="Free. Sent from this phone to Google."
            onPress={onUseKey}
            disabled={busy}
            showDivider
          />
          <ChoiceRow
            icon="auto-awesome"
            title="Eatlog AI"
            detail={`With ${PAID_PLAN_NAME}. Nothing to set up.`}
            onPress={onEatlogAi}
            disabled={busy}
            showDivider={false}
          />
        </View>
        <View className="gap-3">
          <Pressable
            onPress={onNotNow}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Not now. Continue without AI meal estimates."
            accessibilityState={{ disabled: busy, busy }}
            className={`min-h-[48px] flex-row items-center justify-center gap-2 px-5 active:opacity-60 ${busy ? 'opacity-50' : ''}`}
          >
            {busy ? <ActivityIndicator color={M3.onSurfaceVariant} /> : null}
            <Text className="text-base font-semibold text-m3-on-surface-variant">Not now</Text>
          </Pressable>
          {error ? (
            <Text
              accessibilityLiveRegion="assertive"
              className="rounded-xl bg-m3-error-container px-4 py-3 text-sm text-m3-on-error-container"
            >
              {error}
            </Text>
          ) : null}
        </View>
      </View>
    </ResponsiveContent>
  );

  if (!scrollable) return <View className="flex-1">{body}</View>;
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: horizontalPadding, paddingTop: 8, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {body}
    </ScrollView>
  );
}
