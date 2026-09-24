import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import FlowTopBar from './FlowTopBar';
import ResponsiveContent from '../ResponsiveContent';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../../theme/layout';
import { M3 } from '../../theme/tokens';
import { PAID_PLAN_NAME } from '../../services/tierNames';
import { serviceConfig } from '../../config/services';

interface AiChoiceContentProps {
  onUseKey: () => void;
  onEatlogAi: () => void;
  onNotNow: () => void;
  /** Close in the modal, Back in onboarding. */
  topBar?: { icon: 'close' | 'arrow-back'; label: string; onPress: () => void };
  busy?: boolean;
  error?: string | null;
  scrollable?: boolean;
}

function ChoiceCard({
  icon,
  title,
  badge,
  detail,
  onPress,
  disabled,
  emphasis,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  badge?: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
  emphasis: 'high' | 'low';
}) {
  const high = emphasis === 'high';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: M3.surfaceContainerHighest }}
      accessibilityRole="button"
      accessibilityLabel={`${title}${badge ? `, ${badge}` : ''}. ${detail}`}
      accessibilityState={{ disabled }}
      className={`min-h-[84px] flex-row items-center gap-4 overflow-hidden rounded-3xl px-5 py-4 active:opacity-80 ${
        high ? 'border border-m3-outline-variant bg-m3-surface-container-high' : 'bg-m3-surface-container-low'
      }`}
    >
      <View
        className={`h-11 w-11 items-center justify-center rounded-full ${
          high ? 'bg-m3-surface-container-highest' : 'bg-m3-surface-container-high'
        }`}
      >
        <MaterialIcons name={icon} size={22} color={high ? M3.primary : M3.onSurface} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-base font-semibold text-m3-on-surface">{title}</Text>
          {badge ? (
            <View className="rounded-full bg-m3-primary px-2.5 py-0.5">
              <Text className="text-xs font-semibold text-m3-on-primary">{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-sm text-m3-on-surface-variant">{detail}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={M3.onSurfaceVariant} />
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
  topBar,
  busy = false,
  error = null,
  scrollable = false,
}: AiChoiceContentProps) {
  const { horizontalPadding } = useResponsiveLayout();
  const body = (
    <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="flex-1">
      <View className="flex-1 justify-center gap-9 py-6">
        <View className="items-center gap-4">
          <View className="h-16 w-16 items-center justify-center rounded-full border border-m3-outline-variant/50 bg-m3-surface-container-high">
            <MaterialIcons name="auto-awesome" size={30} color={M3.primary} />
          </View>
          <View className="items-center gap-2">
            <Text accessibilityRole="header" className="text-center text-2xl font-bold text-m3-on-surface">
              AI meal estimates
            </Text>
            <Text className="text-center text-base leading-6 text-m3-on-surface-variant">
              Estimate a meal from a photo or a few words. Logging, search, and everything else work without it.
            </Text>
          </View>
        </View>
        <View className="gap-3">
          <ChoiceCard
            icon="key"
            title="Use my Google key"
            detail="No Eatlog charge. Google sets limits and billing."
            onPress={onUseKey}
            disabled={busy}
            emphasis="high"
          />
          {serviceConfig.availability.hostedGemini ? (
            <ChoiceCard
              icon="auto-awesome"
              title="Eatlog AI"
              detail={`With ${PAID_PLAN_NAME}, a one-time purchase. Hosted fair use applies.`}
              onPress={onEatlogAi}
              disabled={busy}
              emphasis="low"
            />
          ) : null}
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
            <View accessibilityLiveRegion="assertive" className="flex-row items-start justify-center gap-2 px-2">
              <MaterialIcons name="error-outline" size={18} color={M3.error} style={{ marginTop: 1 }} />
              <Text className="min-w-0 shrink text-sm font-medium text-m3-error">{error}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </ResponsiveContent>
  );

  const bar = topBar ? <FlowTopBar {...topBar} disabled={busy} /> : null;
  if (!scrollable) {
    return (
      <View className="flex-1">
        {bar}
        {body}
      </View>
    );
  }
  return (
    <View className="flex-1">
      {bar}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: horizontalPadding, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>
    </View>
  );
}
