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

function accessDetail(access: ReturnType<typeof useEntitlement>['access']): string {
  if (access.kind === 'manok-trial' || access.kind === 'manok') {
    if (access.billingState === 'grace') return 'Payment issue · Access remains available during the grace period';
    if (!access.expiresAt) return 'Paid access is active';
    return access.willRenew ? `Renews ${dateLabel(access.expiresAt)}` : `Ends ${dateLabel(access.expiresAt)}`;
  }
  if (access.kind === 'itik') {
    return `Lifetime access${access.purchasedAt ? ` · Purchased ${dateLabel(access.purchasedAt)}` : ''}`;
  }
  if (access.kind === 'complimentary') return `Available until ${dateLabel(access.expiresAt)}`;
  if (access.reason === 'expired') return 'Paid access ended · Your local data is unchanged';
  if (access.reason === 'revoked') return 'Paid access was removed · Your local data is unchanged';
  if (access.reason === 'malformed') return "Paid status couldn't be verified · Refresh or restore purchases";
  if (access.reason === 'unavailable') return "Paid status couldn't be checked · Local logging still works";
  return 'Free · Local logging and on-device data';
}

interface PlanOptionProps {
  title: string;
  badge: string;
  price: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  selected: boolean;
  disabled?: boolean;
  onPress(): void;
}

function PlanOption({ title, badge, price, description, icon, selected, disabled, onPress }: PlanOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={`${title}. ${price}. ${description}`}
      accessibilityState={{ selected, disabled: !!disabled }}
      className={`rounded-2xl border px-4 py-4 ${selected ? 'border-white bg-m3-surface-container-high' : 'border-m3-outline-variant bg-m3-surface-container'}`}
    >
      <View className="flex-row items-start gap-3">
        <View className={`h-11 w-11 items-center justify-center rounded-full ${selected ? 'bg-m3-primary' : 'bg-m3-surface-container-highest'}`}>
          <MaterialIcons name={icon} size={21} color={selected ? M3.onPrimary : M3.onSurface} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-base font-bold text-m3-on-surface">{title}</Text>
            <View className="rounded-full bg-m3-primary-container px-2.5 py-1">
              <Text className="text-xs font-semibold text-m3-on-primary-container">{badge}</Text>
            </View>
          </View>
          <Text className="text-lg font-bold text-m3-on-surface">{price}</Text>
          <Text className="text-sm text-m3-on-surface-variant">{description}</Text>
        </View>
        <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={M3.onSurface} />
      </View>
    </Pressable>
  );
}

function ComparisonRow({ label, pugo, manok, itik }: { label: string; pugo: string; manok: string; itik: string }) {
  return (
    <View className="flex-row items-center border-t border-m3-outline-variant px-3 py-3" accessible accessibilityLabel={`${label}. Pugo: ${pugo}. Manok: ${manok}. Itik: ${itik}.`}>
      <Text className="w-[92px] pr-2 text-xs font-semibold text-m3-on-surface-variant">{label}</Text>
      <Text className="flex-1 text-center text-xs text-m3-on-surface">{pugo}</Text>
      <Text className="flex-1 text-center text-xs font-semibold text-m3-on-surface">{manok}</Text>
      <Text className="flex-1 text-center text-xs font-semibold text-m3-on-surface">{itik}</Text>
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

  const retryPlans = useCallback(() => {
    if (refreshing) return;
    setMessage(null);
    void refresh().catch(() => {
      setMessage("Couldn't refresh plans. Local logging still works.");
    });
  }, [refresh, refreshing]);

  const selectedTier = access.kind === 'itik' ? 'itik' : selected;
  const selectedProduct = selectedTier === 'manok' ? offering?.manok : offering?.itik;
  const manokActive = access.kind === 'manok' || access.kind === 'manok-trial';
  const selectedIsActive = selectedTier === 'itik' ? access.kind === 'itik' : manokActive;
  const itikBlocked = selectedTier === 'itik' && !canBuyItik(access);
  const storeDetailsMissing = !loadingProducts && (!offering?.manok || !offering?.itik);
  const purchaseDisabled = busy !== null
    || refreshing
    || loadingProducts
    || access.kind === 'itik'
    || selectedIsActive
    || itikBlocked;
  const purchaseTitle = selectedIsActive
    ? `${selectedTier === 'manok' ? 'Eatlog Manok' : 'Eatlog Itik'} active`
    : itikBlocked
      ? 'Cancel Manok before Itik'
      : loadingProducts
        ? 'Loading store price…'
        : !selectedProduct
          ? 'Retry plans'
          : selectedTier === 'manok'
            ? offering?.manok?.trialEligible
              ? 'Start 1-month trial'
              : `Choose Manok · ${selectedProduct.priceString}`
            : `Get lifetime · ${selectedProduct.priceString}`;
  const manokPrice = offering?.manok
    ? `${offering.manok.priceString} / month`
    : loadingProducts ? 'Loading store price…' : 'Monthly · Store price unavailable';
  const manokDescription = offering?.manok?.trialEligible
    ? `1 month free, then ${offering.manok.priceString} monthly`
    : '1-month trial for eligible users · Renews monthly';
  const itikPrice = offering?.itik?.priceString
    ?? (loadingProducts ? 'Loading store price…' : 'One time · Store price unavailable');

  const handlePrimaryAction = useCallback(() => {
    if (!selectedProduct) {
      retryPlans();
      return;
    }
    void run('purchase', () => purchase(selectedTier));
  }, [purchase, retryPlans, run, selectedProduct, selectedTier]);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <ResponsiveContent maxWidth={Math.min(APP_MAX_WIDTH, 600)} className="gap-6">
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-1">
            <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">Choose your Eatlog plan</Text>
            <Text className="text-sm text-m3-on-surface-variant">Logging, targets, and backups stay free.</Text>
          </View>
          {onClose ? (
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close plans" className="h-12 w-12 items-center justify-center rounded-full active:bg-m3-surface-container-high">
              <MaterialIcons name="close" size={24} color={M3.onSurface} />
            </Pressable>
          ) : null}
        </View>

        <View className="flex-row items-center gap-3 rounded-2xl bg-m3-surface-container px-4 py-4">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-m3-surface-container-highest">
            <MaterialIcons name="workspace-premium" size={22} color={M3.onSurface} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-xs font-semibold text-m3-on-surface-variant">Current plan</Text>
            <Text className="text-base font-bold text-m3-on-surface">{accessName(access.kind)}</Text>
            <Text className="text-sm text-m3-on-surface-variant">{accessDetail(access)}</Text>
          </View>
        </View>

        <View className="gap-3">
          <View className="gap-1">
            <Text accessibilityRole="header" className="text-lg font-bold text-m3-on-surface">Paid plans</Text>
            <Text className="text-sm text-m3-on-surface-variant">Manok and Itik unlock the same features. Choose how you pay.</Text>
          </View>
          {loadingProducts ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
              <Text className="text-sm text-m3-on-surface-variant">Loading store prices…</Text>
            </View>
          ) : null}
          <PlanOption
            title="Eatlog Manok"
            badge={access.kind === 'manok-trial' ? 'Trial active' : access.kind === 'manok' ? 'Current' : '1-month trial*'}
            price={manokPrice}
            description={manokDescription}
            icon="event-repeat"
            selected={selectedTier === 'manok'}
            disabled={access.kind === 'itik'}
            onPress={() => setSelected('manok')}
          />
          <PlanOption
            title="Eatlog Itik"
            badge={access.kind === 'itik' ? 'Current' : 'Pay once'}
            price={itikPrice}
            description="One payment · Lifetime access · No renewal"
            icon="all-inclusive"
            selected={selectedTier === 'itik'}
            disabled={access.kind === 'itik'}
            onPress={() => setSelected('itik')}
          />
          <Text className="text-xs text-m3-on-surface-variant">*Free for eligible users. The store confirms eligibility before purchase.</Text>
        </View>

        {storeDetailsMissing ? (
          <View accessibilityRole="alert" className="flex-row gap-3 rounded-2xl border border-m3-outline-variant bg-m3-surface-container px-4 py-4">
            <MaterialIcons name="cloud-off" size={21} color={M3.error} />
            <View className="flex-1 gap-1">
              <Text className="text-base font-bold text-m3-on-surface">Store connection unavailable</Text>
              <Text className="text-sm text-m3-on-surface-variant">Prices and checkout couldn't load. You can still compare plans.</Text>
            </View>
          </View>
        ) : null}

        {access.kind !== 'itik' ? (
          <PrimaryButton
            title={busy === 'purchase' ? 'Waiting for store…' : refreshing && !selectedProduct ? 'Retrying plans…' : purchaseTitle}
            disabled={purchaseDisabled}
            loading={loadingProducts || busy === 'purchase' || refreshing && !selectedProduct}
            onPress={handlePrimaryAction}
          />
        ) : null}
        {itikBlocked ? <Text className="text-sm text-m3-on-surface-variant">Cancel Manok before buying Itik. The store won't refund unused Manok time.</Text> : null}
        {message ? <Text accessibilityLiveRegion="polite" className="rounded-2xl bg-m3-surface-container px-4 py-3 text-sm text-m3-on-surface">{message}</Text> : null}

        <View className="gap-3">
          <Text accessibilityRole="header" className="text-lg font-bold text-m3-on-surface">Compare plans</Text>
          <View className="overflow-hidden rounded-2xl border border-m3-outline-variant bg-m3-surface-container">
            <View className="flex-row items-center px-3 py-3">
              <View className="w-[92px]" />
              <Text className="flex-1 text-center text-xs font-semibold text-m3-on-surface-variant">Pugo</Text>
              <Text className="flex-1 text-center text-xs font-semibold text-m3-on-surface">Manok</Text>
              <Text className="flex-1 text-center text-xs font-semibold text-m3-on-surface">Itik</Text>
            </View>
            <ComparisonRow label="Local logging" pugo="Yes" manok="Yes" itik="Yes" />
            <ComparisonRow label="AI estimates" pugo="—" manok="Yes" itik="Yes" />
            <ComparisonRow label="Adaptive plan" pugo="—" manok="Yes" itik="Yes" />
            <ComparisonRow label="Billing" pugo="Free" manok="Monthly" itik="Once" />
            <ComparisonRow label="Trial" pugo="—" manok="1 month*" itik="—" />
          </View>
        </View>

        <View className="gap-3">
          <Text accessibilityRole="header" className="text-lg font-bold text-m3-on-surface">AI limits</Text>
          <View className="gap-4 rounded-2xl bg-m3-surface-container px-4 py-4">
            <View className="flex-row gap-3">
              <MaterialIcons name="hourglass-top" size={20} color={M3.onSurface} />
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-m3-on-surface">Manok trial</Text>
                <Text className="text-sm text-m3-on-surface-variant">5 estimates and 5 clarifications every 24 hours, up to 30 each during the trial.</Text>
              </View>
            </View>
            <View className="h-px bg-m3-outline-variant" />
            <View className="flex-row gap-3">
              <MaterialIcons name="bolt" size={20} color={M3.onSurface} />
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-m3-on-surface">Paid access</Text>
                <Text className="text-sm text-m3-on-surface-variant">Up to 30 AI actions every 24 hours and 250 every 30 days.</Text>
              </View>
            </View>
          </View>
        </View>

        {usage.kind === 'trial' ? (
          <View className="gap-2 rounded-2xl bg-m3-surface-container px-4 py-4">
            <Text className="text-base font-bold text-m3-on-surface">Trial AI remaining</Text>
            <Text className="text-sm tabular-nums text-m3-on-surface-variant">Estimates: {usage.initialRemaining24Hours}/5 now · {usage.initialRemainingTrial}/30 trial</Text>
            <Text className="text-sm tabular-nums text-m3-on-surface-variant">Clarifications: {usage.clarificationRemaining24Hours}/5 now · {usage.clarificationRemainingTrial}/30 trial</Text>
          </View>
        ) : usage.kind === 'paid' && (usage.remaining24Hours <= 5 || usage.remaining30Days <= 25) ? (
          <View className="gap-1 rounded-2xl bg-m3-surface-container px-4 py-4">
            <Text className="text-base font-bold text-m3-on-surface">AI remaining</Text>
            <Text className="text-sm tabular-nums text-m3-on-surface-variant">{usage.remaining24Hours} in 24 hours · {usage.remaining30Days} in 30 days</Text>
          </View>
        ) : null}

        <View className="gap-3 border-t border-m3-outline-variant pt-5">
          {(access.kind === 'manok' || access.kind === 'manok-trial') ? (
            <Pressable onPress={() => { void run('manage', manageSubscription); }} disabled={busy !== null} accessibilityRole="button" accessibilityState={{ disabled: busy !== null }} className="min-h-[48px] items-center justify-center rounded-full border border-m3-outline">
              <Text className="text-sm font-semibold text-m3-on-surface">{busy === 'manage' ? 'Opening store…' : 'Manage subscription'}</Text>
            </Pressable>
          ) : null}
          <View className="flex-row gap-3">
            <Pressable onPress={() => { void run('restore', restore); }} disabled={busy !== null} accessibilityRole="button" accessibilityState={{ disabled: busy !== null }} className="min-h-[48px] flex-1 items-center justify-center rounded-full border border-m3-outline px-3">
              <Text className="text-center text-sm font-semibold text-m3-on-surface">{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
            </Pressable>
            <Pressable onPress={retryPlans} disabled={refreshing || busy !== null} accessibilityRole="button" accessibilityState={{ disabled: refreshing || busy !== null, busy: refreshing }} className="min-h-[48px] flex-1 items-center justify-center rounded-full border border-m3-outline px-3">
              <Text className="text-center text-sm font-semibold text-m3-on-surface">{refreshing ? 'Refreshing…' : 'Refresh plan'}</Text>
            </Pressable>
          </View>
        </View>

        <View className="gap-3 rounded-2xl bg-m3-surface-container px-4 py-4">
          <View className="flex-row items-center gap-3">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-xs font-semibold text-m3-on-surface-variant">Support ID</Text>
              <Text selectable numberOfLines={1} ellipsizeMode="middle" className="text-sm tabular-nums text-m3-on-surface">{supportId ?? 'Unavailable on this build'}</Text>
            </View>
            <Pressable onPress={() => { void copySupportId(); }} disabled={!supportId || busy !== null} accessibilityRole="button" accessibilityState={{ disabled: !supportId || busy !== null }} className="min-h-[48px] justify-center rounded-full px-3">
              <Text className="text-sm font-semibold text-m3-on-surface">{busy === 'copy' ? 'Copying…' : 'Copy'}</Text>
            </Pressable>
          </View>
          {access.kind === 'complimentary' ? <Text className="text-sm text-m3-on-surface-variant">Complimentary access has no store subscription. Restore purchases remains available.</Text> : null}
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
