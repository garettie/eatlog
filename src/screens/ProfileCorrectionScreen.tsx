import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import GoalRateControl from '../components/GoalRateControl';
import GoalTypeSelector from '../components/GoalTypeSelector';
import PrimaryButton from '../components/PrimaryButton';
import { getLatestWeightLogOnOrBefore, getProfile, type DailyTargetInput, type GoalType, type Profile, type ProfileUpdate, updateProfileAndPlan } from '../db/database';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useDataMaintenance } from '../context/DataMaintenanceContext';
import { deleteEatlogHealthConnectWeights } from '../services/healthConnect';
import { exportData } from '../services/dataExport';
import { resetLocalData } from '../services/dataReset';
import { supportsHealthConnect } from '../services/platformFeatures';
import { M3 } from '../theme/tokens';
import { ageFromBirthDate, calcBMR, calcTDEE, calculateTargets } from '../utils/calculations';
import { todayISO } from '../utils/calendar';
import { profileSafetyIssues, ESTIMATE_DISCLAIMER, NUTRITION_SAFETY_POLICY, validateTarget, validateWeightKg, WELLNESS_DISCLAIMER } from '../utils/nutritionSafety';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileCorrection'>;

function Field({ label, value, onChangeText, keyboardType = 'default' }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold text-m3-on-surface-variant">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={M3.placeholder}
        underlineColorAndroid="transparent"
        className="min-h-[48px] rounded-xl border border-m3-outline-variant/40 bg-m3-surface-container-high px-4 text-sm font-semibold text-m3-on-surface"
      />
    </View>
  );
}

function profileUpdate(profile: Profile, values: {
  birthDate: string;
  heightCm: number;
  goal: GoalType;
  targetWeightKg: number | null;
  rateKgPerWeek: number;
}): ProfileUpdate {
  return {
    display_name: profile.display_name,
    sex: profile.sex,
    height_cm: values.heightCm,
    birth_date: values.birthDate,
    activity_level: profile.activity_level,
    goal_type: values.goal,
    goal_rate_kg_per_week: values.goal === 'maintain' ? 0 : values.rateKgPerWeek,
    protein_preference: profile.protein_preference,
    weight_unit: profile.weight_unit,
    target_weight_kg: values.targetWeightKg,
  };
}

export default function ProfileCorrectionScreen({ navigation }: Props) {
  const { runDataMaintenance } = useDataMaintenance();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [goal, setGoal] = useState<GoalType>('maintain');
  const [targetWeightKg, setTargetWeightKg] = useState('');
  const [rateKgPerWeek, setRateKgPerWeek] = useState(0);
  const [issues, setIssues] = useState<string[]>([]);
  const [pending, setPending] = useState<{ profile: ProfileUpdate; target: DailyTargetInput } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const tdeeKcal = useMemo(() => {
    if (!profile || currentWeightKg == null) return null;
    try {
      return calcTDEE(calcBMR({ sex: profile.sex, weight_kg: currentWeightKg, height_cm: Number(heightCm), age: ageFromBirthDate(birthDate) }), profile.activity_level);
    } catch {
      return null;
    }
  }, [profile, currentWeightKg, heightCm, birthDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextProfile = await getProfile();
      if (!nextProfile) throw new Error('Profile is unavailable.');
      const weight = await getLatestWeightLogOnOrBefore(todayISO());
      const nextWeight = weight?.trend_weight_kg != null && !validateWeightKg(weight.trend_weight_kg, 'Trend weight')
        ? weight.trend_weight_kg
        : weight?.scale_weight_kg != null && !validateWeightKg(weight.scale_weight_kg, 'Scale weight')
          ? weight.scale_weight_kg
          : null;
      setProfile(nextProfile);
      setCurrentWeightKg(nextWeight);
      setBirthDate(nextProfile.birth_date);
      setHeightCm(String(nextProfile.height_cm));
      setGoal(nextProfile.goal_type);
      setTargetWeightKg(nextProfile.target_weight_kg == null ? '' : String(nextProfile.target_weight_kg));
      setRateKgPerWeek(nextProfile.goal_rate_kg_per_week);
      setIssues(profileSafetyIssues(nextProfile, { currentWeightKg: nextWeight, requireCurrentWeight: true }));
    } catch (error) {
      setIssues([error instanceof Error ? error.message : 'Could not load the profile.']);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const preparePlan = useCallback(() => {
    if (!profile) return;
    const next = profileUpdate(profile, {
      birthDate: birthDate.trim(),
      heightCm: Number(heightCm.trim()),
      goal,
      targetWeightKg: goal === 'maintain' ? currentWeightKg : Number(targetWeightKg.trim()),
      rateKgPerWeek,
    });
    const nextIssues = profileSafetyIssues(next, { currentWeightKg, requireCurrentWeight: true });
    if (nextIssues.length > 0) {
      setIssues(nextIssues);
      setPending(null);
      return;
    }
    if (currentWeightKg == null) {
      setIssues(['Add a valid weight check-in before calculating a replacement plan.']);
      return;
    }
    try {
      const tdee = calcTDEE(calcBMR({
        sex: next.sex,
        weight_kg: currentWeightKg,
        height_cm: next.height_cm,
        age: ageFromBirthDate(next.birth_date),
      }), next.activity_level);
      const macros = calculateTargets({
        tdeeKcal: tdee,
        goalType: next.goal_type,
        proteinPreference: next.protein_preference,
        weightKg: currentWeightKg,
        goalRateKgPerWeek: next.goal_rate_kg_per_week,
      });
      const target: DailyTargetInput = {
        effective_date: todayISO(),
        tdee_estimate: Math.round(tdee),
        target_calories: macros.targetCalories,
        target_protein_g: macros.targetProteinG,
        target_fat_g: macros.targetFatG,
        target_carbs_g: macros.targetCarbsG,
        calculation_method: 'profile_recalculation',
      };
      const targetIssue = validateTarget(target, { goalType: next.goal_type, referenceWeightKg: currentWeightKg });
      if (targetIssue) throw new Error(targetIssue);
      setIssues([]);
      setMessage(null);
      setPending({ profile: next, target });
    } catch (error) {
      setPending(null);
      setIssues([error instanceof Error ? error.message : 'Could not calculate a safe replacement plan.']);
    }
  }, [birthDate, currentWeightKg, goal, heightCm, profile, rateKgPerWeek, targetWeightKg]);

  const applyPlan = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await updateProfileAndPlan(pending);
      navigation.replace('Tabs');
    } catch (error) {
      setIssues([error instanceof Error ? error.message : 'Could not save the corrected plan.']);
    } finally {
      setBusy(false);
    }
  }, [navigation, pending]);

  const exportBlockedData = useCallback(async () => {
    setBusy(true);
    try {
      const result = await exportData();
      setMessage(result.summary);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not export your data.');
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteAllData = useCallback(() => {
    const confirmLocalDeletion = () => {
      Alert.alert('Final confirmation', 'Delete all local Eatlog data now? This cannot be undone.', [
        { text: 'Keep my data', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: () => { void runDataMaintenance('Deleting all data', resetLocalData).catch(() => { }); } },
      ]);
    };
    Alert.alert('Delete all Eatlog data?', 'This erases your profile, logs, targets, reviews, and meal photos from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => {
          if (!supportsHealthConnect(Platform.OS)) {
            confirmLocalDeletion();
            return;
          }
          void deleteEatlogHealthConnectWeights().then((healthResult) => {
            const detail = healthResult.warning
              ? `${healthResult.warning}\n\nDelete all local Eatlog data anyway?`
              : 'Delete all local Eatlog data now? This cannot be undone.';
            Alert.alert('Final confirmation', detail, [
              { text: 'Keep my data', style: 'cancel' },
              { text: 'Delete everything', style: 'destructive', onPress: () => { void runDataMaintenance('Deleting all data', resetLocalData).catch(() => { }); } },
            ]);
          }).catch(() => {
            Alert.alert('Could not check Health Connect', 'Delete all local Eatlog data anyway?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete local data', style: 'destructive', onPress: () => { void runDataMaintenance('Deleting all data', resetLocalData).catch(() => { }); } },
            ]);
          });
        },
      },
    ]);
  }, [runDataMaintenance]);

  if (loading) {
    return <SafeAreaView className="flex-1 items-center justify-center bg-m3-surface"><ActivityIndicator color={M3.primary} /><Text className="mt-3 text-sm text-m3-on-surface-variant">Checking profile safety</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <ScrollView contentContainerClassName="gap-5 p-6">
        <View className="gap-2">
          <Text className="text-2xl font-bold text-m3-on-surface">Profile correction required</Text>
          <Text className="text-sm leading-5 text-m3-on-surface-variant">Eatlog paused target calculations because existing profile data is outside its supported safety range. Your logs remain on this device.</Text>
        </View>
        <Card className="gap-3 border border-m3-error/40 p-5">
          <Text className="text-sm leading-5 text-m3-error">{WELLNESS_DISCLAIMER}</Text>
        </Card>
        {issues.length > 0 ? <Card className="gap-2 border border-m3-error/40 p-5"><Text className="text-sm font-semibold text-m3-error">Fix these details before continuing</Text>{issues.map((issue) => <Text key={issue} className="text-sm leading-5 text-m3-on-surface-variant">{issue}</Text>)}</Card> : null}
        {profile ? (
          <Card className="gap-4 p-5">
            <Field label="Birth date (YYYY-MM-DD)" value={birthDate} onChangeText={setBirthDate} />
            <Field label="Height (cm)" value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
            <GoalTypeSelector value={goal} onChange={setGoal} />
            {goal !== 'maintain' ? <Field label="Target weight (kg)" value={targetWeightKg} onChangeText={setTargetWeightKg} keyboardType="decimal-pad" /> : null}
            {goal !== 'maintain' && currentWeightKg != null ? <GoalRateControl goal={goal} valueKgPerWeek={rateKgPerWeek} onValueChange={setRateKgPerWeek} weightUnit="kg" currentWeightKg={currentWeightKg} tdeeKcal={tdeeKcal} /> : null}
            <PrimaryButton title="Review corrected plan" onPress={preparePlan} disabled={busy} />
          </Card>
        ) : null}
        {pending ? (
          <Card className="gap-3 p-5">
            <Text className="text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant">Proposed replacement target</Text>
            <Text className="text-3xl font-bold tabular-nums text-m3-on-surface">{pending.target.target_calories.toLocaleString()} kcal/day</Text>
            <Text className="text-sm tabular-nums text-m3-on-surface-variant">Protein {pending.target.target_protein_g}g · Carbs {pending.target.target_carbs_g}g · Fat {pending.target.target_fat_g}g</Text>
            <Text className="text-xs leading-4 text-m3-on-surface-variant">{ESTIMATE_DISCLAIMER}</Text>
            <PrimaryButton title="Apply corrected plan" onPress={() => void applyPlan()} loading={busy} />
          </Card>
        ) : null}
        {message ? <Text className="text-sm text-m3-on-surface-variant">{message}</Text> : null}
        <View className="gap-3">
          <PrimaryButton title="Export my data" icon="file-download" onPress={() => void exportBlockedData()} disabled={busy} />
          <PrimaryButton title="Delete all data" icon="delete-outline" onPress={deleteAllData} disabled={busy} />
        </View>
        <Text className="text-xs leading-4 text-m3-on-surface-variant">Supported adults: {NUTRITION_SAFETY_POLICY.minimumAge}–{NUTRITION_SAFETY_POLICY.maximumAge}. Export is readable CSV and cannot restore data.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
