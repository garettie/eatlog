import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import { showDatePicker } from '../components/DatePicker';
import { SheetDialogOverlay, useSheetDialogHost } from '../components/SheetDialog';
import GoalRateControl from '../components/GoalRateControl';
import GoalTypeSelector from '../components/GoalTypeSelector';
import PrimaryButton from '../components/PrimaryButton';
import RulerSlider from '../components/RulerSlider';
import ChoiceCards, { type ChoiceCardOption } from '../components/ChoiceCards';
import SegmentedControl from '../components/SegmentedControl';
import TappableRow from '../components/TappableRow';
import {
    CurrentPlanChangedError,
    type ActivityLevel,
    type DailyTarget,
    type DailyTargetInput,
    type GoalType,
    getDailyTargetForDate,
    getLatestWeightLogOnOrBefore,
    getProfile,
    type Profile,
    type ProfileUpdate,
    type Sex,
    type WeightUnit,
    type WeightLog,
    updateProfileAndPlan,
    updateProfilePresentation,
} from '../db/database';
import { calcBMR, calcTDEE, calculateTargets, type MacroTargets } from '../utils/calculations';
import { formatLocalISO, parseLocalISO, todayISO } from '../utils/calendar';
import { MANUAL_TARGET_CALORIE_TOLERANCE, macroCalories, validateManualTargets } from '../utils/planValidation';
import { cmToFeetInches, feetInchesToCm, formatHeight, fromKilograms, toKilograms } from '../utils/weightUnits';
import { M3 } from '../theme/tokens';
import { goalRateBounds, isGoalRateValid } from '../utils/goalRate';
import {
    ESTIMATE_DISCLAIMER,
    ageOnDate,
    birthDateBounds,
    profileSafetyIssues,
    validateBirthDate,
    validateHeightCm,
    validateWeightKg,
} from '../utils/nutritionSafety';
import ResponsiveContent from '../components/ResponsiveContent';
import { FORM_MAX_WIDTH } from '../theme/layout';

export type ProfileStackParamList = {
    ProfileHome: undefined;
    PersonalDetails: undefined;
    GoalAndRate: undefined;
    NutritionTargets: undefined;
    Units: undefined;
    Privacy: undefined;
    BackupRestore: undefined;
    ExportData: undefined;
    HealthConnect: undefined;
    HowEatlogWorks: undefined;
    About: undefined;
    Attributions: undefined;
    PlanPreview: { profile: ProfileUpdate; target: DailyTargetInput; baselineTarget: DailyTarget };
    SubscriptionPlan: undefined;
    AiEstimates: undefined;
};

type Props = NativeStackScreenProps<ProfileStackParamList, 'PlanPreview'> & { onDataChanged: () => void };

// Same choice cards as onboarding.
const SEX_CHOICES: ChoiceCardOption<Sex>[] = [
    { value: 'male', icon: 'male', title: 'Male' },
    { value: 'female', icon: 'female', title: 'Female' },
];
const UNIT_CHOICES: ChoiceCardOption<WeightUnit>[] = [
    { value: 'kg', icon: 'straighten', title: 'Metric', subtitle: 'kg · cm' },
    { value: 'lb', icon: 'public', title: 'Imperial', subtitle: 'lb · ft, in' },
];

const ACTIVITY_LEVEL_OPTIONS: Array<{ value: ActivityLevel; title: string; subtitle: string }> = [
    { value: 'sedentary', title: 'Sedentary', subtitle: 'Desk job, little formal exercise' },
    { value: 'light', title: 'Light', subtitle: 'Light exercise 1-3 days/week' },
    { value: 'moderate', title: 'Moderate', subtitle: '3-5 workouts/week, active day' },
    { value: 'active', title: 'Active', subtitle: '6-7 workouts or physical job' },
    { value: 'very_active', title: 'Very Active', subtitle: 'Physical job + daily training' },
];

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
                placeholderTextColor={M3.placeholder}
                underlineColorAndroid="transparent"
                className={`min-h-[48px] bg-m3-surface-container-high border rounded-xl px-4 text-m3-on-surface text-sm font-semibold ${error ? 'border-m3-error' : 'border-m3-outline-variant/40'}`}
            />
            {error ? <Text accessibilityLiveRegion="assertive" className="text-m3-error text-xs">{error}</Text> : null}
        </View>
    );
}

function Screen({ children }: { children: React.ReactNode }) {
    return (
        <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-m3-surface">
            <ResponsiveContent className="flex-1" maxWidth={FORM_MAX_WIDTH}>{children}</ResponsiveContent>
        </SafeAreaView>
    );
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

function preferredWeightKg(
    weight: WeightLog | null,
): number | null {
    if (weight?.trend_weight_kg != null && !validateWeightKg(weight.trend_weight_kg, 'Trend weight')) {
        return weight.trend_weight_kg;
    }
    if (weight?.scale_weight_kg != null && !validateWeightKg(weight.scale_weight_kg, 'Scale weight')) {
        return weight.scale_weight_kg;
    }
    return null;
}

async function prepareCalculatedPlan(
    nextProfile: ProfileUpdate,
    effectiveDate = todayISO(),
): Promise<ProfileStackParamList['PlanPreview']> {
    const [baselineTarget, weight] = await Promise.all([
        getDailyTargetForDate(effectiveDate),
        getLatestWeightLogOnOrBefore(effectiveDate),
    ]);
    if (!baselineTarget) throw new Error('Current target is unavailable.');
    const weightKg = preferredWeightKg(weight);
    const profileIssue = profileSafetyIssues(nextProfile, { currentWeightKg: weightKg, requireCurrentWeight: true })[0];
    if (profileIssue) throw new Error(profileIssue);
    if (weightKg == null) throw new Error('Add a valid weight check-in before recalculating targets.');
    const tdee = calcTDEE(calcBMR({ sex: nextProfile.sex, weight_kg: weightKg, height_cm: nextProfile.height_cm, age: ageOnDate(nextProfile.birth_date, effectiveDate) }), nextProfile.activity_level);
    const macros = calculateTargets({
        tdeeKcal: tdee,
        goalType: nextProfile.goal_type,
        proteinPreference: nextProfile.protein_preference,
        weightKg,
        goalRateKgPerWeek: nextProfile.goal_rate_kg_per_week,
    });
    return {
        profile: nextProfile,
        target: { effective_date: effectiveDate, tdee_estimate: Math.round(tdee), target_calories: macros.targetCalories, target_protein_g: macros.targetProteinG, target_fat_g: macros.targetFatG, target_carbs_g: macros.targetCarbsG, calculation_method: 'profile_recalculation' },
        baselineTarget,
    };
}

async function calculatedPlan(
    profile: Profile,
    overrides: Partial<ProfileUpdate> = {},
): Promise<ProfileStackParamList['PlanPreview']> {
    return prepareCalculatedPlan(toUpdate(profile, overrides));
}

async function prepareManualPlan(
    profile: ProfileUpdate,
    targets: MacroTargets,
    effectiveDate = todayISO(),
): Promise<ProfileStackParamList['PlanPreview']> {
    const current = await getDailyTargetForDate(effectiveDate);
    if (!current) throw new Error('Current target is unavailable.');
    const currentWeightKg = preferredWeightKg(await getLatestWeightLogOnOrBefore(effectiveDate));
    if (currentWeightKg == null) throw new Error('Add a valid weight check-in before editing targets.');
    const validation = validateManualTargets(targets, {
        goalType: profile.goal_type,
        referenceWeightKg: currentWeightKg,
        tdeeEstimate: current.tdee_estimate,
    });
    if (validation) throw new Error(validation);
    return {
        profile,
        target: {
            effective_date: effectiveDate,
            tdee_estimate: current.tdee_estimate,
            target_calories: targets.targetCalories,
            target_protein_g: targets.targetProteinG,
            target_fat_g: targets.targetFatG,
            target_carbs_g: targets.targetCarbsG,
            calculation_method: 'manual',
        },
        baselineTarget: current,
    };
}

function samePlanTarget(left: DailyTargetInput, right: DailyTargetInput): boolean {
    return left.effective_date === right.effective_date
        && left.tdee_estimate === right.tdee_estimate
        && left.target_calories === right.target_calories
        && left.target_protein_g === right.target_protein_g
        && left.target_fat_g === right.target_fat_g
        && left.target_carbs_g === right.target_carbs_g
        && left.calculation_method === right.calculation_method;
}

async function refreshPlanPreview(
    params: ProfileStackParamList['PlanPreview'],
): Promise<ProfileStackParamList['PlanPreview']> {
    const proposed = params.target;
    return proposed.calculation_method === 'manual'
        ? prepareManualPlan(params.profile, {
            targetCalories: proposed.target_calories,
            targetProteinG: proposed.target_protein_g,
            targetFatG: proposed.target_fat_g,
            targetCarbsG: proposed.target_carbs_g,
        })
        : prepareCalculatedPlan(params.profile);
}

function useProfile() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    useEffect(() => {
        let cancelled = false;
        setError(null);
        void getProfile()
            .then((next) => { if (!cancelled) setProfile(next); })
            .catch(() => {
                if (!cancelled) {
                    setProfile(null);
                    setError('Could not load your profile.');
                }
            });
        return () => { cancelled = true; };
    }, [retryToken]);
    return { profile, error, retry: () => setRetryToken((token) => token + 1) };
}

function ProfileLoadState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
    if (error) {
        return (
            <Screen>
                <View className="flex-1 items-center justify-center gap-3 px-6">
                    <Text accessibilityLiveRegion="assertive" className="text-center text-base font-semibold text-m3-on-surface">{error}</Text>
                    <Text className="text-center text-sm text-m3-on-surface-variant">Your logbook is still on this device.</Text>
                    <PrimaryButton title="Try again" onPress={onRetry} />
                </View>
            </Screen>
        );
    }
    return (
        <Screen>
            <View className="flex-1 items-center justify-center">
                <ActivityIndicator color={M3.onSurfaceVariant} accessibilityLabel="Loading profile" />
            </View>
        </Screen>
    );
}

export function PersonalDetailsScreen({ onDataChanged }: { onDataChanged: () => void }) {
    const navigation = useNavigation<NavigationProp<ProfileStackParamList>>();
    const { profile, error: loadError, retry } = useProfile();
    const [name, setName] = useState('');
    const [sex, setSex] = useState<Sex>('male');
    const [birthDate, setBirthDate] = useState('');
    const birthDateDialog = useSheetDialogHost();
    const [height, setHeight] = useState('');
    const [heightInches, setHeightInches] = useState('');
    const [activity, setActivity] = useState<ActivityLevel>('moderate');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (profile) { setName(profile.display_name); setSex(profile.sex); setBirthDate(profile.birth_date); setHeight(profile.weight_unit === 'kg' ? String(profile.height_cm) : String(cmToFeetInches(profile.height_cm).feet)); setHeightInches(profile.weight_unit === 'kg' ? '' : String(cmToFeetInches(profile.height_cm).inches)); setActivity(profile.activity_level); } }, [profile]);
    const save = useCallback(async () => {
        if (!profile) return;
        const heightCm = profile.weight_unit === 'kg' ? Number(height) : feetInchesToCm(Number(height), Number(heightInches));
        const birthIssue = validateBirthDate(birthDate);
        if (birthIssue) { setError(birthIssue); return; }
        const heightIssue = validateHeightCm(heightCm);
        if (heightIssue) { setError(heightIssue); return; }
        const next = toUpdate(profile, { display_name: name.trim(), sex, birth_date: birthDate, height_cm: heightCm, activity_level: activity });
        const calculationChanged = next.sex !== profile.sex
            || next.birth_date !== profile.birth_date
            || next.height_cm !== profile.height_cm
            || next.activity_level !== profile.activity_level;
        setSaving(true); setError(null);
        try {
            if (calculationChanged) {
                navigation.navigate('PlanPreview', await prepareCalculatedPlan(next));
                return;
            }
            await updateProfilePresentation({
                display_name: next.display_name,
                weight_unit: next.weight_unit,
            });
            onDataChanged();
            navigation.goBack();
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save personal details.'); } finally { setSaving(false); }
    }, [activity, birthDate, height, heightInches, name, navigation, onDataChanged, profile, sex]);
    if (!profile) return <ProfileLoadState error={loadError} onRetry={retry} />;
    const heightFields = profile.weight_unit === 'kg' ? <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" /> : <View className="flex-row gap-3"><View className="flex-1"><Field label="Height (ft)" value={height} onChangeText={setHeight} keyboardType="numeric" /></View><View className="flex-1"><Field label="Height (in)" value={heightInches} onChangeText={setHeightInches} keyboardType="numeric" /></View></View>;
    const selectedBirthDate = parseLocalISO(birthDate || profile.birth_date);
    const dateBounds = birthDateBounds();
    return (
        <Screen>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
                <ScrollView
                    className="flex-1"
                    contentContainerClassName="p-6 gap-5"
                    keyboardShouldPersistTaps="handled"
                >
                    <Card className="p-5 gap-5">
                        <Field label="Display name" value={name} onChangeText={setName} />
                        <ChoiceCards options={SEX_CHOICES} value={sex} onChange={setSex} accessibilityLabel="Biological sex" />
                        <View className="gap-2">
                            <Text className="text-m3-on-surface-variant text-xs font-semibold">Birth date</Text>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Select birth date"
                                accessibilityHint="Opens the date selector"
                                onPress={() => showDatePicker(birthDateDialog.show, {
                                    title: 'Birth date',
                                    value: formatLocalISO(selectedBirthDate),
                                    today: todayISO(),
                                    minDate: formatLocalISO(dateBounds.earliest),
                                    maxDate: formatLocalISO(dateBounds.latest),
                                    onSelect: (dateISO) => {
                                        setBirthDate(dateISO);
                                        setError(null);
                                    },
                                })}
                                className="min-h-[48px] rounded-xl border border-m3-outline-variant/40 bg-m3-surface-container-high px-4 flex-row items-center justify-between active:opacity-70"
                            >
                                <Text className="text-m3-on-surface text-sm font-semibold">
                                    {selectedBirthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                </Text>
                                <MaterialIcons name="calendar-today" size={16} color={M3.onSurfaceVariant} />
                            </Pressable>
                        </View>
                        {heightFields}
                    </Card>
                    <View accessibilityRole="radiogroup" accessibilityLabel="Activity level" className="gap-2">
                        <Text className="text-m3-on-surface-variant text-xs font-semibold">Activity level</Text>
                        {ACTIVITY_LEVEL_OPTIONS.map(({ value, title, subtitle }) => (
                            <TappableRow
                                key={value}
                                title={title}
                                subtitle={subtitle}
                                selected={activity === value}
                                onPress={() => setActivity(value)}
                            />
                        ))}
                    </View>
                </ScrollView>
                <View className="border-t border-m3-outline-variant/30 px-6 pb-4 pt-3 gap-2">
                    {error ? <Text accessibilityLiveRegion="assertive" className="text-m3-error text-sm">{error}</Text> : null}
                    <PrimaryButton title="Save changes" onPress={() => void save()} loading={saving} />
                </View>
            </KeyboardAvoidingView>
            <SheetDialogOverlay host={birthDateDialog} />
        </Screen>
    );
}

export function UnitsScreen({ onDataChanged }: { onDataChanged: () => void }) {
    const navigation = useNavigation<NavigationProp<ProfileStackParamList>>(); const { profile, error: loadError, retry } = useProfile();
    const [unit, setUnit] = useState<'kg' | 'lb'>('kg'); const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [weightKg, setWeightKg] = useState<number | null>(null);
    useEffect(() => {
        if (!profile) return;
        setUnit(profile.weight_unit);
        void getLatestWeightLogOnOrBefore(todayISO()).then((weight) => setWeightKg(weight?.scale_weight_kg ?? null)).catch(() => setWeightKg(null));
    }, [profile]);
    const save = useCallback(async () => {
        if (!profile || unit === profile.weight_unit) { navigation.goBack(); return; }
        setSaving(true);
        setSaveError(null);
        try {
            await updateProfilePresentation({ display_name: profile.display_name, weight_unit: unit });
            onDataChanged();
            navigation.goBack();
        } catch (cause) {
            setSaveError(cause instanceof Error ? cause.message : 'Could not save units.');
        } finally {
            setSaving(false);
        }
    }, [navigation, onDataChanged, profile, unit]);
    if (!profile) return <ProfileLoadState error={loadError} onRetry={retry} />;
    return <Screen><ScrollView contentContainerClassName="p-6 gap-5"><ChoiceCards options={UNIT_CHOICES} value={unit} onChange={setUnit} accessibilityLabel="Units" /><Card className="p-5 gap-4"><Text className="text-m3-on-surface font-semibold">Preview</Text><View className="gap-3"><View className="flex-row justify-between gap-4"><Text className="text-m3-on-surface-variant text-sm">Height</Text><Text className="text-m3-on-surface text-sm font-semibold tabular-nums">{formatHeight(profile.height_cm, unit)}</Text></View><View className="flex-row justify-between gap-4"><Text className="text-m3-on-surface-variant text-sm">Weight</Text><Text className="text-m3-on-surface text-sm font-semibold tabular-nums">{weightKg == null ? 'Not logged' : `${fromKilograms(weightKg, unit).toFixed(1)} ${unit}`}</Text></View></View></Card>{saveError ? <Text accessibilityLiveRegion="assertive" className="text-m3-error text-sm">{saveError}</Text> : null}<PrimaryButton title="Save units" onPress={() => void save()} loading={saving} /></ScrollView></Screen>;
}

export function GoalAndRateScreen() {
    const navigation = useNavigation<NavigationProp<ProfileStackParamList>>();
    const { profile, error: loadError, retry } = useProfile();
    const [goal, setGoal] = useState<GoalType>('maintain');
    const [targetWeight, setTargetWeight] = useState(0);
    const [rateKg, setRateKg] = useState(0);
    const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    const tdeeKcal = useMemo(() => {
        if (!profile || currentWeightKg == null) return null;
        try {
            return calcTDEE(calcBMR({ sex: profile.sex, weight_kg: currentWeightKg, height_cm: profile.height_cm, age: ageOnDate(profile.birth_date, todayISO()) }), profile.activity_level);
        } catch {
            return null;
        }
    }, [profile, currentWeightKg]);

    useEffect(() => {
        if (!profile) return;
        let active = true;
        void (async () => {
            try {
                const latestWeight = await getLatestWeightLogOnOrBefore(todayISO());
                const latestWeightKg = latestWeight?.trend_weight_kg != null && !validateWeightKg(latestWeight.trend_weight_kg, 'Trend weight')
                    ? latestWeight.trend_weight_kg
                    : latestWeight?.scale_weight_kg != null && !validateWeightKg(latestWeight.scale_weight_kg, 'Scale weight')
                        ? latestWeight.scale_weight_kg
                        : null;
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
            if (currentWeightKg != null) setTargetWeight(fromKilograms(currentWeightKg, profile?.weight_unit ?? 'kg'));
            return;
        }

        const fallbackWeightKg = profile?.target_weight_kg ?? null;
        const baseWeightKg = currentWeightKg ?? fallbackWeightKg;
        if (nextGoal === 'cut') {
            setRateKg(goalRateBounds('cut', baseWeightKg, tdeeKcal).defaultRate);
            if (baseWeightKg != null) {
                setTargetWeight(fromKilograms(Math.max(30, baseWeightKg - 5), profile?.weight_unit ?? 'kg'));
            }
            return;
        }

        setRateKg(goalRateBounds('bulk', baseWeightKg, tdeeKcal).defaultRate);
        if (baseWeightKg != null) {
            setTargetWeight(fromKilograms(Math.min(300, baseWeightKg + 3), profile?.weight_unit ?? 'kg'));
        }
    }, [currentWeightKg, profile, tdeeKcal]);

    const save = useCallback(async () => {
        if (!profile) return; const targetKg = toKilograms(targetWeight, profile.weight_unit);
        const targetWeightIssue = validateWeightKg(targetKg, 'Target weight');
        if (targetWeightIssue) { setError(targetWeightIssue); return; }
        if (!isGoalRateValid(rateKg, goal, currentWeightKg)) { setError('Use a rate within the safe range for the selected goal and weight.'); return; }
        setSaving(true); setError(null); try { navigation.navigate('PlanPreview', await calculatedPlan(profile, { goal_type: goal, goal_rate_kg_per_week: goal === 'maintain' ? 0 : rateKg, target_weight_kg: targetKg })); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not calculate a plan.'); } finally { setSaving(false); }
    }, [goal, navigation, profile, rateKg, targetWeight]);

    if (!profile || !hydrated) return <ProfileLoadState error={loadError} onRetry={retry} />;

    const weightUnit = profile.weight_unit === 'kg' ? 'kg' : 'lbs';
    const weightMin = profile.weight_unit === 'kg' ? 30 : 66.1;
    const weightMax = profile.weight_unit === 'kg' ? 300 : 661.4;
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
                            <Text className="text-sm font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                                Target Rate
                            </Text>
                            <GoalRateControl
                                goal={goal}
                                valueKgPerWeek={rateKg}
                                onValueChange={setRateKg}
                                weightUnit={profile.weight_unit}
                                currentWeightKg={currentWeightKg}
                                tdeeKcal={tdeeKcal}
                            />
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
    const navigation = useNavigation<NavigationProp<ProfileStackParamList>>(); const { profile, error: loadError, retry } = useProfile();
    const [mode, setMode] = useState<'calculated' | 'manual'>('calculated'); const [calories, setCalories] = useState(''); const [protein, setProtein] = useState(''); const [fat, setFat] = useState(''); const [carbs, setCarbs] = useState(''); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
    useEffect(() => { if (!profile) return; void getDailyTargetForDate(todayISO()).then((target) => { if (target) { setCalories(String(target.target_calories)); setProtein(String(target.target_protein_g)); setFat(String(target.target_fat_g)); setCarbs(String(target.target_carbs_g)); } }); }, [profile]);
    const save = useCallback(async () => {
        if (!profile) return; setSaving(true); setError(null); try {
            if (mode === 'calculated') { navigation.navigate('PlanPreview', await calculatedPlan(profile)); return; }
            const targets: MacroTargets = { targetCalories: Number(calories), targetProteinG: Number(protein), targetFatG: Number(fat), targetCarbsG: Number(carbs) };
            navigation.navigate('PlanPreview', await prepareManualPlan(toUpdate(profile), targets));
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare targets.'); } finally { setSaving(false); }
    }, [calories, carbs, fat, mode, navigation, profile, protein]);
    if (!profile) return <ProfileLoadState error={loadError} onRetry={retry} />;
    const implied = macroCalories({ targetProteinG: Number(protein) || 0, targetFatG: Number(fat) || 0, targetCarbsG: Number(carbs) || 0 });
    return <Screen><ScrollView contentContainerClassName="p-6 gap-5"><SegmentedControl options={[{ value: 'calculated', label: 'Calculated' }, { value: 'manual', label: 'Custom' }]} value={mode} onChange={setMode} />{mode === 'calculated' ? <Card className="p-5"><Text className="text-m3-on-surface-variant text-sm">Recalculate calories and macros from your current profile, goal, and trend weight.</Text></Card> : <Card className="p-5 gap-4"><Field label="Calories (kcal)" value={calories} onChangeText={setCalories} keyboardType="numeric" /><Field label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" /><Field label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" /><Field label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" /><Text className="text-m3-on-surface-variant text-sm">Macros imply {Math.round(implied)} kcal. Keep this within {MANUAL_TARGET_CALORIE_TOLERANCE} kcal of the target.</Text></Card>}{error ? <Text className="text-m3-error text-sm">{error}</Text> : null}<PrimaryButton title="Continue to plan preview" onPress={() => void save()} loading={saving} /></ScrollView></Screen>;
}

function TargetCard({ label, target }: { label: string; target: DailyTargetInput }) { return <Card className="p-5 gap-2"><Text className="text-m3-on-surface-variant text-xs font-semibold">{label}</Text><Text className="text-m3-on-surface text-3xl font-bold tabular-nums">{Math.round(target.target_calories).toLocaleString()} kcal</Text><Text className="text-m3-on-surface-variant text-sm tabular-nums">P {target.target_protein_g}g · C {target.target_carbs_g}g · F {target.target_fat_g}g</Text></Card>; }

export function PlanPreviewScreen({ route, navigation, onDataChanged }: Props) {
    const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
    const source = route.params.target.calculation_method === 'manual' ? 'Manual' : 'Profile recalculation';
    const save = async () => {
        setSaving(true); setError(null);
        try {
            const proposed = route.params.target;
            const refreshed = await refreshPlanPreview(route.params);
            const baselineChanged = refreshed.baselineTarget.id !== route.params.baselineTarget.id;
            if (baselineChanged || !samePlanTarget(proposed, refreshed.target)) {
                navigation.setParams(refreshed);
                setError(baselineChanged
                    ? 'Current plan changed. Review the updated values, then save again.'
                    : 'Plan inputs changed. Review the updated values, then save again.');
                return;
            }
            await updateProfileAndPlan({
                profile: refreshed.profile,
                target: refreshed.target,
                expectedCurrentTargetId: refreshed.baselineTarget.id,
            });
            onDataChanged();
            navigation.popToTop();
        } catch (cause) {
            if (cause instanceof CurrentPlanChangedError) {
                try {
                    navigation.setParams(await refreshPlanPreview(route.params));
                } catch (refreshCause) {
                    setError(refreshCause instanceof Error ? refreshCause.message : 'Could not refresh your plan.');
                    return;
                }
            }
            setError(cause instanceof Error ? cause.message : 'Could not save your plan.');
        } finally { setSaving(false); }
    };
    return <Screen><ScrollView contentContainerClassName="p-6 gap-5" keyboardShouldPersistTaps="handled"><Text className="text-m3-on-surface-variant text-sm">Effective {route.params.target.effective_date}. Prior diary history stays unchanged.</Text><Text className="text-m3-on-surface-variant text-xs leading-4">{ESTIMATE_DISCLAIMER}</Text><TargetCard label="Current" target={route.params.baselineTarget} /><TargetCard label={`Proposed · ${source}`} target={route.params.target} />{error ? <Text className="text-m3-error text-sm">{error}</Text> : null}<PrimaryButton title="Save plan" onPress={() => void save()} loading={saving} /><Pressable onPress={() => navigation.goBack()} disabled={saving} accessibilityRole="button" accessibilityLabel="Cancel plan changes" className="min-h-[48px] items-center justify-center"><Text className="text-m3-on-surface font-semibold text-sm">Cancel</Text></Pressable></ScrollView></Screen>;
}
