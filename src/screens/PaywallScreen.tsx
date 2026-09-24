import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import PrimaryButton from '../components/PrimaryButton';
import ResponsiveContent from '../components/ResponsiveContent';
import { OfferChoice, ValueSummary } from '../components/plan/PlanParts';
import { usePlanPurchase } from '../components/plan/usePlanPurchase';
import { serviceConfig } from '../config/services';
import { useEntitlement } from '../context/EntitlementContext';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { PAID_PLAN_NAME } from '../services/tierNames';
import { APP_MAX_WIDTH } from '../theme/layout';
import { M3 } from '../theme/tokens';

export default function PaywallScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Paywall'>) {
  const { access, restore } = useEntitlement();
  const plan = usePlanPurchase(access);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const runRestore = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    setRestoreMessage('Restoring purchases…');
    try {
      setRestoreMessage((await restore()).message);
    } catch {
      setRestoreMessage("That didn't work. Try again.");
    } finally {
      setRestoring(false);
    }
  }, [restore, restoring]);

  const openLink = useCallback((url: string | null) => {
    if (url) void Linking.openURL(url);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" accessibilityViewIsModal>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContent maxWidth={Math.min(APP_MAX_WIDTH, 600)} className="gap-5">
          <View className="flex-row items-start gap-3">
            <View className="min-w-0 flex-1 gap-1">
              <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">
                Get {PAID_PLAN_NAME}
              </Text>
              <Text className="text-sm text-m3-on-surface-variant">
                AI estimates from photos and descriptions, with no key to set up.
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Close plans"
              className="h-12 w-12 items-center justify-center rounded-full active:bg-m3-surface-container-high"
            >
              <MaterialIcons name="close" size={24} color={M3.onSurface} />
            </Pressable>
          </View>

          <ValueSummary />

          {plan.canBuy ? (
            <>
              <OfferChoice options={plan.options} selectedId={plan.selectedId} onSelect={plan.setSelected} />

              {plan.storeUnreachable ? (
                <View accessibilityRole="alert" className="flex-row items-start gap-3 px-1">
                  <MaterialIcons name="cloud-off" size={20} color={M3.error} />
                  <View className="min-w-0 flex-1 gap-2">
                    <Text className="text-sm text-m3-on-surface-variant">
                      We couldn't reach the store, so prices and checkout didn't load. Your logbook still works.
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
          ) : (
            <Text className="px-1 text-sm text-m3-on-surface-variant">Eatlog {PAID_PLAN_NAME} is already active.</Text>
          )}

          {plan.message || restoreMessage ? (
            <View className="flex-row items-start gap-3 rounded-2xl bg-m3-surface-container px-4 py-3">
              <MaterialIcons name="info-outline" size={19} color={M3.onSurfaceVariant} />
              <Text accessibilityLiveRegion="polite" className="flex-1 text-sm text-m3-on-surface">
                {plan.message ?? restoreMessage}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => { void runRestore(); }}
            disabled={restoring || plan.busy}
            accessibilityRole="button"
            accessibilityLabel="Already bought a plan? Restore purchases"
            accessibilityState={{ disabled: restoring || plan.busy, busy: restoring }}
            className="min-h-[48px] items-center justify-center"
          >
            <Text className="text-sm font-semibold text-m3-on-surface">Already bought it? Restore</Text>
          </Pressable>

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
    </SafeAreaView>
  );
}
