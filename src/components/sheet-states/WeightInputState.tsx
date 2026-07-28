import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import {
  SaveWeightResult,
  WeightUnit,
  getEarliestWeightLogAfter,
  getLatestWeightLogOnOrBefore,
  getNearestWeightNeighbors,
  getProfile,
  getWeightLogByDate,
  saveWeightLog,
} from '../../db/database';
import DateSelector from '../DateSelector';
import PrimaryButton from '../PrimaryButton';
import SegmentedControl from '../SegmentedControl';
import { formatLocalISO, parseLocalISO, todayISO } from '../../utils/calendar';
import { formatWeight, fromKilograms, parseWeightInput, toKilograms } from '../../utils/weightUnits';
import { M3 } from '../../theme/tokens';
import { useDiscardGuardContext } from './useDiscardGuard';

interface WeightInputStateProps {
  onLogComplete: (result: SaveWeightResult) => void;
}

interface Baseline {
  dateISO: string;
  weightKg: number | null;
  unit: WeightUnit;
}

function isLargeJump(valueKg: number, neighborKg: number): boolean {
  const difference = Math.abs(valueKg - neighborKg);
  return difference > 5 && difference > neighborKg * 0.05;
}

function confirmLargeJump(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Check weight',
      'This is a large change from a nearby check-in. Save it anyway?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Save anyway', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export default function WeightInputState({ onLogComplete }: WeightInputStateProps) {
  const discardGuard = useDiscardGuardContext();
  const [dateISO, setDateISO] = useState(() => todayISO());
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [weightText, setWeightText] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [existing, setExisting] = useState(false);
  const [dateSelectorVisible, setDateSelectorVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const baselineRef = useRef<Baseline>({ dateISO: todayISO(), weightKg: null, unit: 'kg' });
  const draftRef = useRef<Baseline>(baselineRef.current);

  const parsed = parseWeightInput(weightText);
  const weightKg = parsed == null ? null : toKilograms(parsed, unit);
  draftRef.current = { dateISO, weightKg, unit };

  const loadDate = useCallback(async (nextDateISO: string, nextUnit: WeightUnit) => {
    setLoading(true);
    setSaveError(null);
    try {
      const exact = await getWeightLogByDate(nextDateISO);
      const fallback = exact
        ?? await getLatestWeightLogOnOrBefore(nextDateISO)
        ?? await getEarliestWeightLogAfter(nextDateISO);
      const nextWeightKg = fallback?.scale_weight_kg ?? null;
      setDateISO(nextDateISO);
      setWeightText(nextWeightKg == null ? '' : formatWeight(nextWeightKg, nextUnit));
      setExisting(exact != null);
      baselineRef.current = { dateISO: nextDateISO, weightKg: nextWeightKg, unit: nextUnit };
      setLoadError(false);
      return true;
    } catch (error) {
      console.error('[WeightInput] date prefill failed', error);
      setLoadError(true);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setReady(false);
    setLoading(true);
    setLoadError(false);
    try {
      const profile = await getProfile();
      if (!profile) throw new Error('Profile missing');
      setUnit(profile.weight_unit);
      setBirthDate(parseLocalISO(profile.birth_date));
      const loaded = await loadDate(todayISO(), profile.weight_unit);
      setReady(loaded);
    } catch (error) {
      console.error('[WeightInput] initial prefill failed', error);
      setLoadError(true);
      setLoading(false);
    }
  }, [loadDate]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => discardGuard.register(
    () => {
      const clean = baselineRef.current;
      const draft = draftRef.current;
      const weightChanged = draft.weightKg == null
        ? clean.weightKg != null || weightText.trim().length > 0
        : clean.weightKg == null || Math.abs(draft.weightKg - clean.weightKg) > 0.0005;
      return draft.dateISO !== clean.dateISO || draft.unit !== clean.unit || weightChanged;
    },
    () => { baselineRef.current = draftRef.current; },
  ), [discardGuard, weightText]);

  const handleUnitChange = useCallback((nextUnit: WeightUnit) => {
    if (nextUnit === unit) return;
    const current = parseWeightInput(weightText);
    if (current != null) {
      const currentKg = toKilograms(current, unit);
      setWeightText(fromKilograms(currentKg, nextUnit).toFixed(1));
    }
    setUnit(nextUnit);
  }, [unit, weightText]);

  const handleSave = useCallback(async () => {
    const value = parseWeightInput(weightText);
    if (value == null) {
      setSaveError('Enter a valid weight with up to two decimal places.');
      return;
    }
    const canonicalKg = toKilograms(value, unit);
    if (canonicalKg < 20 || canonicalKg > 500) {
      setSaveError('Weight must be between 20 kg and 500 kg.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const neighbors = await getNearestWeightNeighbors(dateISO);
      const suspicious = [neighbors.before, neighbors.after].some(
        (neighbor) => neighbor != null && isLargeJump(canonicalKg, neighbor.scale_weight_kg),
      );
      if (suspicious && !await confirmLargeJump()) return;
      const result = await saveWeightLog({ logDate: dateISO, scaleWeightKg: canonicalKg, weightUnit: unit });
      baselineRef.current = { dateISO, weightKg: result.log.scale_weight_kg, unit };
      draftRef.current = baselineRef.current;
      onLogComplete(result);
    } catch (error) {
      console.error('[WeightInput] save failed', error);
      setSaveError("Couldn't save this weight. Try again.");
    } finally {
      setSaving(false);
    }
  }, [dateISO, onLogComplete, unit, weightText]);

  if (!ready && !loadError) {
    return (
      <View className="flex-1 px-5 gap-5">
        <View className="gap-2">
          <View className="h-6 w-28 rounded-full bg-m3-surface-container-highest" />
          <View className="h-3 w-56 rounded-full bg-m3-surface-container-high" />
        </View>
        <View className="h-[52px] rounded-2xl bg-m3-surface-container-high" />
        <View className="h-[112px] rounded-3xl bg-m3-surface-container-high" />
        <View className="h-[52px] rounded-full bg-m3-surface-container-high" />
      </View>
    );
  }

  if (loadError || !birthDate) {
    return (
      <View className="flex-1 items-center justify-center px-6 gap-4">
        <MaterialIcons name="error-outline" size={36} color={M3.onSurfaceVariant} />
        <Text className="text-m3-on-surface-variant text-sm text-center">Couldn't load weight details.</Text>
        <Pressable onPress={loadInitial} accessibilityRole="button" className="min-h-[48px] px-6 rounded-full bg-white items-center justify-center active:opacity-80">
          <Text className="text-black text-sm font-semibold">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <BottomSheetScrollView className="flex-1" contentContainerClassName="px-5 pb-8 gap-5" keyboardShouldPersistTaps="handled">
      <View className="gap-1">
        <Text className="text-m3-on-surface text-xl font-bold">Log weight</Text>
        <Text className="text-m3-on-surface-variant text-xs">Add today's scale reading or a past check-in.</Text>
      </View>

      <Pressable
        onPress={() => setDateSelectorVisible(true)}
        disabled={loading || saving}
        accessibilityRole="button"
        accessibilityLabel="Select weight date"
        className="min-h-[52px] px-4 rounded-2xl bg-m3-surface-container-high border border-m3-outline-variant/30 flex-row items-center justify-between active:opacity-70"
      >
        <Text className="text-m3-on-surface text-sm font-semibold">
          {parseLocalISO(dateISO).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </Text>
        <MaterialIcons name="calendar-today" size={18} color={M3.onSurfaceVariant} />
      </Pressable>

      <View className="items-center rounded-3xl bg-m3-surface-container-high px-5 py-5 border border-m3-outline-variant/30">
        <View className="flex-row items-baseline justify-center">
          <BottomSheetTextInput
            value={weightText}
            onChangeText={(text) => {
              if (/^\d*(?:[.,]\d{0,2})?$/.test(text)) setWeightText(text);
              setSaveError(null);
            }}
            editable={!loading && !saving}
            keyboardType="decimal-pad"
            selectTextOnFocus
            accessibilityLabel={`Weight in ${unit === 'kg' ? 'kilograms' : 'pounds'}`}
            placeholder="—"
            placeholderTextColor={M3.placeholder}
            className="min-w-[150px] text-center text-m3-on-surface text-4xl font-bold tabular-nums py-2"
          />
          <Text className="text-m3-on-surface-variant text-base font-semibold">{unit}</Text>
        </View>
      </View>

      <SegmentedControl
        options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
        value={unit}
        onChange={handleUnitChange}
      />

      {saveError && (
        <Text accessibilityLiveRegion="assertive" className="text-m3-error text-xs font-medium">{saveError}</Text>
      )}

      <PrimaryButton
        title={existing ? 'Update weight' : 'Log weight'}
        icon="monitor-weight"
        onPress={handleSave}
        disabled={loading || parseWeightInput(weightText) == null}
        loading={saving}
      />

      <DateSelector
        visible={dateSelectorVisible}
        value={parseLocalISO(dateISO)}
        minimumDate={birthDate}
        maximumDate={parseLocalISO(todayISO())}
        onCancel={() => setDateSelectorVisible(false)}
        onConfirm={(date) => {
          setDateSelectorVisible(false);
          void loadDate(formatLocalISO(date), unit);
        }}
      />
    </BottomSheetScrollView>
  );
}
