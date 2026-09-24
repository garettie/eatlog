import React from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { serviceConfig } from '../config/services';
import ResponsiveContent from './ResponsiveContent';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';
import { M3 } from '../theme/tokens';

const REMOTE_ESTIMATE_CONSENT_TITLE = 'Use Eatlog AI?';
const REMOTE_ESTIMATE_CONSENT_MESSAGE = 'Your diary stays on this phone. When you ask for a hosted estimate, the selected photo, title, description, or re-estimate details go through Eatlog to Google Gemini. Eatlog uses an installation ID, purchase status, IP address, and request usage to control access and fair use. Hosted estimates have rolling limits of 30 in 24 hours and 250 in 30 days.';

export interface RemoteEstimateConsentContentProps {
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
  scrollable?: boolean;
}

function ConsentActions({
  onAccept,
  onDecline,
  busy,
  error,
}: Pick<RemoteEstimateConsentContentProps, 'onAccept' | 'onDecline' | 'busy' | 'error'>) {
  const privacyUrl = serviceConfig.publicLinks.privacyPolicyUrl;

  return (
    <View className="gap-3">
      <Pressable
        onPress={() => { void onAccept(); }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Allow Eatlog AI estimates"
        accessibilityHint="Allows selected meal details to go through Eatlog to Google when you request a hosted estimate"
        accessibilityState={{ busy: !!busy, disabled: !!busy }}
        className={`min-h-[52px] flex-row items-center justify-center gap-2 rounded-full bg-m3-primary px-5 active:opacity-90 ${busy ? 'opacity-50' : ''}`}
      >
        {busy ? <ActivityIndicator color={M3.onPrimary} /> : <MaterialIcons name="auto-awesome" size={18} color={M3.onPrimary} />}
        <Text className="text-base font-bold text-m3-on-primary">Allow Eatlog AI</Text>
      </Pressable>
      <Pressable
        onPress={() => { void onDecline(); }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Not now. Keep Eatlog AI off."
        accessibilityHint="Keeps local features and My key available"
        accessibilityState={{ disabled: !!busy }}
        className={`min-h-[48px] items-center justify-center px-5 active:opacity-60 ${busy ? 'opacity-50' : ''}`}
      >
        <Text className="text-base font-semibold text-m3-on-surface-variant">Not now</Text>
      </Pressable>
      {privacyUrl ? (
        <Pressable
          onPress={() => { void Linking.openURL(privacyUrl).catch(() => undefined); }}
          accessibilityRole="link"
          accessibilityLabel="Privacy policy"
          accessibilityHint="Opens the Eatlog privacy policy in your browser"
          className="min-h-[48px] items-center justify-center px-5 active:opacity-60"
        >
          <Text className="text-sm font-semibold text-m3-on-surface-variant underline">Privacy</Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text
          accessibilityLiveRegion="assertive"
          className="rounded-xl bg-m3-error-container px-4 py-3 text-sm text-m3-on-error-container"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export default function RemoteEstimateConsentContent({
  onAccept,
  onDecline,
  busy = false,
  error = null,
  scrollable = false,
}: RemoteEstimateConsentContentProps) {
  const { horizontalPadding } = useResponsiveLayout();
  const body = (
    <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="flex-1">
      <View className="flex-1 justify-center gap-7 py-8">
        <View className="items-center gap-5">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-m3-surface-container-high border border-m3-outline-variant/50">
            <MaterialIcons name="auto-awesome" size={30} color={M3.primary} />
          </View>
          <Text accessibilityRole="header" className="text-center text-2xl font-bold text-m3-on-surface">
            {REMOTE_ESTIMATE_CONSENT_TITLE}
          </Text>
          <Text className="text-center text-base leading-6 text-m3-on-surface-variant">
            {REMOTE_ESTIMATE_CONSENT_MESSAGE}
          </Text>
        </View>
        <ConsentActions onAccept={onAccept} onDecline={onDecline} busy={busy} error={error} />
      </View>
    </ResponsiveContent>
  );

  if (scrollable) {
    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: horizontalPadding, paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {body}
      </ScrollView>
    );
  }

  return <View className="flex-1">{body}</View>;
}
