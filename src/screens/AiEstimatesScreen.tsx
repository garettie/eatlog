import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import ProfileSettingRow from '../components/ProfileSettingRow';
import ResponsiveContent from '../components/ResponsiveContent';
import SegmentedControl from '../components/SegmentedControl';
import { useAiSetup } from '../context/AiSetupContext';
import { useEntitlement } from '../context/EntitlementContext';
import { tierOf, type AiRoute, type Tier } from '../services/userApiKey';
import { PAID_PLAN_NAME, planName } from '../services/tierNames';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';
import { M3 } from '../theme/tokens';

const ROUTE_OPTIONS: { value: AiRoute; label: string }[] = [
  { value: 'eatlog-ai', label: 'Eatlog AI' },
  { value: 'my-key', label: 'My key' },
];

/** What estimates run on right now, said once at the top of the screen. */
function statusOf(tier: Tier, route: AiRoute): { icon: 'key' | 'auto-awesome'; title: string; detail: string } {
  if (tier === 'pugo') {
    return { icon: 'auto-awesome', title: 'AI estimates are off', detail: `Add a Google key for free estimates, or get ${PAID_PLAN_NAME}.` };
  }
  if (tier === 'manok') {
    return { icon: 'key', title: 'Using your Google key', detail: 'Free. Estimates go from this phone to Google.' };
  }
  return route === 'my-key'
    ? { icon: 'key', title: 'Using your Google key', detail: `Eatlog AI is also included with ${planName('itik')}.` }
    : { icon: 'auto-awesome', title: 'Using Eatlog AI', detail: `Included with ${planName('itik')}.` };
}

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
  const navigation = useNavigation<any>();
  const { hasItik } = useEntitlement();
  const { keyState, openKeySetup, removeKey, setRoute } = useAiSetup();
  const [removing, setRemoving] = useState(false);
  const tier = tierOf(hasItik, keyState.hasKey);
  const status = statusOf(tier, keyState.route);

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
      hasItik
        ? 'Estimates go back to Eatlog AI.'
        : `AI estimates stop until you add a key or get ${PAID_PLAN_NAME}. Your meals stay.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => { void remove(); } },
      ],
    );
  }, [hasItik, remove]);

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-m3-surface">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContent className="gap-8" maxWidth={FORM_MAX_WIDTH}>
          <View
            accessible
            accessibilityLabel={`${status.title}. ${status.detail}`}
            className="flex-row items-center gap-4 rounded-3xl bg-m3-surface-container-high p-5"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-m3-surface-container-highest">
              <MaterialIcons
                name={status.icon}
                size={24}
                color={tier === 'pugo' ? M3.onSurfaceVariant : M3.primary}
              />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-lg font-bold text-m3-on-surface">{status.title}</Text>
              <Text className="text-sm text-m3-on-surface-variant">{status.detail}</Text>
            </View>
          </View>

          {hasItik && keyState.hasKey ? (
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
                  detail="Use a different key"
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
                detail="Free AI estimates with your own key"
                onPress={() => { void openKeySetup('add'); }}
                showDivider={false}
              />
            )}
          </Section>

          {tier === 'pugo' ? (
            <Section title="Eatlog AI">
              <ProfileSettingRow
                icon="auto-awesome"
                title={`Get ${PAID_PLAN_NAME}`}
                detail="AI estimates with nothing to set up"
                onPress={() => navigation.navigate('SubscriptionPlan')}
                showDivider={false}
              />
            </Section>
          ) : null}
        </ResponsiveContent>
      </ScrollView>
    </SafeAreaView>
  );
}
