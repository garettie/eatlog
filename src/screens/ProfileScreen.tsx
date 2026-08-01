import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import ProfileSettingRow from '../components/ProfileSettingRow';
import { DailyTarget, getDailyTargetForDate, getProfile, Profile } from '../db/database';
import { AdaptiveReviewState, getAdaptiveReviewState } from '../services/adaptiveReviews';
import { M3 } from '../theme/tokens';
import { parseLocalISO, todayISO } from '../utils/calendar';
import { fromKilograms } from '../utils/weightUnits';

interface ProfileScreenProps {
  dataVersion: number;
}

function initialsFor(name: string): string {
  const initials = name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2);
  return (initials || 'MU').toUpperCase();
}

function formatDate(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function goalLabel(profile: Profile): string {
  if (profile.goal_type === 'maintain') return 'Maintain';
  return profile.goal_type === 'cut' ? 'Cut' : 'Bulk';
}

function weeklyRate(profile: Profile): string {
  if (profile.goal_type === 'maintain') return 'Maintenance';
  const value = profile.weight_unit === 'lb'
    ? fromKilograms(profile.goal_rate_kg_per_week, 'lb')
    : profile.goal_rate_kg_per_week;
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} ${profile.weight_unit}/wk`;
}

function targetSource(target: DailyTarget): string {
  if (target.calculation_method === 'adaptive') return 'Adaptive';
  if (target.calculation_method === 'manual') return 'Manual';
  if (target.calculation_method === 'profile_recalculation') return 'Profile recalculation';
  return 'Initial estimate';
}

function adaptiveLabel(state: AdaptiveReviewState): string {
  if (state.kind === 'ready') return 'Adaptive review ready';
  if (state.kind === 'next-review') return `Next review ${formatDate(state.nextReviewDate)}`;
  return `Collecting evidence · ${state.eligibility.intakeDayCount}/10 intake days`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-m3-on-surface-variant text-sm font-semibold px-1">{title}</Text>
      <Card className="overflow-hidden">{children}</Card>
    </View>
  );
}

function ProfileScreen({ dataVersion }: ProfileScreenProps) {
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState<DailyTarget | null>(null);
  const [adaptiveState, setAdaptiveState] = useState<AdaptiveReviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const initialLoadDone = useRef(false);
  const loadQueueRef = useRef<Promise<void>>(Promise.resolve());

  const loadProfile = useCallback((showLoading: boolean) => {
    if (showLoading) setLoading(true);
    const queued = loadQueueRef.current.catch(() => {}).then(async () => {
      try {
        const today = todayISO();
        const nextProfile = await getProfile();
        const nextTarget = nextProfile ? await getDailyTargetForDate(today) : null;
        const nextAdaptiveState = nextProfile && nextTarget ? await getAdaptiveReviewState(today) : null;

        setProfile(nextProfile);
        setTarget(nextTarget);
        setAdaptiveState(nextAdaptiveState);
        setReadError(false);
      } catch (error) {
        console.error('[Profile] load failed', error);
        setReadError(true);
      } finally {
        if (showLoading) setLoading(false);
      }
    });
    loadQueueRef.current = queued;
    return queued;
  }, []);

  useFocusEffect(
    useCallback(() => {
      const isInitial = !initialLoadDone.current;
      initialLoadDone.current = true;
      void loadProfile(isInitial);
    }, [dataVersion, loadProfile]),
  );

  const openOnboarding = useCallback(() => {
    navigation.getParent()?.getParent()?.navigate('Onboarding');
  }, [navigation]);

  if (loading && !profile && !target) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface items-center justify-center gap-3" edges={['top', 'left', 'right']} accessibilityLabel="Loading profile">
        <ActivityIndicator color={M3.primary} />
        <Text className="text-m3-on-surface-variant text-sm">Loading profile</Text>
      </SafeAreaView>
    );
  }

  if (readError) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface items-center justify-center px-6 gap-4" edges={['top', 'left', 'right']}>
        <MaterialIcons name="error-outline" size={32} color={M3.error} />
        <View className="gap-1">
          <Text className="text-m3-on-surface font-bold text-lg text-center">Profile could not load</Text>
          <Text className="text-m3-on-surface-variant text-sm text-center">Your plan data is still on this device. Try loading it again.</Text>
        </View>
        <View className="w-full max-w-[280px]"><PrimaryButton title="Retry" onPress={() => void loadProfile(true)} /></View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface items-center justify-center px-6 gap-4" edges={['top', 'left', 'right']}>
        <MaterialIcons name="person-outline" size={32} color={M3.onSurfaceVariant} />
        <View className="gap-1">
          <Text className="text-m3-on-surface font-bold text-lg text-center">No profile found</Text>
          <Text className="text-m3-on-surface-variant text-sm text-center">Complete onboarding to create your plan.</Text>
        </View>
        <View className="w-full max-w-[280px]"><PrimaryButton title="Start onboarding" onPress={openOnboarding} /></View>
      </SafeAreaView>
    );
  }

  if (!target) {
    return (
      <SafeAreaView className="flex-1 bg-m3-surface items-center justify-center px-6 gap-3" edges={['top', 'left', 'right']}>
        <MaterialIcons name="monitor-weight" size={32} color={M3.onSurfaceVariant} />
        <Text className="text-m3-on-surface font-bold text-lg text-center">No active nutrition target</Text>
        <Text className="text-m3-on-surface-variant text-sm text-center">Your profile is available, but a target has not been created for today.</Text>
      </SafeAreaView>
    );
  }

  const displayName = profile.display_name.trim() || 'Marco user';
  const targetWeight = profile.target_weight_kg == null
    ? 'No target weight'
    : `${fromKilograms(profile.target_weight_kg, profile.weight_unit).toFixed(1)} ${profile.weight_unit}`;

  return (
    <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1" contentContainerClassName="px-4 pt-6 pb-10 gap-6" showsVerticalScrollIndicator={false}>
        <View className="gap-1">
          <Text className="text-m3-on-surface text-2xl font-bold">Profile</Text>
          <Text className="text-m3-on-surface-variant text-sm">Plan and data</Text>
        </View>

        <Card className="overflow-hidden">
          <View className="p-5 gap-5">
            <View className="flex-row items-center gap-3">
              <View className="w-14 h-14 rounded-full bg-m3-primary items-center justify-center">
                <Text className="text-m3-on-primary font-bold text-base">{initialsFor(displayName)}</Text>
              </View>
              <View className="flex-1 min-w-0 gap-0.5">
                <Text className="text-m3-on-surface text-lg font-bold" numberOfLines={1}>{displayName}</Text>
                <Text className="text-m3-on-surface-variant text-sm" numberOfLines={1}>{goalLabel(profile)} · {weeklyRate(profile)}</Text>
                <Text className="text-m3-on-surface-variant text-xs tabular-nums" numberOfLines={1}>Target weight · {targetWeight}</Text>
              </View>
            </View>

            <View className="h-px bg-m3-outline-variant/50" />

            <View className="gap-4">
              <View className="gap-1">
                <Text className="text-m3-on-surface-variant text-xs font-semibold">Daily target</Text>
                <Text className="text-m3-on-surface text-3xl font-bold tabular-nums">{Math.round(target.target_calories).toLocaleString()} kcal</Text>
              </View>

              <View className="flex-row">
                <View className="flex-1 gap-1">
                  <Text className="text-m3-protein text-compact font-semibold">Protein</Text>
                  <Text className="text-m3-on-surface text-base font-bold tabular-nums">{Math.round(target.target_protein_g)}g</Text>
                </View>
                <View className="w-px bg-m3-outline-variant/50 mx-3" />
                <View className="flex-1 gap-1">
                  <Text className="text-m3-carbs text-compact font-semibold">Carbs</Text>
                  <Text className="text-m3-on-surface text-base font-bold tabular-nums">{Math.round(target.target_carbs_g)}g</Text>
                </View>
                <View className="w-px bg-m3-outline-variant/50 mx-3" />
                <View className="flex-1 gap-1">
                  <Text className="text-m3-fat text-compact font-semibold">Fat</Text>
                  <Text className="text-m3-on-surface text-base font-bold tabular-nums">{Math.round(target.target_fat_g)}g</Text>
                </View>
              </View>
            </View>
          </View>

          <View className="bg-m3-surface-container-high px-5 py-4 gap-3">
            <View className="flex-row justify-between gap-4">
              <View className="flex-1 gap-0.5">
                <Text className="text-m3-on-surface-variant text-xs font-medium">Target source</Text>
                <Text className="text-m3-on-surface text-xs font-semibold">{targetSource(target)}</Text>
              </View>
              <View className="items-end gap-0.5">
                <Text className="text-m3-on-surface-variant text-xs font-medium">Effective</Text>
                <Text className="text-m3-on-surface text-xs font-semibold tabular-nums">{formatDate(target.effective_date)}</Text>
              </View>
            </View>
            {adaptiveState && <Text className="text-m3-expenditure text-xs font-semibold">{adaptiveLabel(adaptiveState)}</Text>}
          </View>
        </Card>

        <View className="gap-6">
          <Section title="Plan">
            <ProfileSettingRow icon="person-outline" title="Personal details" detail={displayName} onPress={() => navigation.navigate('PersonalDetails')} />
            <ProfileSettingRow icon="flag" title="Goal and rate" detail={`${goalLabel(profile)} · ${weeklyRate(profile)}`} onPress={() => navigation.navigate('GoalAndRate')} />
            <ProfileSettingRow icon="restaurant-menu" title="Nutrition targets" detail={`${Math.round(target.target_calories).toLocaleString()} kcal · ${targetSource(target)}`} onPress={() => navigation.navigate('NutritionTargets')} />
            <ProfileSettingRow icon="straighten" title="Units" detail={profile.weight_unit === 'kg' ? 'Metric · kg and cm' : 'Imperial · lb and ft/in'} onPress={() => navigation.navigate('Units')} showDivider={false} />
          </Section>

          <Section title="Data & Sync">
            <ProfileSettingRow icon="backup" title="Backup and restore" detail="Local data stays on this device" disabled />
            <ProfileSettingRow icon="file-download" title="Export data" detail="No export file is available" disabled />
            <ProfileSettingRow icon="delete-outline" title="Delete all data" detail="No reset action is available" disabled showDivider={false} />
          </Section>

          <Section title="Help & About">
            <ProfileSettingRow icon="help-outline" title="How Marco works" detail="No help article is available" disabled />
            <ProfileSettingRow icon="privacy-tip" title="Privacy" detail="Your plan stays on this device" onPress={() => navigation.navigate('Privacy')} />
            <ProfileSettingRow icon="info-outline" title="About" detail="Marco for Android" showDivider={false} />
          </Section>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(ProfileScreen);
