import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import Card from '../Card';
import TierBirdIcon from '../TierBirdIcon';
import { M3 } from '../../theme/tokens';
import { PAID_PLAN_NAME, planName } from '../../services/tierNames';
import type { Tier } from '../../services/userApiKey';
import { accessDetail, type Access } from './planCopy';

interface PlanOptionProps {
  title: string;
  cadence: string;
  badge?: string | null;
  price: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress(): void;
}

function OfferHeading({ title, cadence, badge }: { title: string; cadence: string; badge?: string | null }) {
  return (
    <>
      <TierBirdIcon tier="itik" size={48} />
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
    </>
  );
}

function OfferPrice({ price, description }: { price: string; description: string }) {
  return (
    <View className="mt-3 gap-1">
      <Text className="text-xl font-bold tabular-nums text-m3-on-surface">{price}</Text>
      <Text className="text-sm text-m3-on-surface-variant">{description}</Text>
    </View>
  );
}

/** One choice inside a radio group, always wrapped in {@link PlanOptionGroup}. */
function PlanOption({ title, cadence, badge, price, description, selected, disabled, onPress }: PlanOptionProps) {
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
        <OfferHeading title={title} cadence={cadence} badge={badge} />
        <MaterialIcons
          name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
          size={23}
          color={selected ? M3.onSurface : M3.onSurfaceVariant}
        />
      </View>
      <OfferPrice price={price} description={description} />
    </Pressable>
  );
}

function PlanOptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="gap-3">
      {children}
    </View>
  );
}

/**
 * The offer when the store has only one package. A single radio the user cannot deselect is
 * not a choice, so this drops the radio affordance and leaves the button below to act.
 */
function OfferCard({ title, cadence, badge, price, description }: Omit<PlanOptionProps, 'selected' | 'disabled' | 'onPress'>) {
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${cadence}. ${price}. ${description}`}
      className="rounded-2xl border border-m3-outline-variant bg-m3-surface-container p-4"
    >
      <View className="flex-row items-start gap-3">
        <OfferHeading title={title} cadence={cadence} badge={badge} />
      </View>
      <OfferPrice price={price} description={description} />
    </View>
  );
}

interface OfferOption {
  id: string;
  title: string;
  cadence: string;
  badge: string | null;
  price: string;
  description: string;
}

/** The offering's packages: one static card, or a radio group once there is a real choice. */
export function OfferChoice({ options, selectedId, onSelect }: {
  options: OfferOption[];
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  if (options.length === 0) return null;
  if (options.length === 1) {
    const [only] = options;
    return <OfferCard title={only.title} cadence={only.cadence} badge={only.badge} price={only.price} description={only.description} />;
  }
  return (
    <PlanOptionGroup label="Choose a plan">
      {options.map((option) => (
        <PlanOption
          key={option.id}
          title={option.title}
          cadence={option.cadence}
          badge={option.badge}
          price={option.price}
          description={option.description}
          selected={option.id === selectedId}
          onPress={() => onSelect(option.id)}
        />
      ))}
    </PlanOptionGroup>
  );
}

export function CurrentPlanCard({ access, tier }: { access: Access | null; tier: Tier }) {
  return (
    <Card className="flex-row items-center gap-3 p-4">
      {access ? (
        <TierBirdIcon tier={tier} size={42} />
      ) : (
        <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-m3-surface-container-highest">
          <MaterialIcons name="cloud-off" size={20} color={M3.onSurface} />
        </View>
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-baseline gap-2">
          <Text className="text-xs font-semibold text-m3-on-surface-variant">Current plan</Text>
          <Text className="text-base font-bold text-m3-on-surface">
            {access ? planName(tier) : 'Unconfirmed'}
          </Text>
        </View>
        <Text className="text-sm text-m3-on-surface-variant">
          {access
            ? accessDetail(access, tier)
            : "We couldn't reach the store. Your logbook still works."}
        </Text>
      </View>
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

/**
 * The offer is the difference between the tiers, so it stays open rather than sitting behind
 * a disclosure. Everything local is free; Itik adds hosted estimates with nothing to set up.
 */
export function ValueSummary() {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="text-base font-bold text-m3-on-surface">What you get</Text>
      <Text className="px-1 text-xs font-semibold text-m3-on-surface-variant">Free</Text>
      <FeatureLine icon="restaurant">Logging, weight, and analytics</FeatureLine>
      <FeatureLine icon="insights">Weekly target updates from your trend</FeatureLine>
      <FeatureLine icon="vpn-key">AI estimates with your own Google key</FeatureLine>
      <Text className="mt-2 px-1 text-xs font-semibold text-m3-on-surface-variant">{PAID_PLAN_NAME}</Text>
      <FeatureLine icon="done-all">Everything in free</FeatureLine>
      <FeatureLine icon="auto-awesome">AI estimates with no setup</FeatureLine>
      <Text className="px-1 text-xs text-m3-on-surface-variant">Eatlog AI is subject to fair use.</Text>
    </View>
  );
}
