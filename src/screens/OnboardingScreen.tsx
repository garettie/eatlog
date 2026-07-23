import React, { useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {

  Alert,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
 MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import RulerSlider from '../components/RulerSlider';
import TappableRow from '../components/TappableRow';
import type {
  ActivityLevel,
  GoalType,
  ProteinPreference,
  Sex,
} from '../db/database';
import {

  insertDailyTarget,
  insertProfile,
  insertWeightLog,
} from '../db/database';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {

  ageFromBirthDate,
  calcBMR,
  calcTDEE,
  calculateTargets,
  cmToFtIn,
  ftInToCm,
  kgToLbs,
  lbsToKg,
  todayISO,
} from '../utils/calculations';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;
type UnitSystem = 'metric' | 'imperial';

function StyledInput({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  maxLength,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  maxLength?: number;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#44474f"
      keyboardType={keyboardType}
      maxLength={maxLength}
      className="w-full bg-m3-surface-container-high text-m3-on-surface text-sm font-semibold rounded-xl px-4 py-3 outline-none border border-m3-outline-variant/40"
    />
  );
}

export default function OnboardingScreen({ navigation }: Props) {
  const [step, setStep] = useState(1);

  const [units, setUnits] = useState<UnitSystem>('metric');

  const [sex, setSex] = useState<Sex>('male');
  const [displayName, setDisplayName] = useState('');

  const [birthDate, setBirthDate] = useState<Date>(new Date(1995, 5, 15));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [heightCm, setHeightCm] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');

  const [weightKg, setWeightKg] = useState(80);
  const [weightLbs, setWeightLbs] = useState(176);

  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');

  const [goalType, setGoalType] = useState<GoalType>('maintain');
  const [goalRate, setGoalRate] = useState(0);
  const [targetWeightKg, setTargetWeightKg] = useState(80);
  const [targetWeightLbs, setTargetWeightLbs] = useState(176);

  const [proteinPreference, setProteinPreference] = useState<ProteinPreference>('moderate');

  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tdeeEstimate, setTdeeEstimate] = useState(0);
  const [computedTargets, setComputedTargets] = useState<{
    targetCalories: number;
    targetProteinG: number;
    targetFatG: number;
    targetCarbsG: number;
  } | null>(null);

  // ── Rate slider PanResponder ────────────────────────────────────────────

  const [rateSliderWidth, setRateSliderWidth] = useState(0);
  const rateDrag = useRef({ startVal: 0, startX: 0 });

  // ── Rate slider range per goal type ─────────────────────────────────────
  // Cut:  -1.0 to -0.1 kg/week  (sustainable loss range)
  // Bulk: +0.05 to +0.5 kg/week (lean bulk range)
  const RATE_RANGE = {
    cut: { min: -1.0, max: -0.1, defaultRate: -0.5 },
    bulk: { min: 0.05, max: 0.5, defaultRate: 0.25 },
  } as const;

  function getRateBounds() {
    if (goalType === 'cut') return { min: RATE_RANGE.cut.min, max: RATE_RANGE.cut.max };
    if (goalType === 'bulk') return { min: RATE_RANGE.bulk.min, max: RATE_RANGE.bulk.max };
    return { min: 0, max: 0 };
  }

  const ratePan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      rateDrag.current = { startVal: goalRate, startX: e.nativeEvent.pageX };
    },
    onPanResponderMove: (e) => {
      const { min, max } = getRateBounds();
      if (!rateSliderWidth || min === max) return;
      const dx = e.nativeEvent.pageX - rateDrag.current.startX;
      const frac = dx / rateSliderWidth;
      const delta = frac * (max - min);
      const direction = goalType === 'cut' ? -1 : 1;
      let newVal = rateDrag.current.startVal + delta * direction;
      newVal = Math.round(newVal / 0.05) * 0.05;
      newVal = Math.min(max, Math.max(min, newVal));
      setGoalRate(newVal);
    },
    onPanResponderRelease: () => {
      const { min, max } = getRateBounds();
      if (min === max) return;
      let snapped = Math.round(goalRate / 0.05) * 0.05;
      snapped = Math.min(max, Math.max(min, snapped));
      setGoalRate(snapped);
    },
  });

  // ── Unit switching ──────────────────────────────────────────────────────

  function switchUnits(newSystem: UnitSystem) {
    if (newSystem === units) return;
    if (newSystem === 'imperial') {
      const cm = parseFloat(heightCm);
      if (!isNaN(cm) && cm > 0) {
        const { feet, inches } = cmToFtIn(cm);
        setHeightFt(String(feet));
        setHeightIn(String(inches));
      }
      setWeightLbs(Math.round(kgToLbs(weightKg)));
      setTargetWeightLbs(Math.round(kgToLbs(targetWeightKg)));
    } else {
      const ft = parseFloat(heightFt) || 0;
      const inches = parseFloat(heightIn) || 0;
      if (ft > 0 || inches > 0) {
        setHeightCm(String(ftInToCm(ft, inches)));
      }
      setWeightKg(Math.round(lbsToKg(weightLbs)));
      setTargetWeightKg(Math.round(lbsToKg(targetWeightLbs)));
    }
    setUnits(newSystem);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function resolveHeightCm(): number {
    if (units === 'metric') return parseFloat(heightCm) || 0;
    return ftInToCm(parseFloat(heightFt) || 0, parseFloat(heightIn) || 0);
  }

  function resolveWeightKg(): number {
    return units === 'metric' ? weightKg : lbsToKg(weightLbs);
  }

  function resolveBirthDateISO(): string {
    const y = birthDate.getFullYear();
    const mo = String(birthDate.getMonth() + 1).padStart(2, '0');
    const da = String(birthDate.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }

  function isValidBirthDate(): boolean {
    const age = ageFromBirthDate(resolveBirthDateISO());
    return age >= 5 && age <= 125;
  }

  function validateStep(stepNum: number): string | null {
    switch (stepNum) {
      case 1:
        if (!displayName.trim()) return 'Please enter your name.';
        if (!isValidBirthDate()) return 'Please enter a valid birth date.';
        return null;
      case 2: {
        const h = resolveHeightCm();
        if (h < 50 || h > 280) return 'Height must be between 50 cm and 280 cm.';
        const w = resolveWeightKg();
        if (w < 20 || w > 500) return 'Weight must be between 20 kg and 500 kg.';
        return null;
      }
      default:
        return null;
    }
  }

  function handleGoalTypeChange(gt: GoalType) {
    setGoalType(gt);
    if (gt === 'maintain') {
      setGoalRate(0);
    } else if (gt === 'cut') {
      setGoalRate(RATE_RANGE.cut.defaultRate);
      setTargetWeightKg(Math.max(20, resolveWeightKg() - 5));
    } else {
      setGoalRate(RATE_RANGE.bulk.defaultRate);
      setTargetWeightKg(Math.min(500, resolveWeightKg() + 3));
    }
  }

  function handleNext() {
    const err = validateStep(step);
    if (err) {
      Alert.alert('Check your inputs', err);
      return;
    }
    if (step >= 5) return;
    setStep((s) => s + 1);
  }

  function handleBack() {
    if (step <= 1) return;
    if (step === 6) {
      setComputedTargets(null);
    }
    setStep((s) => s - 1);
  }

  async function handleCalculate() {
    setIsCalculating(true);
    try {
      const w = resolveWeightKg();
      const h = resolveHeightCm();
      const age = ageFromBirthDate(resolveBirthDateISO());
      const bmr = calcBMR({ sex, weight_kg: w, height_cm: h, age });
      const tdee = calcTDEE(bmr, activityLevel);
      setTdeeEstimate(Math.round(tdee));

      const targets = calculateTargets({
        tdeeKcal: tdee,
        goalType,
        proteinPreference,
        weightKg: w,
        goalRateKgPerWeek: goalRate,
      });
      setComputedTargets(targets);
      setStep(6);
    } finally {
      setIsCalculating(false);
    }
  }

  async function handleSave() {
    setIsSubmitting(true);
    try {
      const w = resolveWeightKg();
      const h = resolveHeightCm();
      const today = todayISO();

      await insertProfile({
        display_name: displayName.trim(),
        sex,
        height_cm: h,
        birth_date: resolveBirthDateISO(),
        activity_level: activityLevel,
        goal_type: goalType,
        goal_rate_kg_per_week: goalRate,
        protein_preference: proteinPreference,
      });

      await insertWeightLog({
        log_date: today,
        scale_weight_kg: w,
        trend_weight_kg: w,
      });

      await insertDailyTarget({
        effective_date: today,
        tdee_estimate: tdeeEstimate,
        target_calories: computedTargets!.targetCalories,
        target_protein_g: computedTargets!.targetProteinG,
        target_fat_g: computedTargets!.targetFatG,
        target_carbs_g: computedTargets!.targetCarbsG,
        calculation_method: 'initial_estimate',
      });

      navigation.replace('SetupComplete', {
        displayName: displayName.trim(),
        tdee: tdeeEstimate,
        targetCalories: computedTargets!.targetCalories,
        targetProtein: computedTargets!.targetProteinG,
        targetFat: computedTargets!.targetFatG,
        targetCarbs: computedTargets!.targetCarbsG,
      });
    } catch (err) {
      console.error('Save error:', err);
      Alert.alert('Something went wrong', 'Could not save your profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const weightMin = units === 'metric' ? 20 : 44;
  const weightMax = units === 'metric' ? 500 : 1100;
  const weightUnit = units === 'metric' ? 'kg' : 'lbs';

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1">
          {/* ── Step header — progress bar only ──────────────────────────── */}
          <View className="px-5 py-3 border-b border-m3-outline-variant/30 shrink-0">
            <View className="bg-m3-surface-container-highest h-3 rounded-full overflow-hidden">
              <View
                className="bg-white h-full rounded-full"
                style={{ width: `${(step / 6) * 100}%` }}
              />
            </View>
          </View>

        {/* ── Scrollable content ──────────────────────────────────────── */}
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-7 pb-8">
            {/* ══════════════════════════════════════════════════════════════
               STEP 1 — About You
             ══════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <>
              <Text className="text-xl font-bold text-m3-on-surface">About You</Text>

              <View className="gap-3">
                <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                  Biological Sex
                </Text>
                <View className="flex-row gap-4 bg-m3-surface-container p-1 rounded-2xl border border-m3-outline-variant/30">
                  <Pressable
                    onPress={() => setSex('male')}
                    className={`flex-1 py-5 rounded-xl flex-row items-center justify-center gap-2 ${
                      sex === 'male' ? 'bg-m3-primary-container' : ''
                    }`}
                  >
                    <MaterialIcons name="male" size={22} color={sex === 'male' ? '#ffffff' : '#c4c6d0'} />
                    <Text
                      className={`text-base ${
                        sex === 'male' ? 'font-semibold text-m3-on-primary-container' : 'font-medium text-m3-on-surface-variant'
                      }`}
                    >
                      Male
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSex('female')}
                    className={`flex-1 py-5 rounded-xl flex-row items-center justify-center gap-2 ${
                      sex === 'female' ? 'bg-m3-primary-container' : ''
                    }`}
                  >
                    <MaterialIcons name="female" size={22} color={sex === 'female' ? '#ffffff' : '#c4c6d0'} />
                    <Text
                      className={`text-base ${
                        sex === 'female' ? 'font-semibold text-m3-on-primary-container' : 'font-medium text-m3-on-surface-variant'
                      }`}
                    >
                      Female
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View className="bg-m3-surface-container p-7 rounded-2xl border border-m3-outline-variant/30 gap-4">
                <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider block">
                  Display Name
                </Text>
                <StyledInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="e.g. Alex"
                  maxLength={40}
                />
              </View>

              <View className="bg-m3-surface-container p-7 rounded-2xl border border-m3-outline-variant/30 gap-4">
                <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider block">
                  Birth Date
                </Text>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  className="w-full bg-m3-surface-container-high rounded-xl px-4 py-3 border border-m3-outline-variant/40"
                >
                  <Text className="text-m3-on-surface text-sm font-semibold">
                    {birthDate.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Text>
                </Pressable>
              </View>

              {/* Date picker — platform-aware */}
              {showDatePicker && Platform.OS === 'ios' && (
                <Modal transparent animationType="slide">
                  <Pressable
                    className="flex-1"
                    onPress={() => setShowDatePicker(false)}
                  />
                  <View className="bg-m3-surface-container rounded-t-2xl pb-6">
                    <View className="flex-row justify-end px-4 py-2">
                      <Pressable onPress={() => setShowDatePicker(false)}>
                        <Text className="text-m3-primary font-semibold text-xs">Done</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={birthDate}
                      mode="date"
                      display="spinner"
                      maximumDate={new Date()}
                      themeVariant="dark"
                      onChange={(_event: any, date?: Date) => {
                        if (date) setBirthDate(date);
                      }}
                    />
                  </View>
                </Modal>
              )}
              {showDatePicker && Platform.OS === 'android' && (
                <DateTimePicker
                  value={birthDate}
                  mode="date"
                  display="default"
                  maximumDate={new Date()}
                  onChange={(event: any, date?: Date) => {
                    setShowDatePicker(false);
                    if (event.type === 'set' && date) setBirthDate(date);
                  }}
                />
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
             STEP 2 — Height & Weight
             ══════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <>
              <Text className="text-xl font-bold text-m3-on-surface">Height & Weight</Text>

              {/* Unit toggle */}
              <View className="flex-row gap-4 bg-m3-surface-container p-1 rounded-2xl border border-m3-outline-variant/30">
                {(['metric', 'imperial'] as const).map((u) => (
                  <Pressable
                    key={u}
                    onPress={() => switchUnits(u)}
                    className={`flex-1 py-5 rounded-xl items-center ${
                      units === u ? 'bg-m3-primary-container' : ''
                    }`}
                  >
                    <Text
                      className={`text-base font-semibold ${
                        units === u ? 'text-m3-on-primary-container' : 'text-m3-on-surface-variant'
                      }`}
                    >
                      {u === 'metric' ? 'Metric (kg/cm)' : 'Imperial (lbs/ft)'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View className="bg-m3-surface-container p-7 rounded-2xl border border-m3-outline-variant/30 gap-4">
                <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider block">
                  Height
                </Text>
                <View className="flex-row items-center gap-4">
                  {units === 'metric' ? (
                    <>
                      <TextInput
                        value={heightCm}
                        onChangeText={setHeightCm}
                        placeholder="180"
                        placeholderTextColor="#44474f"
                        keyboardType="decimal-pad"
                        className="flex-1 min-w-0 bg-m3-surface-container-high text-m3-on-surface text-lg font-bold tabular-nums rounded-xl px-4 py-3 outline-none border border-m3-outline-variant/40"
                      />
                      <Text className="text-sm font-semibold text-m3-on-surface-variant bg-m3-surface-container-high px-4 py-3 rounded-xl shrink-0">
                        cm
                      </Text>
                    </>
                  ) : (
                    <>
                      <TextInput
                        value={heightFt}
                        onChangeText={setHeightFt}
                        placeholder="5"
                        placeholderTextColor="#44474f"
                        keyboardType="numeric"
                        maxLength={1}
                        className="flex-1 min-w-0 bg-m3-surface-container-high text-m3-on-surface text-lg font-bold tabular-nums rounded-xl px-4 py-3 outline-none border border-m3-outline-variant/40"
                      />
                      <Text className="text-sm font-semibold text-m3-on-surface-variant shrink-0">ft</Text>
                      <TextInput
                        value={heightIn}
                        onChangeText={setHeightIn}
                        placeholder="11"
                        placeholderTextColor="#44474f"
                        keyboardType="numeric"
                        maxLength={2}
                        className="flex-1 min-w-0 bg-m3-surface-container-high text-m3-on-surface text-lg font-bold tabular-nums rounded-xl px-4 py-3 outline-none border border-m3-outline-variant/40"
                      />
                      <Text className="text-sm font-semibold text-m3-on-surface-variant shrink-0">in</Text>
                    </>
                  )}
                </View>
              </View>

              <View className="bg-m3-surface-container p-7 rounded-2xl border border-m3-outline-variant/30 gap-5">
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                    Starting Scale Weight
                  </Text>
                  <Text className="text-sm text-m3-primary font-medium">Initial Reading</Text>
                </View>
                <RulerSlider
                  value={units === 'metric' ? weightKg : weightLbs}
                  onValueChange={(v) => {
                    if (units === 'metric') {
                      setWeightKg(v);
                      setWeightLbs(Math.round(kgToLbs(v)));
                    } else {
                      setWeightLbs(v);
                      setWeightKg(Math.round(lbsToKg(v)));
                    }
                  }}
                  min={weightMin}
                  max={weightMax}
                  step={0.1}
                  unit={weightUnit}
                />
              </View>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
             STEP 3 — Activity Level
             ══════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <>
              <Text className="text-xl font-bold text-m3-on-surface">Activity Level</Text>

              <View className="gap-4">
                <TappableRow
                  icon="weekend"
                  title="Sedentary"
                  subtitle="Desk job, little formal exercise"
                  selected={activityLevel === 'sedentary'}
                  onPress={() => setActivityLevel('sedentary')}
                />
                <TappableRow
                  icon="directions-walk"
                  title="Light"
                  subtitle="Light exercise 1-3 days/week"
                  selected={activityLevel === 'light'}
                  onPress={() => setActivityLevel('light')}
                />
                <TappableRow
                  icon="directions-run"
                  title="Moderate"
                  subtitle="3-5 workouts/week, active day"
                  selected={activityLevel === 'moderate'}
                  onPress={() => setActivityLevel('moderate')}
                />
                <TappableRow
                  icon="fitness-center"
                  title="Active"
                  subtitle="6-7 workouts or physical job"
                  selected={activityLevel === 'active'}
                  onPress={() => setActivityLevel('active')}
                />
                <TappableRow
                  icon="whatshot"
                  title="Very Active"
                  subtitle="Physical job + daily training"
                  selected={activityLevel === 'very_active'}
                  onPress={() => setActivityLevel('very_active')}
                />
              </View>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
             STEP 4 — Goal & Target Rate
             ══════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <>
              <Text className="text-xl font-bold text-m3-on-surface">Goal & Target Rate</Text>

              <View className="gap-3">
                <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                  Primary Goal
                </Text>
                <View className="flex-row gap-4">
                  {/* Cut tile */}
                  <Pressable
                    onPress={() => handleGoalTypeChange('cut')}
                    className={`flex-1 p-5 rounded-2xl items-center gap-1 ${
                      goalType === 'cut'
                        ? 'bg-m3-surface-container-high border-2 border-white'
                        : 'bg-m3-surface-container border border-m3-outline-variant/30'
                    }`}
                  >
                    <MaterialIcons
                      name="trending-down"
                      size={24}
                      color={goalType === 'cut' ? '#ffffff' : '#c4c6d0'}
                    />
                    <Text
                      className={`font-bold text-base ${
                        goalType === 'cut' ? 'text-white' : 'text-m3-on-surface'
                      }`}
                    >
                      Cut
                    </Text>
                    <Text className="text-sm text-m3-on-surface-variant">Weight Loss</Text>
                  </Pressable>

                  {/* Maintain tile */}
                  <Pressable
                    onPress={() => handleGoalTypeChange('maintain')}
                    className={`flex-1 p-5 rounded-2xl items-center gap-1 ${
                      goalType === 'maintain'
                        ? 'bg-m3-surface-container-high border-2 border-white'
                        : 'bg-m3-surface-container border border-m3-outline-variant/30'
                    }`}
                  >
                    <MaterialIcons
                      name="drag-handle"
                      size={24}
                      color={goalType === 'maintain' ? '#ffffff' : '#c4c6d0'}
                    />
                    <Text
                      className={`font-bold text-base ${
                        goalType === 'maintain' ? 'text-white' : 'text-m3-on-surface'
                      }`}
                    >
                      Maintain
                    </Text>
                    <Text className="text-sm text-m3-on-surface-variant">Stay Steady</Text>
                  </Pressable>

                  {/* Bulk tile */}
                  <Pressable
                    onPress={() => handleGoalTypeChange('bulk')}
                    className={`flex-1 p-5 rounded-2xl items-center gap-1 ${
                      goalType === 'bulk'
                        ? 'bg-m3-surface-container-high border-2 border-white'
                        : 'bg-m3-surface-container border border-m3-outline-variant/30'
                    }`}
                  >
                    <MaterialIcons
                      name="trending-up"
                      size={24}
                      color={goalType === 'bulk' ? '#ffffff' : '#c4c6d0'}
                    />
                    <Text
                      className={`font-bold text-base ${
                        goalType === 'bulk' ? 'text-white' : 'text-m3-on-surface'
                      }`}
                    >
                      Bulk
                    </Text>
                    <Text className="text-sm text-m3-on-surface-variant">Gain Muscle</Text>
                  </Pressable>
                </View>
              </View>

              {goalType !== 'maintain' && (
                <>
                  {/* Target Weight — same ruler as step 2 */}
                  <View className="bg-m3-surface-container p-7 rounded-2xl border border-m3-outline-variant/30 gap-5">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                        Target Weight
                      </Text>
                      <Text className="text-sm text-m3-primary font-medium">Goal Weight</Text>
                    </View>
                    <RulerSlider
                      value={units === 'metric' ? targetWeightKg : targetWeightLbs}
                      onValueChange={(v) => {
                        if (units === 'metric') {
                          setTargetWeightKg(v);
                          setTargetWeightLbs(Math.round(kgToLbs(v)));
                        } else {
                          setTargetWeightLbs(v);
                          setTargetWeightKg(Math.round(lbsToKg(v)));
                        }
                      }}
                      min={weightMin}
                      max={weightMax}
                      step={0.1}
                      unit={weightUnit}
                    />
                  </View>

                  {/* Target Rate — custom PanResponder slider */}
                  <View className="bg-m3-surface-container p-7 rounded-2xl border border-m3-outline-variant/30 gap-5">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                        Target Rate
                      </Text>
                      <Text
                        className={`text-sm font-bold tabular-nums ${
                          goalType === 'cut' ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {goalRate >= 0 ? '+' : ''}{goalRate.toFixed(2)} kg / week
                      </Text>
                    </View>
                    <View
                      className="relative h-8 justify-center"
                      onLayout={(e) => setRateSliderWidth(e.nativeEvent.layout.width)}
                      {...ratePan.panHandlers}
                    >
                      <View className="w-full h-2 rounded-full bg-m3-surface-container-highest" />
                      <View
                        style={{
                          position: 'absolute',
                          left: rateSliderWidth > 0
                            ? goalType === 'cut'
                              ? (((goalType === 'cut' ? RATE_RANGE.cut.max : RATE_RANGE.cut.max) - goalRate) /
                                 ((goalType === 'cut' ? RATE_RANGE.cut.max : RATE_RANGE.cut.max) -
                                  (goalType === 'cut' ? RATE_RANGE.cut.min : RATE_RANGE.cut.min))) *
                                 rateSliderWidth - 8
                              : ((goalRate - RATE_RANGE.bulk.min) /
                                 (RATE_RANGE.bulk.max - RATE_RANGE.bulk.min)) *
                                 rateSliderWidth - 8
                            : 0,
                          top: 8,
                        }}
                        pointerEvents="none"
                      >
                        <View className="w-4 h-4 rounded-full bg-white border-2 border-black shadow" />
                      </View>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-base text-m3-on-surface-variant font-medium">
                        Slow
                      </Text>
                      <Text className="text-base text-m3-on-surface-variant font-medium">
                        Fast
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
             STEP 5 — Protein Preference
             ══════════════════════════════════════════════════════════════ */}
          {step === 5 && (
            <>
              <Text className="text-xl font-bold text-m3-on-surface">Preferred Protein Intake</Text>

              <View className="gap-4">
                {/* Low — uses MaterialCommunityIcons egg */}
                <Pressable
                  onPress={() => setProteinPreference('low')}
                  className={`flex-row items-center p-7 rounded-2xl gap-3 ${
                    proteinPreference === 'low'
                      ? 'bg-m3-surface-container-high border-2 border-white'
                      : 'bg-m3-surface-container border border-m3-outline-variant/30'
                  }`}
                >
                  <View className="shrink-0">
                    <MaterialCommunityIcons
                      name="egg"
                      size={22}
                      color={proteinPreference === 'low' ? '#ffffff' : '#c4c6d0'}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`font-semibold text-base ${
                        proteinPreference === 'low' ? 'text-white' : 'text-m3-on-surface'
                      }`}
                    >
                      Low
                    </Text>
                    <Text className="text-sm text-m3-on-surface-variant">Bottom of the recommended range</Text>
                  </View>
                  {proteinPreference === 'low' ? (
                    <View className="w-4 h-4 rounded-full bg-white items-center justify-center shrink-0 ml-3">
                      <View className="w-2 h-2 rounded-full bg-black" />
                    </View>
                  ) : (
                    <View className="w-4 h-4 rounded-full border border-m3-outline shrink-0 ml-3" />
                  )}
                </Pressable>

                <TappableRow
                  icon="restaurant"
                  title="Moderate"
                  subtitle="Middle of the recommended range"
                  selected={proteinPreference === 'moderate'}
                  onPress={() => setProteinPreference('moderate')}
                />
                <TappableRow
                  icon="fastfood"
                  title="High"
                  subtitle="Top of the recommended range"
                  selected={proteinPreference === 'high'}
                  onPress={() => setProteinPreference('high')}
                />
                <TappableRow
                  icon="fitness-center"
                  title="Extra High"
                  subtitle="Above the typical range"
                  selected={proteinPreference === 'extra_high'}
                  onPress={() => setProteinPreference('extra_high')}
                />
              </View>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
             STEP 6 — Recommendations
             ══════════════════════════════════════════════════════════════ */}
          {step === 6 && computedTargets && (
            <>
              {/* Success header */}
              <View className="items-center mb-4">
                <View className="w-18 h-18 rounded-full bg-m3-primary-container items-center justify-center mb-4">
                  <MaterialIcons name="check" size={36} color="#ffffff" />
                </View>
                <Text className="text-xl font-bold text-m3-on-surface text-center mb-1">
                  You're all set, {displayName || 'there'}!
                </Text>
                <Text className="text-sm text-m3-on-surface-variant text-center">
                  Your metabolic plan has been calculated and saved.
                </Text>
              </View>

              {/* Calorie target */}
              <View className="bg-m3-surface-container-high p-6 rounded-3xl border border-m3-outline-variant/30 items-center gap-1">
                <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                  Daily Calorie Target
                </Text>
                <Text className="text-4xl font-bold text-white tabular-nums">
                  {computedTargets.targetCalories.toLocaleString()}
                </Text>
                <Text className="text-sm text-m3-on-surface-variant">kcal / day</Text>
                <View className="flex-row justify-between w-full mt-2">
                  <Text className="text-sm text-m3-on-surface-variant">TDEE estimate</Text>
                  <Text className="text-sm text-m3-expenditure font-bold tabular-nums">
                    {tdeeEstimate.toLocaleString()} kcal
                  </Text>
                </View>
              </View>

              {/* Macro grid */}
              <View className="flex-row gap-4">
                {[
                  { label: 'Protein', grams: computedTargets.targetProteinG, textColor: 'text-m3-protein', cpg: 4 },
                  { label: 'Fat', grams: computedTargets.targetFatG, textColor: 'text-m3-fat', cpg: 9 },
                  { label: 'Carbs', grams: computedTargets.targetCarbsG, textColor: 'text-m3-carbs', cpg: 4 },
                ].map((m) => {
                  const kcal = Math.round(m.grams * m.cpg);
                  const pct = Math.round((kcal / computedTargets.targetCalories) * 100);
                  return (
                    <View key={m.label} className="flex-1 bg-m3-surface-container p-5 rounded-2xl gap-1">
                      <Text className={`text-sm font-semibold ${m.textColor} block`}>{m.label}</Text>
                      <Text className="font-bold text-lg text-m3-on-surface tabular-nums block">{Math.round(m.grams)}g</Text>
                      <Text className="text-sm text-m3-on-surface-variant block">{kcal} kcal ({pct}%)</Text>
                    </View>
                  );
                })}
              </View>

              {/* Adaptive engine card */}
              <View className="bg-m3-surface-container p-7 rounded-2xl border border-m3-outline-variant/30 gap-3">
                <View className="flex-row items-center gap-3">
                  <MaterialIcons name="autorenew" size={18} color="#34d399" />
                  <Text className="text-sm font-semibold text-white">Adaptive Recalibration Engine</Text>
                </View>
                <Text className="text-sm text-m3-on-surface-variant leading-relaxed">
                  This starting target is calculated using the Mifflin-St Jeor formula, then updates
                  automatically every week once 14 daily logs and weight trend data are gathered.
                </Text>
              </View>
            </>
          )}
          </View>
        </ScrollView>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <View className="p-7 bg-m3-surface-container-low border-t border-m3-outline-variant/40 shrink-0">
          {step === 1 && (
            <PrimaryButton title="Continue" icon="arrow-forward" onPress={handleNext} />
          )}
          {step > 1 && step < 5 && (
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleBack}
                className="bg-m3-surface-container border border-m3-outline-variant/40 rounded-full py-5 px-6 flex-row items-center justify-center gap-2 active:opacity-70"
              >
                <MaterialIcons name="arrow-back" size={18} color="#e2e2e9" />
                <Text className="text-m3-on-surface font-semibold text-base">Back</Text>
              </Pressable>
              <View className="flex-1">
                <PrimaryButton title="Continue" icon="arrow-forward" onPress={handleNext} />
              </View>
            </View>
          )}
          {step === 5 && (
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleBack}
                className="bg-m3-surface-container border border-m3-outline-variant/40 rounded-full py-5 px-6 flex-row items-center justify-center gap-2 active:opacity-70"
              >
                <MaterialIcons name="arrow-back" size={18} color="#e2e2e9" />
                <Text className="text-m3-on-surface font-semibold text-base">Back</Text>
              </Pressable>
              <View className="flex-1">
                <PrimaryButton
                  title="Calculate"
                  icon="auto-awesome"
                  onPress={handleCalculate}
                  loading={isCalculating}
                />
              </View>
            </View>
          )}
          {step === 6 && (
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleBack}
                className="bg-m3-surface-container border border-m3-outline-variant/40 rounded-full py-5 px-6 flex-row items-center justify-center gap-2 active:opacity-70"
              >
                <MaterialIcons name="arrow-back" size={18} color="#e2e2e9" />
                <Text className="text-m3-on-surface font-semibold text-base">Back</Text>
              </Pressable>
              <View className="flex-1">
                <PrimaryButton
                  title="Save Profile & Start Tracking"
                  icon="check-circle"
                  iconPosition="left"
                  onPress={handleSave}
                  loading={isSubmitting}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>
);
}
