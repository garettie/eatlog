import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import GoalTypeSelector from '../components/GoalTypeSelector';
import PrimaryButton from '../components/PrimaryButton';
import RulerSlider from '../components/RulerSlider';
import SegmentedControl from '../components/SegmentedControl';
import TappableRow from '../components/TappableRow';
import {
  type ActivityLevel,
  type DailyTargetInput,
  type GoalType,
  getDailyTargetForDate,
  getLatestWeightLogOnOrBefore,
  getProfile,
  type Profile,
  type ProfileUpdate,
  type Sex,
  updateProfileAndPlan,
  updateProfilePresentation,
} from '../db/database';
import { ageFromBirthDate, calcBMR, calcTDEE, calculateTargets, type MacroTargets } from '../utils/calculations';
import { parseLocalISO, todayISO } from '../utils/calendar';
import { MANUAL_TARGET_CALORIE_TOLERANCE, macroCalories, validateManualTargets } from '../utils/planValidation';
import { cmToFeetInches, feetInchesToCm, formatHeight, fromKilograms, toKilograms } from '../utils/weightUnits';
import { serviceConfig } from '../config/services';

export type ProfileStackParamList = {
  ProfileHome: undefined;
  PersonalDetails: undefined;
  GoalAndRate: undefined;
  NutritionTargets: undefined;
  Units: undefined;
  Privacy: undefined;
  PlanPreview: { profile: ProfileUpdate; target: DailyTargetInput };
};

type Props = NativeStackScreenProps<ProfileStackParamList, 'PlanPreview'> & { onDataChanged: () => void };

const GOAL_RATE_RANGE = {
  cut: { min: -1, max: -0.1, defaultRate: -0.5 },
  bulk: { min: 0.05, max: 0.5, defaultRate: 0.25 },
} as const;

function Field({ label, value, onChangeText, keyboardType = 'default', error }: {
  label: string; value: string; onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad'; error?: string | null;
}) {
  return (
    <View className="gap-2">
      <Text className="text-m3-on-surface-variant text-xs font-semibold">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? undefined}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor="#9aa0aa"
        underlineColorAndroid="transparent"
        className="min-h-[48px] bg-m3-surface-container-high border border-m3-outline-variant/40 rounded-xl px-4 text-m3-on-surface text-sm font-semibold"
      />
      {error ? <Text accessibilityLiveRegion="assertive" className="text-m3-error text-xs">{error}</Text> : null}
    </View>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <SafeAreaView edges={['bottom']} className="flex-1 bg-m3-surface">{children}</SafeAreaView>;
}

function toUpdate(profile: Profile, overrides: Partial<ProfileUpdate> = {}): ProfileUpdate {
  return {
    display_name: profile.display_name,
    sex: profile.sex,
    height_cm: profile.height_cm,
    birth_date: profile.birth_date,
    activity_level: profile.activity_level,
    goal_type: profile.goal_type,
    goal_rate_kg_per_week: profile.goal_rate_kg_per_week,
    protein_preference: profile.protein_preference,
    weight_unit: profile.weight_unit,
    target_weight_kg: profile.target_weight_kg,
    ...overrides,
  };
}

async function calculatedPlan(profile: Profile, overrides: Partial<ProfileUpdate> = {}): Promise<{ profile: ProfileUpdate; target: DailyTargetInput }> {
  const nextProfile = toUpdate(profile, overrides);
  const weight = await getLatestWeightLogOnOrBefore(todayISO());
  const weightKg = weight?.trend_weight_kg ?? weight?.scale_weight_kg ?? profile.target_weight_kg;
  if (weightKg == null) throw new Error('Add a weight check-in before recalculating targets.');
  const tdee = calcTDEE(calcBMR({ sex: nextProfile.sex, weight_kg: weightKg, height_cm: nextProfile.height_cm, age: ageFromBirthDate(nextProfile.birth_date) }), nextProfile.activity_level);
  const macros = calculateTargets({
    tdeeKcal: tdee,
    goalType: nextProfile.goal_type,
    proteinPreference: nextProfile.protein_preference,
    weightKg,
    goalRateKgPerWeek: nextProfile.goal_rate_kg_per_week,
  });
  return {
    profile: nextProfile,
    target: { effective_date: todayISO(), tdee_estimate: Math.round(tdee), target_calories: macros.targetCalories, target_protein_g: macros.targetProteinG, target_fat_g: macros.targetFatG, target_carbs_g: macros.targetCarbsG, calculation_method: 'profile_recalculation' },
  };
}

function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void getProfile().then(setProfile).catch(() => setError('Could not load your profile.')); }, []);
  return { profile, error };
}

export function PersonalDetailsScreen() {
  const navigation = useNavigation<NavigationProp<ProfileStackParamList>>();
  const { profile, error: loadError } = useProfile();
  const [name, setName] = useState(''); const [sex, setSex] = useState<Sex>('male'); const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState(''); const [heightInches, setHeightInches] = useState(''); const [activity, setActivity] = useState<ActivityLevel>('moderate'); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  useEffect(() => { if (profile) { setName(profile.display_name); setSex(profile.sex); setBirthDate(profile.birth_date); setHeight(profile.weight_unit === 'kg' ? String(profile.height_cm) : String(cmToFeetInches(profile.height_cm).feet)); setHeightInches(profile.weight_unit === 'kg' ? '' : String(cmToFeetInches(profile.height_cm).inches)); setActivity(profile.activity_level); } }, [profile]);
  const save = useCallback(async () => {
    if (!profile) return;
    const heightCm = profile.weight_unit === 'kg' ? Number(height) : feetInchesToCm(Number(height), Number(heightInches)); const age = ageFromBirthDate(birthDate);
    try { parseLocalISO(birthDate); } catch { setError('Enter a valid birth date (YYYY-MM-DD).'); return; }
    if (age < 5 || age > 125) { setError('Enter a birth date for an age between 5 and 125.'); return; }
    if (!Number.isFinite(heightCm) || heightCm < 50 || heightCm > 280) { setError('Height must be between 50 and 280 cm.'); return; }
    const next = toUpdate(profile, { display_name: name.trim(), sex, birth_date: birthDate, height_cm: heightCm, activity_level: activity });
    const formulaChanged = sex !== profile.sex || birthDate !== profile.birth_date || heightCm !== profile.height_cm || activity !== profile.activity_level;
    setSaving(true); setError(null);
    try {
      if (formulaChanged) navigation.navigate('PlanPreview', await calculatedPlan(profile, next));
      else { await updateProfilePresentation(next); navigation.goBack(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save personal details.'); } finally { setSaving(false); }
  }, [activity, birthDate, height, heightInches, name, navigation, profile, sex]);
  if (!profile) return <Screen><View className="flex-1 items-center justify-center"><ActivityIndicator color="#c4c6d0" /><Text className="text-m3-error text-sm mt-3">{loadError}</Text></View></Screen>;
  const heightFields = profile.weight_unit === 'kg' ? <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" /> : <View className="flex-row gap-3"><View className="flex-1"><Field label="Height (ft)" value={height} onChangeText={setHeight} keyboardType="numeric" /></View><View className="flex-1"><Field label="Height (in)" value={heightInches} onChangeText={setHeightInches} keyboardType="numeric" /></View></View>;
  return <Screen><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1"><ScrollView className="flex-1" contentContainerClassName="p-6 gap-5"><Text className="text-m3-on-surface-variant text-sm">These values determine your formula estimate.</Text><Card className="p-5 gap-5"><Field label="Display name" value={name} onChangeText={setName} /><SegmentedControl options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} value={sex} onChange={setSex} /><Field label="Birth date" value={birthDate} onChangeText={setBirthDate} />{heightFields}</Card><View className="gap-2"><Text className="text-m3-on-surface-variant text-xs font-semibold">Activity level</Text>{(['sedentary', 'light', 'moderate', 'active', 'very_active'] as ActivityLevel[]).map((value) => <TappableRow key={value} title={value.replace('_', ' ').replace(/^\w/, (character) => character.toUpperCase())} subtitle="Used for your daily expenditure estimate" selected={activity === value} onPress={() => setActivity(value)} />)}</View>{error ? <Text className="text-m3-error text-sm">{error}</Text> : null}<PrimaryButton title="Continue to plan preview" onPress={() => void save()} loading={saving} /></ScrollView></KeyboardAvoidingView></Screen>;
}

export function UnitsScreen({ onDataChanged }: { onDataChanged: () => void }) {
  const navigation = useNavigation<NavigationProp<ProfileStackParamList>>(); const { profile, error } = useProfile();
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg'); const [saving, setSaving] = useState(false);
  useEffect(() => { if (profile) setUnit(profile.weight_unit); }, [profile]);
  const save = useCallback(async () => { if (!profile || unit === profile.weight_unit) { navigation.goBack(); return; } setSaving(true); try { await updateProfilePresentation(toUpdate(profile, { weight_unit: unit })); onDataChanged(); navigation.goBack(); } finally { setSaving(false); } }, [navigation, onDataChanged, profile, unit]);
  if (!profile) return <Screen><View className="flex-1 items-center justify-center"><ActivityIndicator color="#c4c6d0" /><Text className="text-m3-error text-sm mt-3">{error}</Text></View></Screen>;
  return <Screen><ScrollView contentContainerClassName="p-6 gap-5"><Text className="text-m3-on-surface-variant text-sm">Units change how weight, height, goals, and charts are shown. Your stored data and nutrition target stay the same.</Text><SegmentedControl options={[{ value: 'kg', label: 'Metric' }, { value: 'lb', label: 'Imperial' }]} value={unit} onChange={setUnit} /><Card className="p-5 gap-2"><Text className="text-m3-on-surface font-semibold">Current height</Text><Text className="text-m3-on-surface-variant text-sm">{formatHeight(profile.height_cm, unit)}</Text></Card><PrimaryButton title="Save units" onPress={() => void save()} loading={saving} /></ScrollView></Screen>;
}

export function PrivacyScreen() {
  const rows = [
    ['Your plan', 'Stored only on this device.'],
    ['Food estimates', serviceConfig.availability.gemini ? 'Photos and descriptions are sent to Gemini when you choose Estimate.' : 'Photo and description estimates are unavailable in this build.'],
    ['Food search', `${serviceConfig.availability.usda ? 'USDA' : 'USDA unavailable'}, Open Food Facts, and your local food cache are used when available.`],
  ];
  return <Screen><ScrollView contentContainerClassName="p-6 gap-5"><Text className="text-m3-on-surface-variant text-sm">Marco does not provide a place to enter or manage provider credentials.</Text><View className="gap-3">{rows.map(([title, detail]) => <Card key={title} className="p-5 gap-1"><Text className="text-m3-on-surface font-semibold">{title}</Text><Text className="text-m3-on-surface-variant text-sm">{detail}</Text></Card>)}</View></ScrollView></Screen>;
}

export function GoalAndRateScreen() {
  const navigation = useNavigation<NavigationProp<ProfileStackParamList>>();
  const { profile, error: loadError } = useProfile();
  const [goal, setGoal] = useState<GoalType>('maintain');
  const [targetWeight, setTargetWeight] = useState(0);
  const [rateKg, setRateKg] = useState(0);
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    void (async () => {
      try {
        const latestWeight = await getLatestWeightLogOnOrBefore(todayISO());
        const latestWeightKg = latestWeight?.trend_weight_kg ?? latestWeight?.scale_weight_kg ?? null;
        const targetWeightKg = profile.target_weight_kg
          ?? latestWeightKg
          ?? null;
        if (!active) return;
        setGoal(profile.goal_type);
        setCurrentWeightKg(latestWeightKg);
        if (targetWeightKg != null) {
          setTargetWeight(fromKilograms(targetWeightKg, profile.weight_unit));
        }
        setRateKg(profile.goal_rate_kg_per_week);
        if (targetWeightKg == null) setError('Current target weight is unavailable.');
      } catch {
        if (active) setError('Could not load your target weight.');
      } finally {
        if (active) setHydrated(true);
      }
    })();
    return () => { active = false; };
  }, [profile]);

  const handleGoalChange = useCallback((nextGoal: GoalType) => {
    setGoal(nextGoal);
    if (nextGoal === 'maintain') {
      setRateKg(0);
      return;
    }

    const fallbackWeightKg = profile?.target_weight_kg ?? null;
    const baseWeightKg = currentWeightKg ?? fallbackWeightKg;
    if (nextGoal === 'cut') {
      setRateKg(GOAL_RATE_RANGE.cut.defaultRate);
      if (baseWeightKg != null) {
        setTargetWeight(fromKilograms(Math.max(20, baseWeightKg - 5), profile?.weight_unit ?? 'kg'));
      }
      return;
    }

    setRateKg(GOAL_RATE_RANGE.bulk.defaultRate);
    if (baseWeightKg != null) {
      setTargetWeight(fromKilograms(Math.min(500, baseWeightKg + 3), profile?.weight_unit ?? 'kg'));
    }
  }, [currentWeightKg, profile]);

  const save = useCallback(async () => { if (!profile) return; const targetKg = toKilograms(targetWeight, profile.weight_unit);
    if (!Number.isFinite(targetKg) || targetKg < 20 || targetKg > 500) { setError('Target weight must be between 20 and 500 kg.'); return; }
    if (!Number.isFinite(rateKg) || (goal === 'cut' && (rateKg > -0.05 || rateKg < -1)) || (goal === 'bulk' && (rateKg < 0.05 || rateKg > 0.5))) { setError('Use a sustainable weekly rate for the selected goal.'); return; }
    setSaving(true); setError(null); try { navigation.navigate('PlanPreview', await calculatedPlan(profile, { goal_type: goal, goal_rate_kg_per_week: goal === 'maintain' ? 0 : rateKg, target_weight_kg: targetKg })); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not calculate a plan.'); } finally { setSaving(false); }
  }, [goal, navigation, profile, rateKg, targetWeight]);

  if (!profile || !hydrated) return <Screen><View className="flex-1 items-center justify-center"><ActivityIndicator color="#c4c6d0" /><Text className="text-m3-error text-sm mt-3">{loadError}</Text></View></Screen>;

  const weightUnit = profile.weight_unit === 'kg' ? 'kg' : 'lbs';
  const weightMin = profile.weight_unit === 'kg' ? 20 : 44;
  const weightMax = profile.weight_unit === 'kg' ? 500 : 1100;
  const rateBounds = goal === 'cut'
    ? GOAL_RATE_RANGE.cut
    : goal === 'bulk'
      ? GOAL_RATE_RANGE.bulk
      : { min: 0, max: 0 };
  const displayedRate = profile.weight_unit === 'kg'
    ? rateKg
    : fromKilograms(rateKg, 'lb');
  const rateDisplay = `${displayedRate >= 0 ? '+' : ''}${displayedRate.toFixed(2)} ${profile.weight_unit} / week`;

  return (
    <Screen>
      <ScrollView contentContainerClassName="p-6 gap-5">
        <View className="gap-3">
          <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
            Primary Goal
          </Text>
          <GoalTypeSelector value={goal} onChange={handleGoalChange} />
        </View>

        {goal !== 'maintain' ? (
          <View className="gap-7">
            <View className="bg-m3-surface-container p-6 rounded-3xl border border-m3-outline-variant/30 gap-5">
              <View className="flex-row justify-between items-center">
                <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                  Target Weight
                </Text>
                <Text className="text-sm text-m3-primary font-medium">Goal Weight</Text>
              </View>
              <RulerSlider
                value={targetWeight}
                onValueChange={setTargetWeight}
                min={weightMin}
                max={weightMax}
                step={0.1}
                unit={weightUnit}
                label="Target weight"
              />
            </View>

            <View className="bg-m3-surface-container p-6 rounded-3xl border border-m3-outline-variant/30 gap-5">
              <View className="flex-row justify-between items-center">
                <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                  Target Rate
                </Text>
                <Text className="text-sm font-bold tabular-nums text-m3-expenditure">
                  {rateDisplay}
                </Text>
              </View>
              <RulerSlider
                value={rateKg}
                onValueChange={setRateKg}
                min={rateBounds.min}
                max={rateBounds.max}
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
          </View>
        ) : (
          <Card className="p-5">
            <Text className="text-m3-on-surface-variant text-sm">
              Maintenance uses a zero weekly rate.
            </Text>
          </Card>
        )}

        {error ? <Text className="text-m3-error text-sm">{error}</Text> : null}
        <PrimaryButton title="Continue to plan preview" onPress={() => void save()} loading={saving} />
      </ScrollView>
    </Screen>
  );
}

export function NutritionTargetsScreen() {
  const navigation = useNavigation<NavigationProp<ProfileStackParamList>>(); const { profile, error: loadError } = useProfile();
  const [mode, setMode] = useState<'calculated' | 'manual'>('calculated'); const [calories, setCalories] = useState(''); const [protein, setProtein] = useState(''); const [fat, setFat] = useState(''); const [carbs, setCarbs] = useState(''); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  useEffect(() => { if (!profile) return; void getDailyTargetForDate(todayISO()).then((target) => { if (target) { setCalories(String(target.target_calories)); setProtein(String(target.target_protein_g)); setFat(String(target.target_fat_g)); setCarbs(String(target.target_carbs_g)); } }); }, [profile]);
  const save = useCallback(async () => { if (!profile) return; setSaving(true); setError(null); try { if (mode === 'calculated') { navigation.navigate('PlanPreview', await calculatedPlan(profile)); return; }
    const targets: MacroTargets = { targetCalories: Number(calories), targetProteinG: Number(protein), targetFatG: Number(fat), targetCarbsG: Number(carbs) }; const validation = validateManualTargets(targets); if (validation) { setError(validation); return; }
    const current = await getDailyTargetForDate(todayISO()); if (!current) throw new Error('Current target is unavailable.');
    navigation.navigate('PlanPreview', { profile: toUpdate(profile), target: { effective_date: todayISO(), tdee_estimate: current.tdee_estimate, target_calories: targets.targetCalories, target_protein_g: targets.targetProteinG, target_fat_g: targets.targetFatG, target_carbs_g: targets.targetCarbsG, calculation_method: 'manual' } });
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare targets.'); } finally { setSaving(false); } }, [calories, carbs, fat, mode, navigation, profile, protein]);
  if (!profile) return <Screen><View className="flex-1 items-center justify-center"><ActivityIndicator color="#c4c6d0" /><Text className="text-m3-error text-sm mt-3">{loadError}</Text></View></Screen>;
  const implied = macroCalories({ targetProteinG: Number(protein) || 0, targetFatG: Number(fat) || 0, targetCarbsG: Number(carbs) || 0 });
  return <Screen><ScrollView contentContainerClassName="p-6 gap-5"><SegmentedControl options={[{ value: 'calculated', label: 'Calculated' }, { value: 'manual', label: 'Custom' }]} value={mode} onChange={setMode} />{mode === 'calculated' ? <Card className="p-5"><Text className="text-m3-on-surface-variant text-sm">Recalculate calories and macros from your current profile, goal, and trend weight.</Text></Card> : <Card className="p-5 gap-4"><Field label="Calories (kcal)" value={calories} onChangeText={setCalories} keyboardType="numeric" /><Field label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" /><Field label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" /><Field label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" /><Text className="text-m3-on-surface-variant text-sm">Macros imply {Math.round(implied)} kcal. Keep this within {MANUAL_TARGET_CALORIE_TOLERANCE} kcal of the target.</Text></Card>}{error ? <Text className="text-m3-error text-sm">{error}</Text> : null}<PrimaryButton title="Continue to plan preview" onPress={() => void save()} loading={saving} /></ScrollView></Screen>;
}

function TargetCard({ label, target }: { label: string; target: DailyTargetInput }) { return <Card className="p-5 gap-2"><Text className="text-m3-on-surface-variant text-xs font-semibold">{label}</Text><Text className="text-m3-on-surface text-3xl font-bold tabular-nums">{Math.round(target.target_calories).toLocaleString()} kcal</Text><Text className="text-m3-on-surface-variant text-sm tabular-nums">P {target.target_protein_g}g · C {target.target_carbs_g}g · F {target.target_fat_g}g</Text></Card>; }

export function PlanPreviewScreen({ route, navigation, onDataChanged }: Props) {
  const [current, setCurrent] = useState<DailyTargetInput | null>(null); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void getDailyTargetForDate(todayISO()).then((target) => { if (target) setCurrent(target); }).catch(() => setError('Could not load the current target.')); }, []);
  const source = route.params.target.calculation_method === 'manual' ? 'Manual' : 'Profile recalculation';
  const save = async () => { setSaving(true); setError(null); try { await updateProfileAndPlan(route.params); onDataChanged(); navigation.popToTop(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your plan.'); } finally { setSaving(false); } };
  return <Screen><ScrollView contentContainerClassName="p-6 gap-5"><Text className="text-m3-on-surface-variant text-sm">Effective {route.params.target.effective_date}. Prior diary history stays unchanged.</Text>{current ? <TargetCard label="Current" target={current} /> : <ActivityIndicator color="#c4c6d0" />}<TargetCard label={`Proposed · ${source}`} target={route.params.target} />{error ? <Text className="text-m3-error text-sm">{error}</Text> : null}<PrimaryButton title="Save plan" onPress={() => void save()} loading={saving} /><Pressable onPress={() => navigation.goBack()} disabled={saving} accessibilityRole="button" accessibilityLabel="Cancel plan changes" className="min-h-[48px] items-center justify-center"><Text className="text-m3-on-surface font-semibold text-sm">Cancel</Text></Pressable></ScrollView></Screen>;
}
