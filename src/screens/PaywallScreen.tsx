import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import ResponsiveContent from '../components/ResponsiveContent';
import TierBirdIcon, { type EatlogTier } from '../components/TierBirdIcon';
import { serviceConfig } from '../config/services';
import { useEntitlement } from '../context/EntitlementContext';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { canBuyItik } from '../services/billing.types';
import { APP_MAX_WIDTH } from '../theme/layout';
import { M3 } from '../theme/tokens';

type Access = ReturnType<typeof useEntitlement>['access'];

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function accessName(kind: Access['kind']): string {
  if (kind === 'manok-trial') return 'Manok trial';
  if (kind === 'manok') return 'Manok';
  if (kind === 'itik') return 'Itik';
  if (kind === 'complimentary') return 'Complimentary';
  return 'Pugo';
}

function accessTier(kind: Access['kind']): EatlogTier | null {
  if (kind === 'manok-trial' || kind === 'manok') return 'manok';
  if (kind === 'itik') return 'itik';
  if (kind === 'pugo') return 'pugo';
  return null;
}

function accessDetail(access: Access): string {
  if (access.kind === 'manok-trial' || access.kind === 'manok') {
    if (access.billingState === 'grace') return 'Payment needs attention. Your paid features still work for now.';
    if (!access.expiresAt) return 'Paid features are active.';
    return access.willRenew ? `Renews ${dateLabel(access.expiresAt)}` : `Ends ${dateLabel(access.expiresAt)}`;
  }
  if (access.kind === 'itik') {
    return `Yours for good${access.purchasedAt ? ` · Bought ${dateLabel(access.purchasedAt)}` : ''}`;
  }
  if (access.kind === 'complimentary') return `Available until ${dateLabel(access.expiresAt)}`;
  if (access.reason === 'expired') return 'Paid access ended. Your logbook is untouched.';
  if (access.reason === 'revoked') return 'Paid access was removed. Your logbook is untouched.';
  if (access.reason === 'malformed') return "We couldn't verify paid access. Restore or check again.";
  if (access.reason === 'unavailable') return "We couldn't check paid access. Local logging still works.";
  return 'Free for logging, targets, and your data.';
}

interface PlanOptionProps {
  tier: 'manok' | 'itik';
  title: string;
  cadence: string;
  badge?: string | null;
  price: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress(): void;
}

function PlanOption({ tier, title, cadence, badge, price, description, selected, disabled, onPress }: PlanOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={disabled ? { opacity: 0.48 } : undefined}
      accessibilityRole="radio"
      accessibilityLabel={`${title}. ${cadence}. ${price}. ${description}`}
      accessibilityHint="Selects this plan"
      accessibilityState={{ selected, disabled: !!disabled }}
      className={`rounded-2xl border p-4 active:opacity-80 ${selected ? 'border-m3-on-surface bg-m3-surface-container-high' : 'border-m3-outline-variant bg-m3-surface-container'}`}
    >
      <View className="flex-row items-start gap-3">
        <TierBirdIcon tier={tier} size={48} />
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-lg font-bold text-m3-on-surface">{title}</Text>
            {badge ? (
              <View className="rounded-full bg-m3-surface-container-highest px-2.5 py-1">
                <Text className="text-xs font-semibold text-m3-on-surface">{badge}</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs font-semibold text-m3-on-surface-variant">{cadence}</Text>
        </View>
        <MaterialIcons
          name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
          size={23}
          color={selected ? M3.onSurface : M3.onSurfaceVariant}
        />
      </View>
      <View className="mt-3 gap-1">
        <Text className="text-xl font-bold tabular-nums text-m3-on-surface">{price}</Text>
        <Text className="text-sm text-m3-on-surface-variant">{description}</Text>
      </View>
    </Pressable>
  );
}

function FeatureLine({ icon, children }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; children: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-8 w-8 items-center justify-center rounded-full bg-m3-surface-container-high">
        <MaterialIcons name={icon} size={17} color={M3.onSurface} />
      </View>
      <Text className="flex-1 text-sm text-m3-on-surface">{children}</Text>
    </View>
  );
}

function CurrentPlan({ access }: { access: Access }) {
  const tier = accessTier(access.kind);
  return (
    <Card className="flex-row items-center gap-3 p-4">
      {tier ? (
        <TierBirdIcon tier={tier} size={42} />
      ) : (
        <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-m3-surface-container-highest">
          <MaterialIcons name="redeem" size={20} color={M3.onSurface} />
        </View>
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-baseline gap-2">
          <Text className="text-xs font-semibold text-m3-on-surface-variant">Current plan</Text>
          <Text className="text-base font-bold text-m3-on-surface">{accessName(access.kind)}</Text>
        </View>
        <Text className="text-sm text-m3-on-surface-variant">{accessDetail(access)}</Text>
      </View>
    </Card>
  );
}

function PlanContent({ onClose }: { onClose?: () => void }) {
  const {
    access, offering, usage, supportId, loadingProducts, refreshing,
    refresh, purchase, restore, manageSubscription,
  } = useEntitlement();
  const [selected, setSelected] = useState<'manok' | 'itik'>('manok');
  const [limitsOpen, setLimitsOpen] = useState(false);
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
      setMessage("Couldn't copy the Support ID. Try again.");
    } finally {
      setBusy(null);
    }
  }, [busy, supportId]);

  const retryPlans = useCallback(() => {
    if (refreshing) return;
    setMessage(null);
    void refresh().catch(() => {
      setMessage("Couldn't check the store. Your logbook still works.");
    });
  }, [refresh, refreshing]);

  const selectedTier = access.kind === 'itik' ? 'itik' : selected;
  const selectedProduct = selectedTier === 'manok' ? offering?.manok : offering?.itik;
  const manokActive = access.kind === 'manok' || access.kind === 'manok-trial';
  const selectedIsActive = selectedTier === 'itik' ? access.kind === 'itik' : manokActive;
  const itikBlocked = selectedTier === 'itik'
    && !serviceConfig.revenueCatTestStore
    && !canBuyItik(access);
  const storeDetailsMissing = !loadingProducts && (!offering?.manok || !offering?.itik);
  const purchaseDisabled = busy !== null
    || refreshing
    || loadingProducts
    || access.kind === 'itik'
    || selectedIsActive
    || itikBlocked;
  const purchaseTitle = selectedIsActive
    ? `${selectedTier === 'manok' ? 'Manok' : 'Itik'} is active`
    : itikBlocked
      ? 'Manage Manok before switching'
      : loadingProducts
        ? 'Checking the store…'
        : !selectedProduct
          ? 'Try store again'
          : selectedTier === 'manok'
            ? offering?.manok?.trialEligible
              ? 'Start your free month'
              : `Choose Manok · ${selectedProduct.priceString}`
            : `Choose Itik · ${selectedProduct.priceString}`;
  const manokPrice = offering?.manok
    ? `${offering.manok.priceString} / month`
    : loadingProducts ? 'Checking price…' : 'Price unavailable';
  const manokDescription = offering?.manok?.trialEligible
    ? 'First month free. Then renews monthly.'
    : 'Renews monthly.';
  const manokBadge = access.kind === 'manok-trial'
    ? 'Trial active'
    : access.kind === 'manok'
      ? 'Your plan'
      : offering?.manok?.trialEligible
        ? '1 month free'
        : null;
  const itikPrice = offering?.itik
    ? `${offering.itik.priceString} once`
    : loadingProducts ? 'Checking price…' : 'Price unavailable';

  const handlePrimaryAction = useCallback(() => {
    if (!selectedProduct) {
      retryPlans();
      return;
    }
    void run('purchase', () => purchase(selectedTier));
  }, [purchase, retryPlans, run, selectedProduct, selectedTier]);

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
    >
      <ResponsiveContent maxWidth={Math.min(APP_MAX_WIDTH, 600)} className="gap-5">
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-1">
            <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">Choose your plan</Text>
            <Text className="text-sm text-m3-on-surface-variant">Your logbook stays yours on every plan. Manok and Itik add meal estimates and adaptive targets.</Text>
          </View>
          {onClose ? (
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close plans"
              className="h-12 w-12 items-center justify-center rounded-full active:bg-m3-surface-container-high"
            >
              <MaterialIcons name="close" size={24} color={M3.onSurface} />
            </Pressable>
          ) : null}
        </View>

        <CurrentPlan access={access} />

        <View className="gap-3">
          <PlanOption
            tier="manok"
            title="Manok"
            cadence="Monthly"
            badge={manokBadge}
            price={manokPrice}
            description={manokDescription}
            selected={selectedTier === 'manok'}
            disabled={access.kind === 'itik'}
            onPress={() => setSelected('manok')}
          />
          <PlanOption
            tier="itik"
            title="Itik"
            cadence="Lifetime"
            badge={access.kind === 'itik' ? 'Your plan' : 'Pay once'}
            price={itikPrice}
            description="One payment. No renewal."
            selected={selectedTier === 'itik'}
            disabled={access.kind === 'itik'}
            onPress={() => setSelected('itik')}
          />
        </View>

        {(access.kind === 'manok' || access.kind === 'manok-trial') && serviceConfig.revenueCatTestStore ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-m3-surface-container-low px-4 py-3">
            <MaterialIcons name="science" size={19} color={M3.onSurfaceVariant} />
            <Text className="flex-1 text-sm text-m3-on-surface-variant">Preview mode: choose Itik above to switch your test plan. Test purchases never charge you.</Text>
          </View>
        ) : null}

        {storeDetailsMissing ? (
          <View accessibilityRole="alert" className="flex-row items-start gap-3 px-1">
            <MaterialIcons name="cloud-off" size={20} color={M3.error} />
            <Text className="flex-1 text-sm text-m3-on-surface-variant">
              {selectedProduct
                ? 'One plan price did not load. You can still choose this plan or check the store again.'
                : "We couldn't reach the store. Prices and checkout didn't load. Your logbook still works."}
            </Text>
          </View>
        ) : null}

        {access.kind !== 'itik' ? (
          <PrimaryButton
            title={busy === 'purchase' ? 'Waiting for the store…' : refreshing && !selectedProduct ? 'Checking the store…' : purchaseTitle}
            disabled={purchaseDisabled}
            loading={loadingProducts || busy === 'purchase' || refreshing && !selectedProduct}
            onPress={handlePrimaryAction}
          />
        ) : null}

        {itikBlocked ? (
          <Text className="text-sm text-m3-on-surface-variant">End Manok in the store before switching to Itik. Your unused Manok time is not refunded.</Text>
        ) : null}

        {message ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-m3-surface-container px-4 py-3">
            <MaterialIcons name="info-outline" size={19} color={M3.onSurfaceVariant} />
            <Text accessibilityLiveRegion="polite" className="flex-1 text-sm text-m3-on-surface">{message}</Text>
          </View>
        ) : null}

        <View className="gap-3 pt-1">
          <Text accessibilityRole="header" className="text-base font-bold text-m3-on-surface">Paid plans unlock</Text>
          <FeatureLine icon="document-scanner">Scan or describe a meal</FeatureLine>
          <FeatureLine icon="tune">Fix estimates with follow-ups</FeatureLine>
          <FeatureLine icon="insights">Targets that adapt to your trend</FeatureLine>
          <Pressable
            onPress={() => setLimitsOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: limitsOpen }}
            className="min-h-[48px] flex-row items-center justify-between border-t border-m3-outline-variant pt-3"
          >
            <Text className="text-sm font-semibold text-m3-on-surface">{limitsOpen ? 'Hide AI use limits' : 'See AI use limits'}</Text>
            <MaterialIcons name={limitsOpen ? 'expand-less' : 'expand-more'} size={22} color={M3.onSurfaceVariant} />
          </Pressable>
          {limitsOpen ? (
            <View className="gap-2 pb-1">
              <Text className="text-sm text-m3-on-surface-variant"><Text className="font-semibold text-m3-on-surface">Manok trial:</Text> 5 estimates and 5 follow-ups in any 24 hours, up to 30 each for the trial.</Text>
              <Text className="text-sm text-m3-on-surface-variant"><Text className="font-semibold text-m3-on-surface">Paid:</Text> 30 requests in any 24 hours and 250 in 30 days.</Text>
            </View>
          ) : null}
        </View>

        {usage.kind === 'trial' ? (
          <Card className="gap-1 p-4">
            <Text className="text-base font-bold text-m3-on-surface">Trial use left</Text>
            <Text className="text-sm tabular-nums text-m3-on-surface-variant">Next 24h: {usage.initialRemaining24Hours}/5 estimates · {usage.clarificationRemaining24Hours}/5 follow-ups</Text>
            <Text className="text-sm tabular-nums text-m3-on-surface-variant">Full trial: {usage.initialRemainingTrial}/30 estimates · {usage.clarificationRemainingTrial}/30 follow-ups</Text>
          </Card>
        ) : usage.kind === 'paid' && (usage.remaining24Hours <= 5 || usage.remaining30Days <= 25) ? (
          <Card className="gap-1 p-4">
            <Text className="text-base font-bold text-m3-on-surface">AI use left</Text>
            <Text className="text-sm tabular-nums text-m3-on-surface-variant">{usage.remaining24Hours} in the next 24 hours · {usage.remaining30Days} in the next 30 days</Text>
          </Card>
        ) : null}

        <View className="gap-2 border-t border-m3-outline-variant pt-4">
          {(access.kind === 'manok' || access.kind === 'manok-trial') && !serviceConfig.revenueCatTestStore ? (
            <Pressable
              onPress={() => { void run('manage', manageSubscription); }}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy !== null }}
              className="min-h-[48px] items-center justify-center rounded-full border border-m3-outline"
            >
              <Text className="text-sm font-semibold text-m3-on-surface">{busy === 'manage' ? 'Opening the store…' : 'Manage subscription'}</Text>
            </Pressable>
          ) : null}
          <View className="flex-row flex-wrap justify-center gap-x-4">
            <Pressable
              onPress={() => { void run('restore', restore); }}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy !== null }}
              className="min-h-[48px] justify-center"
            >
              <Text className="text-sm font-semibold text-m3-on-surface">{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
            </Pressable>
            <Pressable
              onPress={retryPlans}
              disabled={refreshing || busy !== null}
              accessibilityRole="button"
              accessibilityState={{ disabled: refreshing || busy !== null, busy: refreshing }}
              className="min-h-[48px] justify-center"
            >
              <Text className="text-sm font-semibold text-m3-on-surface">{refreshing ? 'Checking…' : 'Check access'}</Text>
            </Pressable>
            <Pressable
              onPress={() => { void copySupportId(); }}
              disabled={!supportId || busy !== null}
              accessibilityRole="button"
              accessibilityState={{ disabled: !supportId || busy !== null }}
              className="min-h-[48px] flex-row items-center justify-center gap-2"
            >
              <MaterialIcons name="content-copy" size={16} color={supportId ? M3.onSurface : M3.onSurfaceVariant} />
              <Text className={`text-sm font-semibold ${supportId ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>{busy === 'copy' ? 'Copying…' : 'Copy Support ID'}</Text>
            </Pressable>
          </View>
          {access.kind === 'complimentary' ? <Text className="text-sm text-m3-on-surface-variant">Complimentary access is not tied to a store purchase.</Text> : null}
        </View>

        <View className="flex-row flex-wrap justify-center gap-4">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open Terms of Use"
            onPress={() => openLink(serviceConfig.publicLinks.termsUrl)}
            disabled={!serviceConfig.publicLinks.termsUrl}
            className="min-h-[48px] justify-center"
          >
            <Text className={`text-sm font-semibold ${serviceConfig.publicLinks.termsUrl ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>Terms of Use</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open Privacy Policy"
            onPress={() => openLink(serviceConfig.publicLinks.privacyPolicyUrl)}
            disabled={!serviceConfig.publicLinks.privacyPolicyUrl}
            className="min-h-[48px] justify-center"
          >
            <Text className={`text-sm font-semibold ${serviceConfig.publicLinks.privacyPolicyUrl ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>Privacy Policy</Text>
          </Pressable>
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
