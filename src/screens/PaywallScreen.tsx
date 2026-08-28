import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
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
import { canBuyItik, hasPaidFeatures, PAID_ACCESS_UNAVAILABLE_MESSAGE } from '../services/billing.types';
import { APP_MAX_WIDTH } from '../theme/layout';
import { M3 } from '../theme/tokens';

type Access = NonNullable<ReturnType<typeof useEntitlement>['access']>;
type BusyAction = 'purchase' | 'restore' | 'manage' | 'copy';
type MessageScope = 'purchase' | 'utility';

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function accessName(kind: Access['kind']): string {
  if (kind === 'manok-trial') return 'Monthly';
  if (kind === 'manok') return 'Monthly';
  if (kind === 'itik') return 'Lifetime';
  if (kind === 'complimentary') return 'Complimentary';
  return 'Free';
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
  if (access.kind === 'complimentary') {
    return access.expiresAt ? `Available until ${dateLabel(access.expiresAt)}` : 'Yours for good, courtesy of Eatlog.';
  }
  if (access.reason === 'expired') return 'Paid access ended. Your logbook is untouched.';
  if (access.reason === 'revoked') return 'Paid access was removed. Your logbook is untouched.';
  if (access.reason === 'malformed') return "We couldn't verify paid access. Restore or check again.";
  if (access.reason === 'unavailable') return "We couldn't check paid access. Local logging still works.";
  return 'Free logging plus 5 AI estimates per rolling 24 hours.';
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
    access, status: entitlementStatus, offering, usage, supportId, loadingProducts, refreshing,
    refresh, purchase, restore, manageSubscription,
  } = useEntitlement();
  const [selected, setSelected] = useState<'manok' | 'itik'>('manok');
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [managingPlan, setManagingPlan] = useState(false);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [utilityMessage, setUtilityMessage] = useState<string | null>(null);

  const setScopedMessage = useCallback((scope: MessageScope, value: string | null) => {
    if (scope === 'purchase') setPurchaseMessage(value);
    else setUtilityMessage(value);
  }, []);

  const run = useCallback(async (
    kind: BusyAction,
    action: () => Promise<{ message: string }>,
    scope: MessageScope,
    pendingMessage?: string,
  ) => {
    if (busy) return;
    setBusy(kind);
    setScopedMessage(scope, pendingMessage ?? null);
    try {
      setScopedMessage(scope, (await action()).message);
    } catch {
      setScopedMessage(scope, scope === 'purchase'
        ? "The purchase didn't finish. Try again."
        : "That didn't work. Try again.");
    }
    finally { setBusy(null); }
  }, [busy, setScopedMessage]);

  const openLink = useCallback((url: string | null) => {
    if (url) void Linking.openURL(url);
  }, []);

  const copySupportId = useCallback(async () => {
    if (!supportId || busy) return;
    setBusy('copy');
    setUtilityMessage('Copying Support ID…');
    try {
      await Clipboard.setStringAsync(supportId);
      setUtilityMessage('Support ID copied.');
    } catch {
      setUtilityMessage("Couldn't copy the Support ID. Try again.");
    } finally {
      setBusy(null);
    }
  }, [busy, supportId]);

  const retryPlans = useCallback((scope: MessageScope = 'purchase') => {
    if (refreshing || busy) return;
    setScopedMessage(scope, scope === 'utility' ? 'Checking your access…' : null);
    void refresh()
      .then(() => {
        if (scope === 'utility') setUtilityMessage('Access check finished. Your current plan is shown above.');
      })
      .catch(() => {
        setScopedMessage(scope, "Couldn't check the store. Your logbook still works.");
      });
  }, [busy, refresh, refreshing, setScopedMessage]);

  if (access === null || entitlementStatus === 'checking') {
    return (
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContent maxWidth={Math.min(APP_MAX_WIDTH, 600)} className="gap-5">
          <View className="flex-row items-start gap-3">
            <Text accessibilityRole="header" className="flex-1 text-2xl font-bold text-m3-on-surface">Checking your plan</Text>
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
          <Card className="min-h-[96px] items-center justify-center gap-3 p-4">
            {loadingProducts || refreshing ? (
              <ActivityIndicator color={M3.onSurfaceVariant} />
            ) : (
              <MaterialIcons name="cloud-off" size={24} color={M3.onSurfaceVariant} />
            )}
            <Text accessibilityLiveRegion="polite" className="text-center text-sm text-m3-on-surface-variant">
              {loadingProducts || refreshing ? 'Reading your saved purchase status…' : PAID_ACCESS_UNAVAILABLE_MESSAGE}
            </Text>
            {!loadingProducts && !refreshing ? (
              <PrimaryButton title="Check access" onPress={() => retryPlans('utility')} />
            ) : null}
          </Card>
        </ResponsiveContent>
      </ScrollView>
    );
  }

  const manokActive = access.kind === 'manok' || access.kind === 'manok-trial';
  const hasCurrentPlan = hasPaidFeatures(access);
  const managingCurrentPlan = hasCurrentPlan && managingPlan;
  const showPurchaseOptions = (!hasCurrentPlan || managingCurrentPlan) && access.kind !== 'itik';
  const selectedTier = managingCurrentPlan && manokActive
    ? 'itik'
    : access.kind === 'itik' ? 'itik' : selected;
  const selectedProduct = selectedTier === 'manok' ? offering?.manok : offering?.itik;
  const selectedIsActive = selectedTier === 'itik' ? access.kind === 'itik' : manokActive;
  const itikBlocked = selectedTier === 'itik'
    && !serviceConfig.revenueCatTestStore
    && !canBuyItik(access);
  const storeDetailsMissing = !loadingProducts && (!offering?.manok || !offering?.itik);
  const utilityBusy = busy !== null || refreshing;
  const supportIdDisplay = supportId ?? (loadingProducts || refreshing ? 'Preparing…' : 'Unavailable');
  const purchaseDisabled = busy !== null
    || refreshing
    || loadingProducts
    || access.kind === 'itik'
    || selectedIsActive
    || itikBlocked;
  const manokOfferEligible = offering?.manok?.trialEligible === true;
  const purchaseTitle = selectedIsActive
    ? 'Current plan'
    : itikBlocked
      ? 'Available after monthly plan ends'
      : loadingProducts
        ? 'Checking the store…'
        : !selectedProduct
          ? 'Try store again'
          : selectedTier === 'manok'
            ? manokOfferEligible
              ? 'Continue to Google Play'
              : `Start monthly · ${selectedProduct.priceString}`
            : `Buy lifetime · ${selectedProduct.priceString}`;
  const manokPrice = offering?.manok
    ? `${offering.manok.priceString} / month`
    : loadingProducts ? 'Checking price…' : 'Price unavailable';
  const manokDescription = manokOfferEligible && offering?.manok
    ? `1 month free, then ${offering.manok.priceString} / month until canceled in Google Play.`
    : 'Renews monthly.';
  const manokBadge = access.kind === 'manok-trial' || access.kind === 'manok'
    ? 'Your plan'
    : null;
  const itikPrice = offering?.itik
    ? `${offering.itik.priceString} once`
    : loadingProducts ? 'Checking price…' : 'Price unavailable';

  const handlePrimaryAction = useCallback(() => {
    if (!selectedProduct) {
      retryPlans('purchase');
      return;
    }
    void run('purchase', () => purchase(selectedTier), 'purchase');
  }, [purchase, retryPlans, run, selectedProduct, selectedTier]);

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
    >
      <ResponsiveContent maxWidth={Math.min(APP_MAX_WIDTH, 600)} className="gap-5">
        <View className="flex-row items-start gap-3">
          <View className="flex-1">
            <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">
              {managingCurrentPlan ? 'Manage plan' : hasCurrentPlan ? 'Your plan' : 'Choose your plan'}
            </Text>
          </View>
          {managingCurrentPlan ? (
            <Pressable
              onPress={() => setManagingPlan(false)}
              accessibilityRole="button"
              accessibilityLabel="Done managing plan"
              className="h-12 w-12 items-center justify-center rounded-full active:bg-m3-surface-container-high"
            >
              <MaterialIcons name="close" size={24} color={M3.onSurface} />
            </Pressable>
          ) : onClose ? (
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

        {hasCurrentPlan && !managingCurrentPlan ? (
          <PrimaryButton title="Manage plan" onPress={() => setManagingPlan(true)} />
        ) : null}

        {showPurchaseOptions ? (
          <>

        <View className="gap-3">
          {!manokActive ? (
          <PlanOption
            tier="manok"
            title="Manok"
            cadence="Monthly"
            badge={manokBadge}
            price={manokPrice}
            description={manokDescription}
            selected={selectedTier === 'manok'}
            onPress={() => setSelected('manok')}
          />
          ) : null}
          <PlanOption
            tier="itik"
            title="Itik"
            cadence="Lifetime"
            badge="Pay once"
            price={itikPrice}
            description="One payment. No renewal."
            selected={selectedTier === 'itik'}
            onPress={() => setSelected('itik')}
          />
        </View>

        {(access.kind === 'manok' || access.kind === 'manok-trial') && serviceConfig.revenueCatTestStore ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-m3-surface-container-low px-4 py-3">
            <MaterialIcons name="science" size={19} color={M3.onSurfaceVariant} />
            <Text className="flex-1 text-sm text-m3-on-surface-variant">Preview mode: choose Lifetime above to switch plans. Test purchases never charge you.</Text>
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

          <PrimaryButton
            title={busy === 'purchase' ? 'Waiting for the store…' : refreshing && !selectedProduct ? 'Checking the store…' : purchaseTitle}
            disabled={purchaseDisabled}
            loading={loadingProducts || busy === 'purchase' || refreshing && !selectedProduct}
            onPress={handlePrimaryAction}
          />

        {itikBlocked ? (
          <Text className="text-sm text-m3-on-surface-variant">Cancel your monthly plan in the store first. You can buy lifetime access when the current billing period ends.</Text>
        ) : null}

        {purchaseMessage ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-m3-surface-container px-4 py-3">
            <MaterialIcons name="info-outline" size={19} color={M3.onSurfaceVariant} />
            <Text accessibilityLiveRegion="polite" className="flex-1 text-sm text-m3-on-surface">{purchaseMessage}</Text>
          </View>
        ) : null}
          </>
        ) : null}

        {!managingCurrentPlan ? (
          <>
        <View className="gap-3 pt-1">
          <Text accessibilityRole="header" className="text-base font-bold text-m3-on-surface">What you get</Text>
          <FeatureLine icon="document-scanner">Higher AI estimate limits</FeatureLine>
          <FeatureLine icon="tune">Meal and component re-estimates</FeatureLine>
          <FeatureLine icon="insights">Weekly target updates from your trend</FeatureLine>
          <Pressable
            onPress={() => setLimitsOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: limitsOpen }}
            className="min-h-[48px] flex-row items-center justify-between border-t border-m3-outline-variant pt-3"
          >
            <Text className="text-sm font-semibold text-m3-on-surface">Usage limits</Text>
            <MaterialIcons name={limitsOpen ? 'expand-less' : 'expand-more'} size={22} color={M3.onSurfaceVariant} />
          </Pressable>
          {limitsOpen ? (
            <View className="gap-3 pb-1">
              <View className="flex-row items-start gap-4">
                <Text className="w-20 text-sm font-semibold text-m3-on-surface">
                  {usage.kind === 'free' ? 'Pugo' : usage.kind === 'trial' ? 'Your access' : 'Manok / Itik'}
                </Text>
                <Text className="flex-1 text-sm text-m3-on-surface-variant">
                  {usage.kind === 'free'
                    ? '5 photo or description estimates per rolling 24 hours · no follow-up re-estimates'
                    : usage.kind === 'trial'
                      ? '5 estimates and 5 follow-ups per 24 hours · 30 of each total'
                      : '30 requests per 24 hours · 250 per 30 days'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {usage.kind === 'free' ? (
          <Card className="gap-3 p-4">
            <Text className="text-base font-bold text-m3-on-surface">Free estimates left</Text>
            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="text-sm text-m3-on-surface-variant">Next 24 hours</Text>
              <Text className="text-sm font-semibold tabular-nums text-m3-on-surface">{usage.remaining24Hours}/5</Text>
            </View>
          </Card>
        ) : usage.kind === 'trial' ? (
          <Card className="gap-3 p-4">
            <Text className="text-base font-bold text-m3-on-surface">Requests left</Text>
            <View className="gap-2">
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="text-sm text-m3-on-surface-variant">Next 24 hours</Text>
                <Text className="min-w-0 flex-1 text-right text-sm tabular-nums text-m3-on-surface">{usage.initialRemaining24Hours}/5 estimates · {usage.clarificationRemaining24Hours}/5 follow-ups</Text>
              </View>
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="text-sm text-m3-on-surface-variant">Access period</Text>
                <Text className="min-w-0 flex-1 text-right text-sm tabular-nums text-m3-on-surface">{usage.initialRemainingTrial}/30 estimates · {usage.clarificationRemainingTrial}/30 follow-ups</Text>
              </View>
            </View>
          </Card>
        ) : usage.kind === 'paid' && (usage.remaining24Hours <= 5 || usage.remaining30Days <= 25) ? (
          <Card className="gap-3 p-4">
            <Text className="text-base font-bold text-m3-on-surface">Requests left</Text>
            <View className="gap-2">
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="text-sm text-m3-on-surface-variant">Next 24 hours</Text>
                <Text className="text-sm font-semibold tabular-nums text-m3-on-surface">{usage.remaining24Hours}</Text>
              </View>
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="text-sm text-m3-on-surface-variant">Next 30 days</Text>
                <Text className="text-sm font-semibold tabular-nums text-m3-on-surface">{usage.remaining30Days}</Text>
              </View>
            </View>
          </Card>
        ) : null}
          </>
        ) : null}

        {!hasCurrentPlan || managingCurrentPlan ? (
        <View className="gap-3 border-t border-m3-outline-variant pt-4">
          <Text accessibilityRole="header" className="text-base font-bold text-m3-on-surface">Purchase help</Text>
          {(access.kind === 'manok' || access.kind === 'manok-trial') && !serviceConfig.revenueCatTestStore ? (
            <Pressable
              onPress={() => { void run('manage', manageSubscription, 'utility', 'Opening your subscription settings…'); }}
              disabled={utilityBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: utilityBusy, busy: busy === 'manage' }}
              className="min-h-[48px] items-center justify-center rounded-full border border-m3-outline active:bg-m3-surface-container-high"
            >
              <Text className="text-sm font-semibold text-m3-on-surface">Manage subscription</Text>
            </Pressable>
          ) : null}
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => { void run('restore', restore, 'utility', 'Restoring purchases…'); }}
              disabled={utilityBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: utilityBusy, busy: busy === 'restore' }}
              className="min-h-[48px] flex-1 items-center justify-center rounded-full border border-m3-outline px-2 active:bg-m3-surface-container-high"
            >
              <Text className="text-xs font-semibold text-m3-on-surface">Restore purchases</Text>
            </Pressable>
            <Pressable
              onPress={() => retryPlans('utility')}
              disabled={utilityBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: utilityBusy, busy: refreshing }}
              className="min-h-[48px] flex-1 items-center justify-center rounded-full border border-m3-outline px-2 active:bg-m3-surface-container-high"
            >
              <Text className="text-xs font-semibold text-m3-on-surface">Check access</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => { void copySupportId(); }}
            disabled={!supportId || utilityBusy}
            accessibilityRole="button"
            accessibilityLabel={supportId
              ? `Copy Support ID ${supportId}`
              : loadingProducts || refreshing
                ? 'Support ID is being prepared'
                : 'Support ID is unavailable'}
            accessibilityHint={supportId ? 'Copies the ID for a support request' : undefined}
            accessibilityState={{ disabled: !supportId || utilityBusy, busy: busy === 'copy' }}
            className="min-h-[64px] flex-row items-center gap-3 rounded-2xl bg-m3-surface-container px-4 active:bg-m3-surface-container-high"
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-xs font-semibold text-m3-on-surface-variant">Support ID</Text>
              <Text selectable numberOfLines={1} ellipsizeMode="middle" className={`text-sm tabular-nums ${supportId ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>
                {supportIdDisplay}
              </Text>
            </View>
            <View className="h-8 w-8 items-center justify-center rounded-full bg-m3-surface-container-highest">
              <MaterialIcons name="content-copy" size={16} color={supportId ? M3.onSurface : M3.onSurfaceVariant} />
            </View>
          </Pressable>
          <View className="min-h-[64px] flex-row items-center gap-2 px-1">
            <MaterialIcons name="info-outline" size={18} color={M3.onSurfaceVariant} />
            <Text accessibilityLiveRegion={utilityMessage ? 'polite' : 'none'} className="flex-1 text-sm text-m3-on-surface-variant">
              {utilityMessage ?? 'Use these when a purchase is missing or support asks for your ID.'}
            </Text>
          </View>
          {access.kind === 'complimentary' ? <Text className="text-sm text-m3-on-surface-variant">Complimentary access is not tied to a store purchase.</Text> : null}
        </View>
        ) : null}

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
