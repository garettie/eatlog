import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import PrimaryButton from '../components/PrimaryButton';
import ResponsiveContent from '../components/ResponsiveContent';
import { useEntitlement } from '../context/EntitlementContext';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { serviceConfig } from '../config/services';
import { canBuyItik } from '../services/billing.types';
import { APP_MAX_WIDTH } from '../theme/layout';
import { M3 } from '../theme/tokens';

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function accessName(kind: ReturnType<typeof useEntitlement>['access']['kind']): string {
  if (kind === 'manok-trial') return 'Eatlog Manok trial';
  if (kind === 'manok') return 'Eatlog Manok';
  if (kind === 'itik') return 'Eatlog Itik';
  if (kind === 'complimentary') return 'Complimentary access';
  return 'Eatlog Pugo';
}

function Feature({ icon, children }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; children: string }) {
  return (
    <View className="min-h-[36px] flex-row items-center gap-3">
      <MaterialIcons name={icon} size={20} color={M3.onSurface} />
      <Text className="flex-1 text-sm text-m3-on-surface">{children}</Text>
    </View>
  );
}

function PlanContent({ onClose }: { onClose?: () => void }) {
  const {
    access, offering, usage, supportId, loadingProducts, refreshing,
    refresh, purchase, restore, manageSubscription,
  } = useEntitlement();
  const [selected, setSelected] = useState<'manok' | 'itik'>('manok');
  const [busy, setBusy] = useState<'purchase' | 'restore' | 'manage' | 'copy' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(async (kind: typeof busy, action: () => Promise<{ message: string }>) => {
    if (busy) return;
    setBusy(kind);
    setMessage(null);
    try { setMessage((await action()).message); }
    finally { setBusy(null); }
  }, [busy]);

  const openLink = useCallback((url: string | null) => {
    if (url) void Linking.openURL(url);
  }, []);

  const copySupportId = useCallback(async () => {
    if (!supportId || busy) return;
    setBusy('copy');
    try {
      await Clipboard.setStringAsync(supportId);
      setMessage('Support ID copied.');
    } catch {
      setMessage("Couldn't copy the Support ID. Press and hold it to copy manually.");
    } finally {
      setBusy(null);
    }
  }, [busy, supportId]);

  const selectedProduct = selected === 'manok' ? offering?.manok : offering?.itik;
  const itikBlocked = selected === 'itik' && !canBuyItik(access);
  const purchaseDisabled = busy !== null || !selectedProduct || access.kind === 'itik' || itikBlocked;
  const purchaseTitle = access.kind === 'itik'
    ? 'Eatlog Itik active'
    : itikBlocked
      ? 'Cancel Manok before Itik'
      : selected === 'manok'
        ? offering?.manok?.trialEligible ? 'Start Manok trial' : `Choose Manok${offering?.manok ? ` · ${offering.manok.priceString}` : ''}`
        : `Pay once${offering?.itik ? ` · ${offering.itik.priceString}` : ''}`;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <ResponsiveContent maxWidth={Math.min(APP_MAX_WIDTH, 600)} className="gap-6">
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-1">
            <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">Choose your Eatlog plan</Text>
            <Text className="text-sm text-m3-on-surface-variant">Logging and your data stay free with Eatlog Pugo.</Text>
          </View>
          {onClose ? (
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close plans" className="h-12 w-12 items-center justify-center rounded-full active:bg-m3-surface-container-high">
              <MaterialIcons name="close" size={24} color={M3.onSurface} />
            </Pressable>
          ) : null}
        </View>

        <View className="rounded-2xl bg-m3-surface-container px-5 py-4 gap-1">
          <Text className="text-xs font-semibold text-m3-on-surface-variant">Current plan</Text>
          <Text className="text-lg font-bold text-m3-on-surface">{accessName(access.kind)}</Text>
          {access.kind === 'manok-trial' || access.kind === 'manok' ? (
            <Text className="text-sm text-m3-on-surface-variant">
              {access.billingState === 'grace' ? 'Billing grace period' : access.willRenew ? `Renews ${dateLabel(access.expiresAt!)}` : `Ends ${dateLabel(access.expiresAt!)}`}
            </Text>
          ) : access.kind === 'itik' ? (
            <Text className="text-sm text-m3-on-surface-variant">Lifetime{access.purchasedAt ? ` · ${dateLabel(access.purchasedAt)}` : ''}</Text>
          ) : access.kind === 'complimentary' ? (
            <Text className="text-sm text-m3-on-surface-variant">Until {dateLabel(access.expiresAt)}</Text>
          ) : null}
        </View>

        <View className="gap-2">
          <Feature icon="photo-camera">AI estimates from photos and descriptions</Feature>
          <Feature icon="auto-graph">Adaptive recommendations from your logs</Feature>
          <Feature icon="lock-outline">Your logs, targets, and backups stay on your device</Feature>
        </View>

        {access.kind !== 'itik' ? (
          loadingProducts ? (
            <View className="min-h-[112px] items-center justify-center gap-3 rounded-2xl bg-m3-surface-container">
              <ActivityIndicator color={M3.onSurfaceVariant} />
              <Text className="text-sm text-m3-on-surface-variant">Loading plans…</Text>
            </View>
          ) : offering?.manok || offering?.itik ? (
            <View className="gap-3">
              {offering.manok ? (
                <Pressable
                  onPress={() => setSelected('manok')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selected === 'manok' }}
                  className={`min-h-[88px] rounded-2xl border px-5 py-4 ${selected === 'manok' ? 'border-white bg-m3-surface-container-high' : 'border-m3-outline-variant bg-m3-surface-container'}`}
                >
                  <View className="flex-row justify-between gap-4">
                    <View className="flex-1 gap-1"><Text className="text-base font-bold text-m3-on-surface">Eatlog Manok</Text><Text className="text-sm text-m3-on-surface-variant">{offering.manok.priceString} per month · Renews until canceled</Text></View>
                    <MaterialIcons name={selected === 'manok' ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={M3.onSurface} />
                  </View>
                  {offering.manok.trialEligible ? <Text className="mt-2 text-sm font-semibold text-m3-on-surface">One month free, then {offering.manok.priceString} per month. Eligibility shown by the store.</Text> : null}
                </Pressable>
              ) : null}
              {offering.itik ? (
                <Pressable
                  onPress={() => setSelected('itik')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selected === 'itik' }}
                  className={`min-h-[88px] rounded-2xl border px-5 py-4 ${selected === 'itik' ? 'border-white bg-m3-surface-container-high' : 'border-m3-outline-variant bg-m3-surface-container'}`}
                >
                  <View className="flex-row justify-between gap-4"><View className="flex-1 gap-1"><Text className="text-base font-bold text-m3-on-surface">Eatlog Itik</Text><Text className="text-sm text-m3-on-surface-variant">{offering.itik.priceString} once · No renewal</Text></View><MaterialIcons name={selected === 'itik' ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={M3.onSurface} /></View>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View className="rounded-2xl bg-m3-surface-container px-5 py-4 gap-2">
              <Text className="text-base font-bold text-m3-on-surface">Plans unavailable</Text>
              <Text className="text-sm text-m3-on-surface-variant">Plans aren't available right now. Eatlog Pugo still works.</Text>
            </View>
          )
        ) : null}

        {offering?.manok?.trialEligible && selected === 'manok' && access.kind === 'pugo' ? (
          <Text className="text-sm text-m3-on-surface-variant">Trial limits: 5 estimates and 5 clarifications every 24 hours, up to 30 each during the trial.</Text>
        ) : null}
        <Text className="text-sm text-m3-on-surface-variant">No weekly limit · Up to 30 AI actions every 24 hours and 250 every 30 days.</Text>

        {usage.kind === 'trial' ? (
          <View className="rounded-2xl bg-m3-surface-container px-5 py-4 gap-2">
            <Text className="text-base font-bold text-m3-on-surface">Trial AI remaining</Text>
            <Text className="text-sm tabular-nums text-m3-on-surface-variant">Initial estimates: {usage.initialRemaining24Hours}/5 now · {usage.initialRemainingTrial}/30 trial</Text>
            <Text className="text-sm tabular-nums text-m3-on-surface-variant">Clarifications: {usage.clarificationRemaining24Hours}/5 now · {usage.clarificationRemainingTrial}/30 trial</Text>
          </View>
        ) : usage.kind === 'paid' && (usage.remaining24Hours <= 5 || usage.remaining30Days <= 25) ? (
          <View className="rounded-2xl bg-m3-surface-container px-5 py-4 gap-1"><Text className="text-base font-bold text-m3-on-surface">Fair-use status</Text><Text className="text-sm tabular-nums text-m3-on-surface-variant">{usage.remaining24Hours} left in 24 hours · {usage.remaining30Days} left in 30 days</Text></View>
        ) : null}

        {access.kind !== 'itik' ? (
          <PrimaryButton title={busy === 'purchase' ? 'Waiting for store…' : purchaseTitle} disabled={purchaseDisabled} onPress={() => { void run('purchase', () => purchase(selected)); }} />
        ) : null}
        {itikBlocked ? <Text className="text-sm text-m3-on-surface-variant">Cancel Manok before buying Itik. The store won't refund unused Manok time.</Text> : null}
        {message ? <Text accessibilityLiveRegion="polite" className="text-sm text-m3-on-surface">{message}</Text> : null}

        <View className="gap-1 border-t border-m3-outline-variant/50 pt-3">
          {(access.kind === 'manok' || access.kind === 'manok-trial') ? <Pressable onPress={() => { void run('manage', manageSubscription); }} className="min-h-[48px] justify-center"><Text className="text-center text-sm font-semibold text-m3-on-surface">Manage subscription</Text></Pressable> : null}
          <Pressable onPress={() => { void run('restore', restore); }} className="min-h-[48px] justify-center"><Text className="text-center text-sm font-semibold text-m3-on-surface">Restore purchases</Text></Pressable>
          <Pressable onPress={() => { void refresh(); }} disabled={refreshing} className="min-h-[48px] justify-center"><Text className="text-center text-sm font-semibold text-m3-on-surface">{refreshing ? 'Refreshing plan…' : 'Refresh plan'}</Text></Pressable>
        </View>

        <View className="gap-2 rounded-2xl bg-m3-surface-container px-5 py-4">
          <Text className="text-xs font-semibold text-m3-on-surface-variant">Support ID</Text>
          <Text selectable className="text-sm tabular-nums text-m3-on-surface">{supportId ?? 'Unavailable on this build'}</Text>
          <Pressable onPress={() => { void copySupportId(); }} disabled={!supportId || busy !== null} className="min-h-[48px] self-start justify-center"><Text className="text-sm font-semibold text-m3-on-surface">{busy === 'copy' ? 'Copying…' : 'Copy Support ID'}</Text></Pressable>
          {access.kind === 'complimentary' ? <Text className="text-sm text-m3-on-surface-variant">Complimentary access has no store subscription. Restore remains available for any Manok or Itik purchase.</Text> : null}
        </View>

        <View className="flex-row flex-wrap justify-center gap-4">
          <Pressable accessibilityRole="link" accessibilityLabel="Open Terms of Use" onPress={() => openLink(serviceConfig.publicLinks.termsUrl)} disabled={!serviceConfig.publicLinks.termsUrl} className="min-h-[48px] justify-center"><Text className={`text-sm font-semibold ${serviceConfig.publicLinks.termsUrl ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>Terms of Use</Text></Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel="Open Privacy Policy" onPress={() => openLink(serviceConfig.publicLinks.privacyPolicyUrl)} disabled={!serviceConfig.publicLinks.privacyPolicyUrl} className="min-h-[48px] justify-center"><Text className={`text-sm font-semibold ${serviceConfig.publicLinks.privacyPolicyUrl ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>Privacy Policy</Text></Pressable>
        </View>
      </ResponsiveContent>
    </ScrollView>
  );
}

export function ProfileSubscriptionPlanScreen() {
  return <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-m3-surface"><PlanContent /></SafeAreaView>;
}

export default function PaywallScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Paywall'>) {
  return <SafeAreaView className="flex-1 bg-m3-surface" accessibilityViewIsModal><PlanContent onClose={() => navigation.goBack()} /></SafeAreaView>;
}
