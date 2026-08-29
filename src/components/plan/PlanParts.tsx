import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import Card from '../Card';
import TierBirdIcon from '../TierBirdIcon';
import { M3 } from '../../theme/tokens';
import type { EatlogUsage } from '../../services/billing.types';
import { accessDetail, accessName, accessTier, type Access } from './planCopy';

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

/** One choice inside a radio group. Callers must wrap the set in {@link PlanOptionGroup}. */
export function PlanOption({ tier, title, cadence, badge, price, description, selected, disabled, onPress }: PlanOptionProps) {
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

export function PlanOptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="gap-3">
      {children}
    </View>
  );
}

/**
 * The upgrade card shown when the selection is already settled. A single radio the user
 * cannot deselect is not a choice, so this drops the radio affordance entirely.
 */
export function UpgradeOption({ price, description, onPress, disabled }: {
  price: string;
  description: string;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={disabled ? { opacity: 0.48 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Upgrade to Itik lifetime. ${price}. ${description}`}
      accessibilityState={{ disabled: !!disabled }}
      className="rounded-2xl border border-m3-outline-variant bg-m3-surface-container p-4 active:opacity-80"
    >
      <View className="flex-row items-start gap-3">
        <TierBirdIcon tier="itik" size={48} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-lg font-bold text-m3-on-surface">Itik</Text>
          <Text className="text-xs font-semibold text-m3-on-surface-variant">Lifetime</Text>
        </View>
        <MaterialIcons name="chevron-right" size={23} color={M3.onSurfaceVariant} />
      </View>
      <View className="mt-3 gap-1">
        <Text className="text-xl font-bold tabular-nums text-m3-on-surface">{price}</Text>
        <Text className="text-sm text-m3-on-surface-variant">{description}</Text>
      </View>
    </Pressable>
  );
}

export function CurrentPlanCard({ access }: { access: Access | null }) {
  const tier = access ? accessTier(access.kind) : null;
  return (
    <Card className="flex-row items-center gap-3 p-4">
      {tier ? (
        <TierBirdIcon tier={tier} size={42} />
      ) : (
        <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-m3-surface-container-highest">
          <MaterialIcons name={access ? 'redeem' : 'cloud-off'} size={20} color={M3.onSurface} />
        </View>
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-baseline gap-2">
          <Text className="text-xs font-semibold text-m3-on-surface-variant">Current plan</Text>
          <Text className="text-base font-bold text-m3-on-surface">
            {access ? accessName(access.kind) : 'Unconfirmed'}
          </Text>
        </View>
        <Text className="text-sm text-m3-on-surface-variant">
          {access
            ? accessDetail(access)
            : "We couldn't reach the store. Free logging and estimates still work."}
        </Text>
      </View>
    </Card>
  );
}

function QuotaRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className="text-sm text-m3-on-surface-variant">{label}</Text>
      <Text className="min-w-0 flex-1 text-right text-sm font-semibold tabular-nums text-m3-on-surface">{value}</Text>
    </View>
  );
}

/**
 * The free tier's remaining estimates, and only those. Paid tiers read as unlimited under
 * fair use, so a counter is never shown to them: their caps exist to stop abuse, not to be a
 * budget the customer watches. Anyone who does reach a cap is told inline at that moment.
 */
export function QuotaCard({ usage }: { usage: EatlogUsage }) {
  if (usage.kind !== 'free') return null;
  return (
    <Card className="gap-3 p-4">
      <Text className="text-base font-bold text-m3-on-surface">Free estimates left</Text>
      <QuotaRow label="Next 24 hours" value={`${usage.remaining24Hours}/5`} />
    </Card>
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

function LimitRow({ label, free, paid }: { label: string; free: string; paid: string }) {
  return (
    <View className="flex-row items-baseline gap-3">
      <Text className="flex-1 text-sm text-m3-on-surface-variant">{label}</Text>
      <Text className="w-16 text-right text-sm tabular-nums text-m3-on-surface-variant">{free}</Text>
      <Text className="w-16 text-right text-sm font-semibold tabular-nums text-m3-on-surface">{paid}</Text>
    </View>
  );
}

/**
 * The comparison is the offer, so it stays open rather than sitting behind a disclosure.
 * The free side carries its real number because five a day is the boundary someone actually
 * meets. The paid side reads as unlimited under fair use rather than advertising its own
 * caps, which are abuse protection a normal user never reaches.
 */
export function ValueSummary() {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="text-base font-bold text-m3-on-surface">What you get</Text>
      <FeatureLine icon="tune">Meal and component re-estimates</FeatureLine>
      <FeatureLine icon="insights">Weekly target updates from your trend</FeatureLine>
      <View className="mt-1 gap-2 rounded-2xl bg-m3-surface-container px-4 py-3">
        <View className="flex-row items-baseline gap-3">
          <Text className="flex-1 text-xs font-semibold text-m3-on-surface-variant">Estimates</Text>
          <Text className="w-20 text-right text-xs font-semibold text-m3-on-surface-variant">Free</Text>
          <Text className="w-20 text-right text-xs font-semibold text-m3-on-surface">Paid</Text>
        </View>
        <LimitRow label="Photos and descriptions" free="5 a day" paid="Unlimited" />
        <LimitRow label="Follow-up re-estimates" free="—" paid="Unlimited" />
      </View>
      <Text className="px-1 text-xs text-m3-on-surface-variant">Unlimited use is subject to fair use.</Text>
    </View>
  );
}
