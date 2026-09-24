import React, { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';

import PrimaryButton from '../components/PrimaryButton';
import ResponsiveContent from '../components/ResponsiveContent';
import { CurrentPlanCard, OfferChoice, ValueSummary } from '../components/plan/PlanParts';
import { usePlanPurchase } from '../components/plan/usePlanPurchase';
import { serviceConfig } from '../config/services';
import { useAiSetup } from '../context/AiSetupContext';
import { useEntitlement, type RefreshOutcome } from '../context/EntitlementContext';
import { tierOf } from '../services/userApiKey';
import { PAID_PLAN_NAME } from '../services/tierNames';
import { APP_MAX_WIDTH } from '../theme/layout';
import { M3 } from '../theme/tokens';

type UtilityAction = 'restore' | 'manage' | 'copy' | null;

// Typed by the outcome union so a new outcome cannot ship without copy to explain it.
const REFRESH_MESSAGES: Record<RefreshOutcome, string> = {
  ok: 'Your plan is up to date.',
  partial: "Your plan is up to date. Eatlog AI couldn't be reached.",
  failed: "We couldn't reach the store. Your logbook still works.",
};

function PlanContent() {
  const {
    access, supportId, refreshing, refresh, restore, manageSubscription,
  } = useEntitlement();
  const { keyState } = useAiSetup();
  const plan = usePlanPurchase(access);
  const tier = tierOf(plan.itik, keyState.hasKey);
  const [busy, setBusy] = useState<UtilityAction>(null);
  const [utilityMessage, setUtilityMessage] = useState<string | null>(null);

  const utilityBusy = busy !== null || plan.busy;
  const subscription = access?.kind === 'subscription';

  const run = useCallback(async (
    action: Exclude<UtilityAction, null>,
    task: () => Promise<{ message: string }>,
    pending: string,
  ) => {
    if (busy) return;
    setBusy(action);
    setUtilityMessage(pending);
    try {
      setUtilityMessage((await task()).message);
    } catch {
      setUtilityMessage("That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }, [busy]);

  const copySupportId = useCallback(async () => {
    if (!supportId || busy) return;
    setBusy('copy');
    try {
      await Clipboard.setStringAsync(supportId);
      setUtilityMessage('Support ID copied.');
    } catch {
      setUtilityMessage("Couldn't copy the Support ID. Try again.");
    } finally {
      setBusy(null);
    }
  }, [busy, supportId]);

  const checkAccess = useCallback(async () => {
    setUtilityMessage(REFRESH_MESSAGES[await refresh()]);
  }, [refresh]);

  const openLink = useCallback((url: string | null) => {
    if (url) void Linking.openURL(url);
  }, []);

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { void checkAccess(); }}
          tintColor={M3.onSurfaceVariant}
          colors={[M3.onSurface]}
          progressBackgroundColor={M3.surfaceContainerHigh}
        />
      )}
    >
      <ResponsiveContent maxWidth={Math.min(APP_MAX_WIDTH, 600)} className="gap-5">
        <CurrentPlanCard access={access} tier={tier} />

        {plan.itik ? null : <ValueSummary />}

        {plan.canBuy ? (
          <>
            <OfferChoice options={plan.options} selectedId={plan.selectedId} onSelect={plan.setSelected} />

            {plan.purchaseUnavailable ? (
              <View accessibilityRole="alert" className="flex-row items-start gap-3 px-1">
                <MaterialIcons name="cloud-off" size={20} color={M3.error} />
                <View className="min-w-0 flex-1 gap-2">
                  <Text className="text-sm text-m3-on-surface-variant">
                    The one-time {PAID_PLAN_NAME} purchase is unavailable here right now. Free Eatlog still works.
                  </Text>
                  <Pressable
                    onPress={plan.retryStore}
                    accessibilityRole="button"
                    accessibilityLabel="Check the store again"
                    className="min-h-[48px] justify-center self-start"
                  >
                    <Text className="text-sm font-semibold text-m3-on-surface">Check the store again</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <PrimaryButton
              title={plan.title}
              disabled={plan.disabled}
              loading={plan.busy || plan.loadingProducts}
              onPress={() => { void plan.run(); }}
            />
          </>
        ) : null}

        {plan.message ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-m3-surface-container px-4 py-3">
            <MaterialIcons name="info-outline" size={19} color={M3.onSurfaceVariant} />
            <Text accessibilityLiveRegion="polite" className="flex-1 text-sm text-m3-on-surface">{plan.message}</Text>
          </View>
        ) : null}

        <View className="gap-3 border-t border-m3-outline-variant pt-4">
          <Text accessibilityRole="header" className="text-base font-bold text-m3-on-surface">Purchase help</Text>
          {subscription && !serviceConfig.revenueCatTestStore ? (
            <Pressable
              onPress={() => { void run('manage', manageSubscription, 'Opening your subscription settings…'); }}
              disabled={utilityBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: utilityBusy, busy: busy === 'manage' }}
              className="min-h-[48px] items-center justify-center rounded-full border border-m3-outline active:bg-m3-surface-container-high"
            >
              <Text className="text-sm font-semibold text-m3-on-surface">Manage subscription</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => { void run('restore', restore, 'Restoring purchases…'); }}
            disabled={utilityBusy}
            accessibilityRole="button"
            accessibilityState={{ disabled: utilityBusy, busy: busy === 'restore' }}
            className="min-h-[48px] items-center justify-center rounded-full border border-m3-outline px-2 active:bg-m3-surface-container-high"
          >
            <Text className="text-sm font-semibold text-m3-on-surface">Restore purchases</Text>
          </Pressable>
          <Pressable
            onPress={() => { void copySupportId(); }}
            disabled={!supportId || utilityBusy}
            accessibilityRole="button"
            accessibilityLabel={supportId
              ? `Copy Support ID ${supportId}`
              : 'Support ID is being prepared'}
            accessibilityHint={supportId ? 'Copies the ID for a support request' : undefined}
            accessibilityState={{ disabled: !supportId || utilityBusy, busy: busy === 'copy' }}
            className="min-h-[64px] flex-row items-center gap-3 rounded-2xl bg-m3-surface-container px-4 active:bg-m3-surface-container-high"
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-xs font-semibold text-m3-on-surface-variant">Support ID</Text>
              <Text
                numberOfLines={1}
                ellipsizeMode="middle"
                className={`text-sm tabular-nums ${supportId ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}
              >
                {supportId ?? 'Preparing…'}
              </Text>
            </View>
            <View className="h-8 w-8 items-center justify-center rounded-full bg-m3-surface-container-highest">
              <MaterialIcons name="content-copy" size={16} color={supportId ? M3.onSurface : M3.onSurfaceVariant} />
            </View>
          </Pressable>
          <View className="flex-row items-center gap-2 px-1">
            <MaterialIcons name="info-outline" size={18} color={M3.onSurfaceVariant} />
            <Text
              accessibilityLiveRegion={utilityMessage ? 'polite' : 'none'}
              className="flex-1 text-sm text-m3-on-surface-variant"
            >
              {utilityMessage ?? 'Pull down to check your plan. Use these when a purchase is missing or support asks for your ID.'}
            </Text>
          </View>
          {access?.kind === 'complimentary' ? (
            <Text className="text-sm text-m3-on-surface-variant">Complimentary access is not tied to a store purchase.</Text>
          ) : null}
        </View>

        <View className="flex-row flex-wrap justify-center gap-4">
          {serviceConfig.publicLinks.termsUrl ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open Terms of Use"
              onPress={() => openLink(serviceConfig.publicLinks.termsUrl)}
              className="min-h-[48px] justify-center"
            >
              <Text className="text-sm font-semibold text-m3-on-surface">Terms of Use</Text>
            </Pressable>
          ) : null}
          {serviceConfig.publicLinks.privacyPolicyUrl ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open Privacy Policy"
              onPress={() => openLink(serviceConfig.publicLinks.privacyPolicyUrl)}
              className="min-h-[48px] justify-center"
            >
              <Text className="text-sm font-semibold text-m3-on-surface">Privacy Policy</Text>
            </Pressable>
          ) : null}
        </View>
      </ResponsiveContent>
    </ScrollView>
  );
}

export function ProfileSubscriptionPlanScreen() {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-m3-surface">
      <PlanContent />
    </SafeAreaView>
  );
}
