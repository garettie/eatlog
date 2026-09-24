import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ProfileSettingRow from '../components/ProfileSettingRow';
import ResponsiveContent from '../components/ResponsiveContent';
import SegmentedControl from '../components/SegmentedControl';
import { useAiSetup } from '../context/AiSetupContext';
import { useEntitlement } from '../context/EntitlementContext';
import { tierOf, type AiRoute } from '../services/userApiKey';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';

const ROUTE_OPTIONS: { value: AiRoute; label: string }[] = [
  { value: 'eatlog-ai', label: 'Eatlog AI' },
  { value: 'my-key', label: 'My key' },
];

const TIER_DETAIL = {
  itik: 'Itik. Eatlog AI is included.',
  manok: 'Manok. Free estimates on your own Google key.',
  pugo: 'Pugo. Add a Google key for free estimates, or get Itik.',
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="px-1 text-sm font-semibold text-m3-on-surface-variant">{title}</Text>
      <View className="overflow-hidden rounded-2xl bg-m3-surface-container-low">{children}</View>
    </View>
  );
}

export function AiEstimatesScreen() {
  const { horizontalPadding } = useResponsiveLayout();
  const { hasPaidFeatures } = useEntitlement();
  const { keyState, openKeySetup, removeKey, setRoute } = useAiSetup();
  const [removing, setRemoving] = useState(false);
  const tier = tierOf(hasPaidFeatures, keyState.hasKey);

  const changeRoute = useCallback((route: AiRoute) => {
    setRoute(route).catch(() => {
      Alert.alert("Couldn't switch", 'Estimates still use the previous choice. Try again.');
    });
  }, [setRoute]);

  const remove = useCallback(async () => {
    setRemoving(true);
    try {
      await removeKey();
    } catch {
      // The store refused, so the key and its consent are still saved and still in use.
      Alert.alert("Couldn't remove the key", 'Your key is still saved and in use.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Try again', onPress: () => { void remove(); } },
      ]);
    } finally {
      setRemoving(false);
    }
  }, [removeKey]);

  const confirmRemove = useCallback(() => {
    Alert.alert(
      'Remove your key?',
      hasPaidFeatures
        ? 'Estimates go back to Eatlog AI.'
        : 'AI estimates stop until you add a key or get Itik. Your meals stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => { void remove(); } },
      ],
    );
  }, [hasPaidFeatures, remove]);

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-m3-surface">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContent className="gap-8" maxWidth={FORM_MAX_WIDTH}>
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">AI estimates</Text>
            <Text className="text-sm text-m3-on-surface-variant">{TIER_DETAIL[tier]}</Text>
          </View>

          {hasPaidFeatures && keyState.hasKey ? (
            <View className="gap-3">
              <Text className="px-1 text-sm font-semibold text-m3-on-surface-variant">Estimates use</Text>
              <SegmentedControl
                options={ROUTE_OPTIONS}
                value={keyState.route}
                onChange={changeRoute}
                accessibilityLabel="Who funds your estimates"
              />
            </View>
          ) : null}

          <Section title="Google key">
            {keyState.hasKey ? (
              <>
                <ProfileSettingRow
                  icon="key"
                  title="Saved key"
                  detail={keyState.keyHint ?? "Saved, but this phone couldn't read it. Replace it."}
                />
                <ProfileSettingRow
                  icon="swap-horiz"
                  title="Replace key"
                  detail="Use a different key from Google AI Studio"
                  onPress={() => { void openKeySetup('replace'); }}
                />
                <ProfileSettingRow
                  icon="delete-outline"
                  title="Remove key"
                  detail={removing ? 'Removing…' : 'Erase it from this phone'}
                  onPress={removing ? undefined : confirmRemove}
                  disabled={removing}
                  tone="destructive"
                  showDivider={false}
                />
              </>
            ) : (
              <ProfileSettingRow
                icon="key"
                title="Add a Google key"
                detail="Free AI estimates with Manok"
                onPress={() => { void openKeySetup('add'); }}
                showDivider={false}
              />
            )}
          </Section>
        </ResponsiveContent>
      </ScrollView>
    </SafeAreaView>
  );
}
