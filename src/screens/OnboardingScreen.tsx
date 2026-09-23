import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AccessibilityInfo,
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
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { showDatePicker } from '../components/DatePicker';
import ChoiceCards, { type ChoiceCardOption } from '../components/ChoiceCards';
import GoalRateControl from '../components/GoalRateControl';
import GoalTypeSelector from '../components/GoalTypeSelector';
import PrimaryButton from '../components/PrimaryButton';
import { SheetDialogOverlay, useSheetDialogHost } from '../components/SheetDialog';
import RulerSlider from '../components/RulerSlider';
import TappableRow from '../components/TappableRow';
import type {
  ActivityLevel,
  ProfileUpdate,
  GoalType,
  ProteinPreference,
  Sex,
} from '../db/database';
import {
  insertInitialProfileAndPlan,
} from '../db/database';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { DURATION, EASING } from '../theme/motion';
import { M3 } from '../theme/tokens';
import { formatLocalISO, parseLocalISO, todayISO } from '../utils/calendar';
import { goalRateBounds } from '../utils/goalRate';
import {
  ageFromBirthDate,
  calcBMR,
  calcTDEE,
  calculateTargets,
  cmToFtIn,
  ftInToCm,
  kgToLbs,
  lbsToKg,
} from '../utils/calculations';
import {
  birthDateBounds,
  ESTIMATE_DISCLAIMER,
  NUTRITION_SAFETY_POLICY,
  profileSafetyIssues,
  validateBirthDate,
  validateHeightCm,
  validateWeightKg,
  WELLNESS_DISCLAIMER,
} from '../utils/nutritionSafety';
import ResponsiveContent from '../components/ResponsiveContent';
import RemoteEstimateConsentContent from '../components/RemoteEstimateConsentContent';
import { useRemoteEstimateConsent } from '../context/RemoteEstimateConsentContext';
import { serviceConfig } from '../config/services';
import { FORM_MAX_WIDTH } from '../theme/layout';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;
type UnitSystem = 'metric' | 'imperial';

const SEX_CHOICES: ChoiceCardOption<Sex>[] = [
  { value: 'male', icon: 'male', title: 'Male' },
  { value: 'female', icon: 'female', title: 'Female' },
];
const UNIT_CHOICES: ChoiceCardOption<'metric' | 'imperial'>[] = [
  { value: 'metric', icon: 'straighten', title: 'Metric', subtitle: 'kg · cm' },
  { value: 'imperial', icon: 'public', title: 'Imperial', subtitle: 'lb · ft, in' },
];

const CALCULATION_STEP = 6;
const HAS_REMOTE_ESTIMATE_CONSENT = serviceConfig.availability.gemini;
const TOTAL_STEPS = HAS_REMOTE_ESTIMATE_CONSENT ? 7 : CALCULATION_STEP;

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
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="bg-m3-surface-container border border-m3-outline-variant/40 rounded-full py-5 px-6 flex-row items-center justify-center gap-2 active:opacity-70"
    >
      <MaterialIcons name="arrow-back" size={18} color={M3.onSurface} />
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
      <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">{title}</Text>
      <Text className="text-sm text-m3-on-surface-variant">{subtitle}</Text>
    </View>
  );
}

export default function OnboardingScreen({ navigation }: Props) {
  const reduced = useReducedMotion();
  const { accept, decline } = useRemoteEstimateConsent();
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);

  const [units, setUnits] = useState<UnitSystem>('metric');

  const [sex, setSex] = useState<Sex>('male');
  const [displayName, setDisplayName] = useState('');

  const [birthDate, setBirthDate] = useState<Date>(new Date(1995, 5, 15));
  // The default is a placeholder: walk year, month, day until the user has chosen a real date.
  const [birthDateChosen, setBirthDateChosen] = useState(false);
  const birthDateDialog = useSheetDialogHost();

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
  const [consentBusy, setConsentBusy] = useState(false);

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
    animX.value = withTiming(0, { duration: DURATION.short, easing: EASING.emphasizedDecelerate });
    animOpacity.value = withTiming(1, { duration: DURATION.short }, (finished) => {
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
    animX.value = withTiming(-28 * dir, { duration: DURATION.exit, easing: EASING.emphasizedAccelerate });
    animOpacity.value = withTiming(0, { duration: DURATION.exit }, (finished) => {
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
    progress.value = withTiming(step / TOTAL_STEPS, { duration: reduced ? 0 : DURATION.medium, easing: EASING.emphasized });
  }, [step]);
  const progressStyle = useAnimatedStyle(() => ({
    width: progress.value * progressTrackW,
  }));

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
    const v = Number(t.trim());
    if (Number.isFinite(v)
      && v >= NUTRITION_SAFETY_POLICY.minimumHeightCm
      && v <= NUTRITION_SAFETY_POLICY.maximumHeightCm) {
      setHeightCm(Math.round(v * 10) / 10);
    }
  }

  function applyHeightImperial(ft: string, inches: string) {
    setHeightFtText(ft);
    setHeightInText(inches);
    const f = Number(ft.trim());
    const i = Number(inches.trim());
    const cm = ftInToCm(f, i);
    if (Number.isFinite(f) && Number.isFinite(i)
      && f >= 0 && i >= 0 && i < 12
      && cm >= NUTRITION_SAFETY_POLICY.minimumHeightCm
      && cm <= NUTRITION_SAFETY_POLICY.maximumHeightCm) {
      setHeightCm(cm);
    }
  }

  function applyWeightText(t: string) {
    setWeightText(t);
    const v = Number(t.trim());
    if (!Number.isFinite(v)) return;
    const kg = units === 'metric' ? v : lbsToKg(v);
    if (validateWeightKg(kg)) return;
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
    const v = Number(t.trim());
    if (!Number.isFinite(v)) return;
    const kg = units === 'metric' ? v : lbsToKg(v);
    if (validateWeightKg(kg, 'Target weight')) return;
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

  function resolveHeightInputCm(): number {
    if (units === 'metric') return Number(heightCmText.trim());
    return ftInToCm(Number(heightFtText.trim()), Number(heightInText.trim()));
  }

  /** TDEE from the entered profile, or null if any input is not yet valid. */
  function resolveTdee(): number | null {
    try {
      const bmr = calcBMR({
        sex,
        weight_kg: resolveWeightKg(),
        height_cm: resolveHeightInputCm(),
        age: ageFromBirthDate(resolveBirthDateISO()),
      });
      return calcTDEE(bmr, activityLevel);
    } catch {
      return null;
    }
  }

  function resolveWeightInputKg(): number {
    const value = Number(weightText.trim());
    return units === 'metric' ? value : lbsToKg(value);
  }

  function resolveTargetWeightInputKg(): number {
    const value = Number(targetWeightText.trim());
    return units === 'metric' ? value : lbsToKg(value);
  }

  function resolveBirthDateISO(): string {
    const y = birthDate.getFullYear();
    const mo = String(birthDate.getMonth() + 1).padStart(2, '0');
    const da = String(birthDate.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }

  function isValidBirthDate(): boolean {
    return validateBirthDate(resolveBirthDateISO()) == null;
  }

  function validateStep(stepNum: number): string | null {
    switch (stepNum) {
      case 1:
        if (!isValidBirthDate()) return validateBirthDate(resolveBirthDateISO()) ?? 'Please enter a valid birth date.';
        return null;
      case 2: {
        const heightIssue = validateHeightCm(resolveHeightInputCm());
        if (heightIssue) return heightIssue;
        const weightIssue = validateWeightKg(resolveWeightInputKg(), 'Current weight');
        if (weightIssue) return weightIssue;
        return null;
      }
      case 4: {
        const currentWeightKg = resolveWeightInputKg();
        const nextProfile: ProfileUpdate = {
          display_name: displayName.trim(),
          sex,
          height_cm: resolveHeightInputCm(),
          birth_date: resolveBirthDateISO(),
          activity_level: activityLevel,
          goal_type: goalType,
          goal_rate_kg_per_week: goalType === 'maintain' ? 0 : goalRate,
          protein_preference: proteinPreference,
          weight_unit: units === 'metric' ? 'kg' : 'lb',
          target_weight_kg: goalType === 'maintain' ? currentWeightKg : resolveTargetWeightInputKg(),
        };
        return profileSafetyIssues(nextProfile, { currentWeightKg })[0] ?? null;
      }
      default:
        return null;
    }
  }

  function handleGoalTypeChange(gt: GoalType) {
    setGoalType(gt);
    if (gt === 'maintain') {
      setGoalRate(0);
      const currentWeightKg = resolveWeightKg();
      setTargetWeightKg(currentWeightKg);
      setTargetWeightLbs(Math.round(kgToLbs(currentWeightKg) * 10) / 10);
      setTargetWeightText(units === 'metric' ? currentWeightKg.toFixed(1) : String(Math.round(kgToLbs(currentWeightKg) * 10) / 10));
    } else if (gt === 'cut') {
      const currentWeightKg = resolveWeightKg();
      setGoalRate(goalRateBounds('cut', currentWeightKg, resolveTdee()).defaultRate);
      const nextTargetKg = Math.max(NUTRITION_SAFETY_POLICY.minimumWeightKg, currentWeightKg - 5);
      setTargetWeightKg(nextTargetKg);
      setTargetWeightLbs(Math.round(kgToLbs(nextTargetKg) * 10) / 10);
      setTargetWeightText(units === 'metric' ? nextTargetKg.toFixed(1) : String(Math.round(kgToLbs(nextTargetKg) * 10) / 10));
    } else {
      const currentWeightKg = resolveWeightKg();
      setGoalRate(goalRateBounds('bulk', currentWeightKg, resolveTdee()).defaultRate);
      const nextTargetKg = Math.min(NUTRITION_SAFETY_POLICY.maximumWeightKg, currentWeightKg + 3);
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
    const validationError = [validateStep(1), validateStep(2), validateStep(4)].find(Boolean);
    if (validationError) {
      setStepError(validationError);
      return;
    }
    setIsCalculating(true);
    setStepError(null);
    try {
      const w = resolveWeightInputKg();
      const age = ageFromBirthDate(resolveBirthDateISO());
      const bmr = calcBMR({ sex, weight_kg: w, height_cm: resolveHeightInputCm(), age });
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
      goToStep(CALCULATION_STEP);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : 'Could not calculate a safe plan.');
    } finally {
      setIsCalculating(false);
    }
  }

  // ── Step 6: calculation review ─────────────────────────────────────────

  const savedRef = useRef(false);
  const hasAnnouncedStepRef = useRef(false);

  useEffect(() => {
    if (step !== CALCULATION_STEP || !computedTargets) return;
    savedRef.current = false;
  }, [step, computedTargets]);

  useEffect(() => {
    if (!hasAnnouncedStepRef.current) {
      hasAnnouncedStepRef.current = true;
      return;
    }
    AccessibilityInfo.announceForAccessibility(`Step ${step} of ${TOTAL_STEPS}`);
  }, [step]);

  async function handleConsentAccept() {
    if (consentBusy || isSubmitting) return;
    setStepError(null);
    setConsentBusy(true);
    try {
      if (!await accept()) {
        setStepError('Eatlog could not save your privacy choice. Nothing was sent. Try again.');
        return;
      }
      await handleSave();
    } finally {
      setConsentBusy(false);
    }
  }

  async function handleConsentDecline() {
    if (consentBusy || isSubmitting) return;
    setStepError(null);
    setConsentBusy(true);
    try {
      await decline();
      await handleSave();
    } finally {
      setConsentBusy(false);
    }
  }

  async function handleSave() {
    if (savedRef.current || !computedTargets) return;
    savedRef.current = true;
    setIsSubmitting(true);
    try {
      const w = resolveWeightInputKg();
      const today = todayISO();
      const profile: ProfileUpdate = {
        display_name: displayName.trim(),
        sex,
        height_cm: resolveHeightInputCm(),
        birth_date: resolveBirthDateISO(),
        activity_level: activityLevel,
        goal_type: goalType,
        goal_rate_kg_per_week: goalType === 'maintain' ? 0 : goalRate,
        protein_preference: proteinPreference,
        weight_unit: units === 'metric' ? 'kg' : 'lb',
        target_weight_kg: goalType === 'maintain' ? w : resolveTargetWeightInputKg(),
      };
      await insertInitialProfileAndPlan({
        profile,
        weightKg: w,
        target: {
          effective_date: today,
          tdee_estimate: tdeeEstimate,
          target_calories: computedTargets.targetCalories,
          target_protein_g: computedTargets.targetProteinG,
          target_fat_g: computedTargets.targetFatG,
          target_carbs_g: computedTargets.targetCarbsG,
          calculation_method: 'initial_estimate',
        },
      });

      navigation.replace('SetupComplete', {
        displayName: displayName.trim(),
        tdee: tdeeEstimate,
        targetCalories: computedTargets.targetCalories,
        targetProtein: computedTargets.targetProteinG,
        targetFat: computedTargets.targetFatG,
        targetCarbs: computedTargets.targetCarbsG,
      });
    } catch (err) {
      savedRef.current = false;
      console.error('Save error:', err);
      Alert.alert('Could not save your plan', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Derived display values ──────────────────────────────────────────────

  const weightMin = units === 'metric' ? NUTRITION_SAFETY_POLICY.minimumWeightKg : Math.round(kgToLbs(NUTRITION_SAFETY_POLICY.minimumWeightKg) * 10) / 10;
  const weightMax = units === 'metric' ? NUTRITION_SAFETY_POLICY.maximumWeightKg : Math.round(kgToLbs(NUTRITION_SAFETY_POLICY.maximumWeightKg) * 10) / 10;
  const weightUnit = units === 'metric' ? 'kg' : 'lbs';
  const dateBounds = birthDateBounds();

  const heightInches = Math.round(heightCm / 2.54);
  const formatFtIn = (totalIn: number) =>
    `${Math.floor(totalIn / 12)}'${Math.round(totalIn % 12)}"`;

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1">
          {/* ── Progress bar ──────────────────────────────────────────── */}
          <View className="border-b border-m3-outline-variant/30 shrink-0">
            <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="px-5 py-3">
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
            </ResponsiveContent>
          </View>

          {/* ── Scrollable content ────────────────────────────────────── */}
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="px-5 py-5">
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
                    <ChoiceCards
                      options={SEX_CHOICES}
                      value={sex}
                      onChange={setSex}
                      accessibilityLabel="Biological sex"
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
                      onPress={() => showDatePicker(birthDateDialog.show, {
                        title: 'Birth date',
                        startView: birthDateChosen ? 'days' : 'years',
                        value: formatLocalISO(birthDate),
                        today: todayISO(),
                        minDate: formatLocalISO(dateBounds.earliest),
                        maxDate: formatLocalISO(dateBounds.latest),
                        onSelect: (dateISO) => {
                          setBirthDate(parseLocalISO(dateISO));
                          setBirthDateChosen(true);
                          setStepError(null);
                        },
                      })}
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
                      <MaterialIcons name="calendar-today" size={16} color={M3.onSurfaceVariant} />
                    </Pressable>
                  </View>
                  <Text className="text-xs leading-4 text-m3-on-surface-variant">
                    {WELLNESS_DISCLAIMER}
                  </Text>
                </>
              )}

              {/* ═══════════════ STEP 2 — Height & Weight ═════════════════ */}
              {step === 2 && (
                <>
                  <StepHeader
                    title="Height &amp; Weight"
                    subtitle="Your starting point for the trend engine."
                  />

                  <ChoiceCards
                    options={UNIT_CHOICES}
                    value={units}
                    onChange={switchUnits}
                    accessibilityLabel="Units"
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
                       min={units === 'metric' ? NUTRITION_SAFETY_POLICY.minimumHeightCm : Math.round(NUTRITION_SAFETY_POLICY.minimumHeightCm / 2.54 * 10) / 10}
                       max={units === 'metric' ? NUTRITION_SAFETY_POLICY.maximumHeightCm : Math.round(NUTRITION_SAFETY_POLICY.maximumHeightCm / 2.54 * 10) / 10}
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
                    title="Goal &amp; Target Rate"
                    subtitle="Pick a pace you can sustain."
                  />

                  <View className="gap-3">
                    <SectionLabel>Primary Goal</SectionLabel>
                    <GoalTypeSelector value={goalType} onChange={handleGoalTypeChange} />
                  </View>

                  {goalType !== 'maintain' && (
                    <Reanimated.View
                      entering={reduced ? undefined : FadeIn.duration(DURATION.short)}
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
                        <SectionLabel>Target Rate</SectionLabel>
                        <GoalRateControl
                          goal={goalType}
                          valueKgPerWeek={goalRate}
                          onValueChange={setGoalRate}
                          weightUnit={units === 'metric' ? 'kg' : 'lb'}
                          currentWeightKg={resolveWeightKg()}
                          tdeeKcal={resolveTdee()}
                        />
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
              {step === CALCULATION_STEP && (
                <View className="gap-6 pt-4">
                  <StepHeader
                    title="Your starting targets"
                    subtitle="Calculated from your measurements, activity, and goal. You can change them later in Profile."
                  />
                  {computedTargets ? (
                    <View className="w-full gap-4 rounded-3xl bg-m3-surface-container p-6">
                      <View className="gap-1">
                        <Text className="text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant">Daily calories</Text>
                        <Text className="text-3xl font-bold text-m3-on-surface tabular-nums">{computedTargets.targetCalories.toLocaleString()} kcal</Text>
                        <Text className="text-sm text-m3-on-surface-variant tabular-nums">
                          Protein {computedTargets.targetProteinG}g · Carbs {computedTargets.targetCarbsG}g · Fat {computedTargets.targetFatG}g
                        </Text>
                      </View>
                      <Text className="text-xs leading-4 text-m3-on-surface-variant">{ESTIMATE_DISCLAIMER}</Text>
                      <PrimaryButton
                        title="Use these starting targets"
                        icon="check"
                        onPress={() => {
                          if (HAS_REMOTE_ESTIMATE_CONSENT) goToStep(TOTAL_STEPS);
                          else void handleSave();
                        }}
                        loading={isSubmitting}
                      />
                    </View>
                  ) : null}
                </View>
              )}

              {/* ═══════════════ STEP 7 — Estimate consent ═══════════════ */}
              {step === TOTAL_STEPS && HAS_REMOTE_ESTIMATE_CONSENT && (
                <View className="min-h-[520px] flex-1">
                  <RemoteEstimateConsentContent
                    busy={consentBusy || isSubmitting}
                    error={stepError}
                    onAccept={handleConsentAccept}
                    onDecline={handleConsentDecline}
                  />
                </View>
              )}
            </Reanimated.View>
            </ResponsiveContent>
          </ScrollView>

          {/* ── Footer ────────────────────────────────────────────────── */}
          {step < CALCULATION_STEP && (
            <View className="bg-m3-surface-container-low border-t border-m3-outline-variant/40 shrink-0">
              <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="px-7 py-5 gap-3">
              {stepError && (
                <Reanimated.View
                  entering={reduced ? undefined : FadeIn.duration(DURATION.short)}
                  className="flex-row items-center gap-2"
                  accessibilityLiveRegion="assertive"
                >
                  <MaterialIcons name="error-outline" size={15} color={M3.error} />
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
              </ResponsiveContent>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
      <SheetDialogOverlay host={birthDateDialog} />
    </SafeAreaView>
  );
}
