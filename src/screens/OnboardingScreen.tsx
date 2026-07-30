import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Reanimated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import DateSelector from '../components/DateSelector';
import PrimaryButton from '../components/PrimaryButton';
import RulerSlider from '../components/RulerSlider';
import SegmentedControl from '../components/SegmentedControl';
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
  saveWeightLog,
} from '../db/database';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { M3 } from '../theme/tokens';
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

const TOTAL_STEPS = 6;

function yearsAgo(date: Date, years: number): Date {
  const year = date.getFullYear() - years;
  const day = Math.min(
    date.getDate(),
    new Date(year, date.getMonth() + 1, 0).getDate()
  );
  return new Date(year, date.getMonth(), day);
}

const TODAY = new Date();
const LATEST_BIRTH_DATE = yearsAgo(TODAY, 5);
const EARLIEST_BIRTH_DATE = new Date(yearsAgo(TODAY, 126));
EARLIEST_BIRTH_DATE.setDate(EARLIEST_BIRTH_DATE.getDate() + 1);

function StyledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  maxLength,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  maxLength?: number;
  autoFocus?: boolean;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={M3.placeholder}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoFocus={autoFocus}
      className="w-full bg-m3-surface-container-high text-m3-on-surface text-sm font-semibold rounded-xl px-4 py-3 outline-none border border-m3-outline-variant/40"
    />
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-m3-surface-container border border-m3-outline-variant/40 rounded-full py-5 px-6 flex-row items-center justify-center gap-2 active:opacity-70"
    >
      <MaterialIcons name="arrow-back" size={18} color="#e2e2e9" />
      <Text className="text-m3-on-surface font-semibold text-base">Back</Text>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
      {children}
    </Text>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-2xl font-bold text-m3-on-surface">{title}</Text>
      <Text className="text-sm text-m3-on-surface-variant">{subtitle}</Text>
    </View>
  );
}

const CALC_LINES = [
  'Estimating BMR (Mifflin-St Jeor)',
  'Projecting daily expenditure',
  'Applying goal adjustment',
  'Balancing protein, fat, carbs',
];

export default function OnboardingScreen({ navigation }: Props) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);

  const [units, setUnits] = useState<UnitSystem>('metric');

  const [sex, setSex] = useState<Sex>('male');
  const [displayName, setDisplayName] = useState('');

  const [birthDate, setBirthDate] = useState<Date>(new Date(1995, 5, 15));
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Height is canonical in cm; imperial surfaces derive inches from it.
  const [heightCm, setHeightCm] = useState(178);
  const [heightCmText, setHeightCmText] = useState('178');
  const [heightFtText, setHeightFtText] = useState('5');
  const [heightInText, setHeightInText] = useState('10');

  const [weightKg, setWeightKg] = useState(80);
  const [weightLbs, setWeightLbs] = useState(176);
  const [weightText, setWeightText] = useState('80.0');

  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');

  const [goalType, setGoalType] = useState<GoalType>('maintain');
  const [goalRate, setGoalRate] = useState(0);
  const [targetWeightKg, setTargetWeightKg] = useState(80);
  const [targetWeightLbs, setTargetWeightLbs] = useState(176);
  const [targetWeightText, setTargetWeightText] = useState('80.0');

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

  const scrollRef = useRef<ScrollView>(null);

  // ── Step transition (direction-aware slide + fade on the UI thread) ─────

  const animX = useSharedValue(0);
  const animOpacity = useSharedValue(1);
  const stepTransitioningRef = useRef(false);
  const stepDirectionRef = useRef(1);

  function resetScroll() {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function finishStepTransition() {
    stepTransitioningRef.current = false;
  }

  function commitStep(next: number, direction: number) {
    stepDirectionRef.current = direction;
    setStep(next);
    resetScroll();
  }

  useLayoutEffect(() => {
    if (!stepTransitioningRef.current) return;
    const direction = stepDirectionRef.current;
    animX.value = 28 * direction;
    animOpacity.value = 0;
    animX.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
    animOpacity.value = withTiming(1, { duration: 200 }, (finished) => {
      if (finished) runOnJS(finishStepTransition)();
    });
  }, [step]);

  function goToStep(next: number) {
    if (next === step || stepTransitioningRef.current) return;
    setStepError(null);
    if (reduced) {
      setStep(next);
      resetScroll();
      return;
    }
    stepTransitioningRef.current = true;
    const dir = next > step ? 1 : -1;
    animX.value = withTiming(-28 * dir, { duration: 110, easing: Easing.in(Easing.quad) });
    animOpacity.value = withTiming(0, { duration: 110 }, (finished) => {
      if (finished) runOnJS(commitStep)(next, dir);
      else runOnJS(finishStepTransition)();
    });
  }

  const stepAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: animX.value }],
    opacity: animOpacity.value,
  }));

  // ── Animated progress bar ───────────────────────────────────────────────

  const [progressTrackW, setProgressTrackW] = useState(0);
  const progress = useSharedValue(1 / TOTAL_STEPS);
  useEffect(() => {
    progress.value = withTiming(step / TOTAL_STEPS, { duration: reduced ? 0 : 300 });
  }, [step]);
  const progressStyle = useAnimatedStyle(() => ({
    width: progress.value * progressTrackW,
  }));

  // ── Rate slider ─────────────────────────────────────────────────────────

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

  function applyGoalRateText(text: string) {
    const rate = Number.parseFloat(text);
    if (!Number.isFinite(rate)) return;
    const { min, max } = getRateBounds();
    if (rate < min || rate > max) return;
    setGoalRate(Math.round(rate / 0.05) * 0.05);
  }

  // ── Unit switching ──────────────────────────────────────────────────────

  function switchUnits(newSystem: UnitSystem) {
    if (newSystem === units) return;
    if (newSystem === 'imperial') {
      const { feet, inches } = cmToFtIn(heightCm);
      const nextWeightLbs = Math.round(kgToLbs(weightKg) * 10) / 10;
      const nextTargetLbs = Math.round(kgToLbs(targetWeightKg) * 10) / 10;
      setHeightFtText(String(feet));
      setHeightInText(String(inches));
      setWeightLbs(nextWeightLbs);
      setTargetWeightLbs(nextTargetLbs);
      setWeightText(String(nextWeightLbs));
      setTargetWeightText(String(nextTargetLbs));
    } else {
      const nextWeightKg = Math.round(lbsToKg(weightLbs) * 10) / 10;
      const nextTargetKg = Math.round(lbsToKg(targetWeightLbs) * 10) / 10;
      setHeightCmText(String(Math.round(heightCm * 10) / 10));
      setWeightKg(nextWeightKg);
      setTargetWeightKg(nextTargetKg);
      setWeightText(nextWeightKg.toFixed(1));
      setTargetWeightText(nextTargetKg.toFixed(1));
    }
    setUnits(newSystem);
  }

  function applyHeightCmText(t: string) {
    setHeightCmText(t);
    const v = parseFloat(t);
    if (!isNaN(v) && v >= 50 && v <= 280) setHeightCm(Math.round(v * 10) / 10);
  }

  function applyHeightImperial(ft: string, inches: string) {
    setHeightFtText(ft);
    setHeightInText(inches);
    const f = parseFloat(ft) || 0;
    const i = parseFloat(inches) || 0;
    const cm = ftInToCm(f, i);
    if ((f > 0 || i > 0) && cm >= 50 && cm <= 280) setHeightCm(cm);
  }

  function applyWeightText(t: string) {
    setWeightText(t);
    const v = parseFloat(t);
    if (isNaN(v)) return;
    const kg = units === 'metric' ? v : lbsToKg(v);
    if (kg < 20 || kg > 500) return;
    if (units === 'metric') {
      setWeightKg(v);
      setWeightLbs(Math.round(kgToLbs(v)));
    } else {
      setWeightLbs(v);
      setWeightKg(Math.round(lbsToKg(v) * 10) / 10);
    }
  }

  function applyTargetWeightText(t: string) {
    setTargetWeightText(t);
    const v = parseFloat(t);
    if (isNaN(v)) return;
    const kg = units === 'metric' ? v : lbsToKg(v);
    if (kg < 20 || kg > 500) return;
    if (units === 'metric') {
      setTargetWeightKg(v);
      setTargetWeightLbs(Math.round(kgToLbs(v) * 10) / 10);
    } else {
      setTargetWeightLbs(v);
      setTargetWeightKg(Math.round(lbsToKg(v) * 10) / 10);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

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
        if (!isValidBirthDate()) return 'Please enter a valid birth date.';
        return null;
      case 2: {
        if (heightCm < 50 || heightCm > 280) return 'Height must be between 50 cm and 280 cm.';
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
      const nextTargetKg = Math.max(20, resolveWeightKg() - 5);
      setTargetWeightKg(nextTargetKg);
      setTargetWeightLbs(Math.round(kgToLbs(nextTargetKg) * 10) / 10);
      setTargetWeightText(units === 'metric' ? nextTargetKg.toFixed(1) : String(Math.round(kgToLbs(nextTargetKg) * 10) / 10));
    } else {
      setGoalRate(RATE_RANGE.bulk.defaultRate);
      const nextTargetKg = Math.min(500, resolveWeightKg() + 3);
      setTargetWeightKg(nextTargetKg);
      setTargetWeightLbs(Math.round(kgToLbs(nextTargetKg) * 10) / 10);
      setTargetWeightText(units === 'metric' ? nextTargetKg.toFixed(1) : String(Math.round(kgToLbs(nextTargetKg) * 10) / 10));
    }
  }

  function handleNext() {
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      return;
    }
    if (step >= 5) return;
    goToStep(step + 1);
  }

  function handleBack() {
    if (step <= 1 || step >= TOTAL_STEPS) return;
    goToStep(step - 1);
  }

  async function handleCalculate() {
    setIsCalculating(true);
    try {
      const w = resolveWeightKg();
      const age = ageFromBirthDate(resolveBirthDateISO());
      const bmr = calcBMR({ sex, weight_kg: w, height_cm: heightCm, age });
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
      goToStep(TOTAL_STEPS);
    } finally {
      setIsCalculating(false);
    }
  }

  // ── Step 6: calculating beat → auto-save ────────────────────────────────

  const [calcStage, setCalcStage] = useState(0);
  const savedRef = useRef(false);

  useEffect(() => {
    if (step !== TOTAL_STEPS || !computedTargets) return;
    savedRef.current = false;
    setCalcStage(0);
    if (reduced) {
      setCalcStage(CALC_LINES.length);
      const t = setTimeout(() => void saveOnce(), 250);
      return () => clearTimeout(t);
    }
    const timers = CALC_LINES.map((_, i) =>
      setTimeout(() => setCalcStage(i + 1), 400 * (i + 1))
    );
    const saveT = setTimeout(() => void saveOnce(), 400 * CALC_LINES.length + 450);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(saveT);
    };
  }, [step, computedTargets]);

  async function saveOnce() {
    if (savedRef.current) return;
    savedRef.current = true;
    await handleSave();
  }

  async function handleSave() {
    setIsSubmitting(true);
    try {
      const w = resolveWeightKg();
      const today = todayISO();

      await insertProfile({
        display_name: displayName.trim(),
        sex,
        height_cm: heightCm,
        birth_date: resolveBirthDateISO(),
        activity_level: activityLevel,
        goal_type: goalType,
        goal_rate_kg_per_week: goalRate,
        protein_preference: proteinPreference,
        weight_unit: units === 'metric' ? 'kg' : 'lb',
        target_weight_kg: goalType === 'maintain' ? w : targetWeightKg,
      });

      await saveWeightLog({
        logDate: today,
        scaleWeightKg: w,
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
      setStep(5);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Derived display values ──────────────────────────────────────────────

  const weightMin = units === 'metric' ? 20 : 44;
  const weightMax = units === 'metric' ? 500 : 1100;
  const weightUnit = units === 'metric' ? 'kg' : 'lbs';

  const heightInches = Math.round(heightCm / 2.54);
  const formatFtIn = (totalIn: number) =>
    `${Math.floor(totalIn / 12)}'${Math.round(totalIn % 12)}"`;

  const rateDisplay =
    units === 'metric'
      ? `${goalRate >= 0 ? '+' : ''}${goalRate.toFixed(2)} kg / week`
      : `${goalRate >= 0 ? '+' : ''}${(goalRate * 2.20462).toFixed(2)} lb / week`;

  const goalTiles: { type: GoalType; icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string }[] = [
    { type: 'cut', icon: 'trending-down', title: 'Cut', subtitle: 'Weight Loss' },
    { type: 'maintain', icon: 'drag-handle', title: 'Maintain', subtitle: 'Stay Steady' },
    { type: 'bulk', icon: 'trending-up', title: 'Bulk', subtitle: 'Gain Muscle' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1">
          {/* ── Progress bar ──────────────────────────────────────────── */}
          <View className="px-5 py-3 border-b border-m3-outline-variant/30 shrink-0">
            <View
              className="bg-m3-surface-container-highest h-1.5 rounded-full overflow-hidden"
              onLayout={(e) => setProgressTrackW(e.nativeEvent.layout.width)}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step, text: `Step ${step} of ${TOTAL_STEPS}` }}
            >
              <Reanimated.View
                className="bg-white h-full rounded-full"
                style={progressStyle}
              />
            </View>
            <Text className="mt-2 text-xs font-semibold text-m3-on-surface-variant">Step {step} of {TOTAL_STEPS}</Text>
          </View>

          {/* ── Scrollable content ────────────────────────────────────── */}
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName="px-5 py-5"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Reanimated.View style={stepAnimStyle} className="gap-7 pb-8">
              {/* ═══════════════════ STEP 1 — About You ═══════════════════ */}
              {step === 1 && (
                <>
                  <StepHeader
                    title="About You"
                    subtitle="The basics — used to estimate your metabolism."
                  />

                  <View className="gap-3">
                    <SectionLabel>Biological Sex</SectionLabel>
                    <SegmentedControl
                      options={[
                        { value: 'male', label: 'Male', icon: 'male' },
                        { value: 'female', label: 'Female', icon: 'female' },
                      ]}
                      value={sex}
                      onChange={setSex}
                    />
                  </View>

                  <View className="bg-m3-surface-container p-6 rounded-3xl border border-m3-outline-variant/30 gap-4">
                    <View className="flex-row justify-between items-center">
                      <SectionLabel>Display Name</SectionLabel>
                      <Text className="text-xs text-m3-on-surface-variant">Optional</Text>
                    </View>
                    <StyledInput
                      label="Display name"
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="e.g. Alex"
                      maxLength={40}
                    />
                  </View>

                  <View className="bg-m3-surface-container p-6 rounded-3xl border border-m3-outline-variant/30 gap-4">
                    <SectionLabel>Birth Date</SectionLabel>
                    <Pressable
                      onPress={() => setShowDatePicker(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Select birth date"
                      accessibilityHint="Opens the date selector"
                      className="w-full bg-m3-surface-container-high rounded-xl px-4 py-3.5 border border-m3-outline-variant/40 flex-row items-center justify-between active:opacity-70"
                    >
                      <Text className="text-m3-on-surface text-sm font-semibold">
                        {birthDate.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </Text>
                      <MaterialIcons name="calendar-today" size={16} color="#c4c6d0" />
                    </Pressable>
                  </View>
                </>
              )}

              {/* ═══════════════ STEP 2 — Height & Weight ═════════════════ */}
              {step === 2 && (
                <>
                  <StepHeader
                    title="Height & Weight"
                    subtitle="Your starting point for the trend engine."
                  />

                  <SegmentedControl
                    options={[
                      { value: 'metric', label: 'Metric', icon: 'straighten' },
                      { value: 'imperial', label: 'Imperial', icon: 'public' },
                    ]}
                    value={units}
                    onChange={switchUnits}
                  />

                  <View className="bg-m3-surface-container p-6 rounded-3xl border border-m3-outline-variant/30 gap-5">
                    <SectionLabel>Height</SectionLabel>
                    {units === 'metric' ? (
                      <View className="flex-row items-baseline justify-center gap-1">
                        <TextInput
                          accessibilityLabel="Height in centimeters"
                          value={heightCmText}
                          onChangeText={applyHeightCmText}
                          placeholder="180"
                          placeholderTextColor={M3.placeholder}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          textAlign="center"
                          underlineColorAndroid="transparent"
                          className="w-28 text-m3-on-surface text-4xl font-bold tabular-nums text-center py-1"
                        />
                        <Text className="text-sm font-medium text-m3-on-surface-variant shrink-0">
                          cm
                        </Text>
                      </View>
                    ) : (
                      <View className="flex-row items-baseline justify-center gap-1">
                        <TextInput
                          accessibilityLabel="Height in feet"
                          value={heightFtText}
                          onChangeText={(t) => applyHeightImperial(t, heightInText)}
                          placeholder="5"
                          placeholderTextColor={M3.placeholder}
                          keyboardType="numeric"
                          maxLength={1}
                          selectTextOnFocus
                          textAlign="center"
                          underlineColorAndroid="transparent"
                          className="w-14 text-m3-on-surface text-4xl font-bold tabular-nums text-center py-1"
                        />
                        <Text className="text-sm font-medium text-m3-on-surface-variant shrink-0 mr-2">ft</Text>
                        <TextInput
                          accessibilityLabel="Height in inches"
                          value={heightInText}
                          onChangeText={(t) => applyHeightImperial(heightFtText, t)}
                          placeholder="10"
                          placeholderTextColor={M3.placeholder}
                          keyboardType="numeric"
                          maxLength={2}
                          selectTextOnFocus
                          textAlign="center"
                          underlineColorAndroid="transparent"
                          className="w-16 text-m3-on-surface text-4xl font-bold tabular-nums text-center py-1"
                        />
                        <Text className="text-sm font-medium text-m3-on-surface-variant shrink-0">in</Text>
                      </View>
                    )}
                    <RulerSlider
                      value={units === 'metric' ? heightCm : heightInches}
                      onValueChange={(v) => {
                        if (units === 'metric') {
                          setHeightCm(v);
                          setHeightCmText(String(v));
                        } else {
                          const cm = Math.round(v * 2.54 * 10) / 10;
                          const { feet, inches } = cmToFtIn(cm);
                          setHeightCm(cm);
                          setHeightFtText(String(feet));
                          setHeightInText(String(inches));
                        }
                      }}
                      min={units === 'metric' ? 120 : 47}
                      max={units === 'metric' ? 220 : 87}
                      step={1}
                      unit={units === 'metric' ? 'cm' : ''}
                      label="Height"
                      formatValue={units === 'imperial' ? formatFtIn : undefined}
                      showValue={false}
                    />
                  </View>

                  <View className="bg-m3-surface-container p-6 rounded-3xl border border-m3-outline-variant/30 gap-5">
                    <SectionLabel>Starting Scale Weight</SectionLabel>
                    <View className="flex-row items-baseline justify-center gap-1">
                      <TextInput
                        accessibilityLabel={`Starting scale weight in ${weightUnit}`}
                        value={weightText}
                        onChangeText={applyWeightText}
                        placeholder={units === 'metric' ? '80.0' : '176'}
                        placeholderTextColor={M3.placeholder}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        textAlign="center"
                        underlineColorAndroid="transparent"
                        className="w-40 text-m3-on-surface text-4xl font-bold tabular-nums text-center py-1"
                      />
                      <Text className="text-sm font-medium text-m3-on-surface-variant shrink-0">
                        {weightUnit}
                      </Text>
                    </View>
                    <RulerSlider
                      value={units === 'metric' ? weightKg : weightLbs}
                      onValueChange={(v) => {
                        if (units === 'metric') {
                          setWeightKg(v);
                          setWeightLbs(Math.round(kgToLbs(v) * 10) / 10);
                          setWeightText(v.toFixed(1));
                        } else {
                          setWeightLbs(v);
                          setWeightKg(Math.round(lbsToKg(v) * 10) / 10);
                          setWeightText(String(v));
                        }
                      }}
                      min={weightMin}
                      max={weightMax}
                      step={0.1}
                      unit={weightUnit}
                      label="Starting scale weight"
                      showValue={false}
                    />
                  </View>
                </>
              )}

              {/* ═══════════════ STEP 3 — Activity Level ══════════════════ */}
              {step === 3 && (
                <>
                  <StepHeader
                    title="Activity Level"
                    subtitle="A starting estimate based on how much you move each day."
                  />

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

              {/* ═══════════════ STEP 4 — Goal & Target Rate ══════════════ */}
              {step === 4 && (
                <>
                  <StepHeader
                    title="Goal & Target Rate"
                    subtitle="Pick a pace you can sustain."
                  />

                  <View className="gap-3">
                    <SectionLabel>Primary Goal</SectionLabel>
                    <View className="flex-row gap-3">
                      {goalTiles.map((tile) => {
                        const selected = goalType === tile.type;
                        return (
                          <Pressable
                            key={tile.type}
                            onPress={() => handleGoalTypeChange(tile.type)}
                            accessibilityRole="radio"
                            accessibilityLabel={`${tile.title}: ${tile.subtitle}`}
                            accessibilityState={{ checked: selected }}
                            className={`flex-1 p-5 rounded-2xl items-center gap-1 active:scale-[0.97] ${
                              selected
                                ? 'bg-m3-surface-container-high border-2 border-white'
                                : 'bg-m3-surface-container border border-m3-outline-variant/30'
                            }`}
                          >
                            <MaterialIcons
                              name={tile.icon}
                              size={24}
                              color={selected ? '#ffffff' : '#c4c6d0'}
                            />
                            <Text
                              className={`font-bold text-base ${
                                selected ? 'text-white' : 'text-m3-on-surface'
                              }`}
                            >
                              {tile.title}
                            </Text>
                            <Text className="text-xs text-m3-on-surface-variant">{tile.subtitle}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {goalType !== 'maintain' && (
                    <Reanimated.View
                      entering={reduced ? undefined : FadeIn.duration(250)}
                      className="gap-7"
                    >
                      {/* Target Weight */}
                      <View className="bg-m3-surface-container p-6 rounded-3xl border border-m3-outline-variant/30 gap-5">
                        <View className="flex-row justify-between items-center">
                          <SectionLabel>Target Weight</SectionLabel>
                          <Text className="text-sm text-m3-primary font-medium">Goal Weight</Text>
                        </View>
                        <View className="flex-row items-baseline justify-center gap-1">
                          <TextInput
                            accessibilityLabel={`Target weight in ${weightUnit}`}
                            value={targetWeightText}
                            onChangeText={applyTargetWeightText}
                            placeholder={units === 'metric' ? '75.0' : '165'}
                            placeholderTextColor={M3.placeholder}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            textAlign="center"
                            underlineColorAndroid="transparent"
                            className="w-40 text-m3-on-surface text-4xl font-bold tabular-nums text-center py-1"
                          />
                          <Text className="text-sm font-medium text-m3-on-surface-variant shrink-0">
                            {weightUnit}
                          </Text>
                        </View>
                        <RulerSlider
                          value={units === 'metric' ? targetWeightKg : targetWeightLbs}
                          onValueChange={(v) => {
                            if (units === 'metric') {
                              setTargetWeightKg(v);
                              setTargetWeightLbs(Math.round(kgToLbs(v) * 10) / 10);
                              setTargetWeightText(v.toFixed(1));
                            } else {
                              setTargetWeightLbs(v);
                              setTargetWeightKg(Math.round(lbsToKg(v) * 10) / 10);
                              setTargetWeightText(String(v));
                            }
                          }}
                          min={weightMin}
                          max={weightMax}
                          step={0.1}
                          unit={weightUnit}
                          label="Target weight"
                          showValue={false}
                        />
                      </View>

                      {/* Target Rate */}
                      <View className="bg-m3-surface-container p-6 rounded-3xl border border-m3-outline-variant/30 gap-5">
                        <View className="flex-row justify-between items-center">
                          <SectionLabel>Target Rate</SectionLabel>
                          <Text className="text-sm font-bold tabular-nums text-m3-expenditure">
                            {rateDisplay}
                          </Text>
                        </View>
                        <TextInput
                          value={goalRate.toFixed(2)}
                          onChangeText={applyGoalRateText}
                          accessibilityLabel="Target rate in kilograms per week"
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          className="min-h-[48px] rounded-xl border border-m3-outline-variant/40 bg-m3-surface-container-high px-4 text-center text-lg font-bold tabular-nums text-m3-on-surface"
                        />
                        <RulerSlider
                          value={goalRate}
                          onValueChange={setGoalRate}
                          min={getRateBounds().min}
                          max={getRateBounds().max}
                          step={0.05}
                          unit="kg/week"
                          label="Target rate"
                          showValue={false}
                        />
                        <View className="flex-row justify-between">
                          <Text className="text-sm text-m3-on-surface-variant font-medium">Slow</Text>
                          <Text className="text-sm text-m3-on-surface-variant font-medium">Fast</Text>
                        </View>
                      </View>
                    </Reanimated.View>
                  )}
                </>
              )}

              {/* ═══════════════ STEP 5 — Protein Preference ══════════════ */}
              {step === 5 && (
                <>
                  <StepHeader
                    title="Protein Preference"
                    subtitle="Sets your daily protein floor."
                  />

                  <View className="gap-4">
                    <TappableRow
                      icon="egg"
                      community
                      title="Low"
                      subtitle="Bottom of the recommended range"
                      selected={proteinPreference === 'low'}
                      onPress={() => setProteinPreference('low')}
                    />
                    <TappableRow
                      icon="restaurant"
                      title="Moderate"
                      subtitle="Middle of the recommended range"
                      selected={proteinPreference === 'moderate'}
                      onPress={() => setProteinPreference('moderate')}
                    />
                    <TappableRow
                      icon="food-drumstick"
                      community
                      title="High"
                      subtitle="Top of the recommended range"
                      selected={proteinPreference === 'high'}
                      onPress={() => setProteinPreference('high')}
                    />
                    <TappableRow
                      icon="arm-flex"
                      community
                      title="Extra High"
                      subtitle="Above the typical range"
                      selected={proteinPreference === 'extra_high'}
                      onPress={() => setProteinPreference('extra_high')}
                    />
                  </View>
                </>
              )}

              {/* ═══════════════ STEP 6 — Calculating ═════════════════════ */}
              {step === 6 && (
                <View className="items-center pt-14 gap-8">
                  <View className="w-16 h-16 rounded-full bg-m3-surface-container-high border border-m3-outline-variant/40 items-center justify-center">
                    <MaterialIcons name="auto-awesome" size={28} color="#ffffff" />
                  </View>
                  <View className="items-center gap-1.5">
                    <Text className="text-2xl font-bold text-m3-on-surface text-center">
                      Building your plan
                    </Text>
                    <Text className="text-sm text-m3-on-surface-variant text-center">
                      Calculating your starting targets.
                    </Text>
                  </View>
                  <View className="w-full gap-3">
                    {CALC_LINES.map((line, i) =>
                      calcStage > i ? (
                        <Reanimated.View
                          key={line}
                          entering={reduced ? undefined : FadeIn.duration(250)}
                          className="flex-row items-center gap-3 bg-m3-surface-container border border-m3-outline-variant/30 rounded-2xl px-5 py-4"
                        >
                          <View className="w-5 h-5 rounded-full bg-white items-center justify-center">
                            <MaterialIcons name="check" size={13} color="#0f1117" />
                          </View>
                        <Text className="text-sm font-medium text-m3-on-surface">{line}</Text>
                        </Reanimated.View>
                      ) : null
                    )}
                  </View>
                </View>
              )}
            </Reanimated.View>
          </ScrollView>

          {/* ── Footer ────────────────────────────────────────────────── */}
          {step < TOTAL_STEPS && (
            <View className="px-7 py-5 bg-m3-surface-container-low border-t border-m3-outline-variant/40 shrink-0 gap-3">
              {stepError && (
                <Reanimated.View
                  entering={reduced ? undefined : FadeIn.duration(200)}
                  className="flex-row items-center gap-2"
                  accessibilityLiveRegion="assertive"
                >
                  <MaterialIcons name="error-outline" size={15} color="#ffb4ab" />
                  <Text className="text-sm text-m3-error font-medium">{stepError}</Text>
                </Reanimated.View>
              )}
              {step === 1 && (
                <PrimaryButton title="Continue" icon="arrow-forward" onPress={handleNext} />
              )}
              {step > 1 && step < 5 && (
                <View className="flex-row gap-3">
                  <BackButton onPress={handleBack} />
                  <View className="flex-1">
                    <PrimaryButton title="Continue" icon="arrow-forward" onPress={handleNext} />
                  </View>
                </View>
              )}
              {step === 5 && (
                <View className="flex-row gap-3">
                  <BackButton onPress={handleBack} />
                  <View className="flex-1">
                    <PrimaryButton
                      title="Calculate"
                      icon="auto-awesome"
                      onPress={handleCalculate}
                      loading={isCalculating || isSubmitting}
                    />
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
      <DateSelector
        visible={showDatePicker}
        value={birthDate}
        minimumDate={EARLIEST_BIRTH_DATE}
        maximumDate={LATEST_BIRTH_DATE}
        onCancel={() => setShowDatePicker(false)}
        onConfirm={(date) => {
          setBirthDate(date);
          setStepError(null);
          setShowDatePicker(false);
        }}
      />
    </SafeAreaView>
  );
}
