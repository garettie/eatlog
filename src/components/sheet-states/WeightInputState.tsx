import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import {
  SaveWeightResult,
  WeightOrigin,
  WeightUnit,
  getEarliestWeightLogAfter,
  getLatestWeightLogOnOrBefore,
  getNearestWeightNeighbors,
  getProfile,
  getWeightLogByDate,
  saveWeightLog,
} from '../../db/database';
import PrimaryButton from '../PrimaryButton';
import SegmentedControl from '../SegmentedControl';
import { type ShowSheetDialog, useSheetDialog } from '../SheetDialog';
import { showLogDatePicker } from '../LogDatePicker';
import { formatLocalISO, formatLogDateLabel, parseLocalISO, todayISO } from '../../utils/calendar';
import { formatWeight, fromKilograms, parseWeightInput, toKilograms } from '../../utils/weightUnits';
import { M3 } from '../../theme/tokens';
import { useToday } from '../../hooks/useToday';
import { useDiscardGuardContext } from './useDiscardGuard';
import SheetBackButton from './SheetBackButton';
import { supportsHealthConnect } from '../../services/platformFeatures';

interface WeightInputStateProps {
  onLogComplete: (result: SaveWeightResult) => void;
  onBack: () => void;
  onContentHeightChange: (height: number) => void;
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

function confirmLargeJump(showDialog: ShowSheetDialog): Promise<boolean> {
  return new Promise((resolve) => {
    showDialog({
      title: 'Check weight',
      message: 'This is a large change from a nearby check-in. Save it anyway?',
      actions: [
        { label: 'Cancel', tone: 'cancel', onPress: () => resolve(false) },
        { label: 'Save anyway', tone: 'primary', onPress: () => resolve(true) },
      ],
    });
  });
}

export default function WeightInputState({ onLogComplete, onBack, onContentHeightChange }: WeightInputStateProps) {
  const discardGuard = useDiscardGuardContext();
  const showDialog = useSheetDialog();
  const [dateISO, setDateISO] = useState(() => todayISO());
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [weightText, setWeightText] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [existing, setExisting] = useState(false);
  const [existingOrigin, setExistingOrigin] = useState<WeightOrigin | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const baselineRef = useRef<Baseline>({ dateISO: todayISO(), weightKg: null, unit: 'kg' });
  const draftRef = useRef<Baseline>(baselineRef.current);
  const today = useToday();
  const dateExplicitRef = useRef(false);
  const effectiveDate = dateExplicitRef.current ? dateISO : today;

  const parsed = parseWeightInput(weightText);
  const weightKg = parsed == null ? null : toKilograms(parsed, unit);
  draftRef.current = { dateISO: effectiveDate, weightKg, unit };

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
      setExistingOrigin(exact?.origin ?? null);
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
      const neighbors = await getNearestWeightNeighbors(effectiveDate);
      const suspicious = [neighbors.before, neighbors.after].some(
        (neighbor) => neighbor != null && isLargeJump(canonicalKg, neighbor.scale_weight_kg),
      );
      if (suspicious && !await confirmLargeJump(showDialog)) return;
      const result = await saveWeightLog({ logDate: effectiveDate, scaleWeightKg: canonicalKg, weightUnit: unit });
      baselineRef.current = { dateISO: effectiveDate, weightKg: result.log.scale_weight_kg, unit };
      draftRef.current = baselineRef.current;
      onLogComplete(result);
    } catch (error) {
      console.error('[WeightInput] save failed', error);
      setSaveError("Couldn't save this weight. Try again.");
    } finally {
      setSaving(false);
    }
  }, [effectiveDate, onLogComplete, unit, weightText]);

  const handleContentLayout = useCallback(
    (event: LayoutChangeEvent) => onContentHeightChange(event.nativeEvent.layout.height),
    [onContentHeightChange],
  );

  if (!ready && !loadError) {
    return (
      <View className="px-5 pb-8 gap-5">
        <View className="flex-row items-center gap-1">
          <SheetBackButton onPress={onBack} />
          <View className="h-6 w-28 rounded-full bg-m3-surface-container-highest" />
        </View>
        <View className="h-[52px] rounded-2xl bg-m3-surface-container-high" />
        <View className="h-[112px] rounded-3xl bg-m3-surface-container-high" />
        <View className="h-[52px] rounded-full bg-m3-surface-container-high" />
      </View>
    );
  }

  if (loadError || !birthDate) {
    return (
      <View onLayout={handleContentLayout} className="min-h-[240px] items-center justify-center px-6 gap-4">
        <View className="absolute left-5 top-2">
          <SheetBackButton onPress={onBack} />
        </View>
        <MaterialIcons name="error-outline" size={36} color={M3.onSurfaceVariant} />
        <Text className="text-m3-on-surface-variant text-sm text-center">Couldn't load weight details.</Text>
        <Pressable onPress={loadInitial} accessibilityRole="button" className="min-h-[48px] px-6 rounded-full bg-white items-center justify-center active:opacity-80">
          <Text className="text-black text-sm font-semibold">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <BottomSheetScrollView
      className="flex-1"
      contentContainerClassName="px-5 pb-8 gap-5"
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={(_width, height) => onContentHeightChange(height)}
    >
      <View className="flex-row items-center gap-1">
        <SheetBackButton onPress={onBack} />
        <View className="flex-1">
          <Text className="text-m3-on-surface text-xl font-bold">Log weight</Text>
        </View>
      </View>

      <Pressable
        onPress={() => showLogDatePicker(showDialog, {
          value: effectiveDate,
          today,
          minDate: formatLocalISO(birthDate),
          maxDate: today,
          onSelect: (dateISO) => {
            dateExplicitRef.current = true;
            void loadDate(dateISO, unit);
          },
        })}
        disabled={loading || saving}
        accessibilityRole="button"
        accessibilityLabel="Select weight date"
        className="min-h-[52px] px-4 rounded-2xl bg-m3-surface-container-high border border-m3-outline-variant/30 flex-row items-center justify-between active:opacity-70"
      >
        <Text numberOfLines={2} className="flex-1 pr-3 text-m3-on-surface text-sm font-semibold">
          {formatLogDateLabel(effectiveDate)}
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

      {existingOrigin === 'health_connect' ? (
        <View className="rounded-2xl border border-m3-outline-variant/40 bg-m3-surface-container px-4 py-3">
          <Text className="text-sm font-semibold text-m3-on-surface">
            {supportsHealthConnect(Platform.OS) ? 'Imported from Health Connect' : 'Imported weight'}
          </Text>
          <Text className="mt-1 text-sm text-m3-on-surface-variant">Saving changes makes this an Eatlog entry, so it takes priority for this date.</Text>
        </View>
      ) : null}

      {saveError && (
        <Text accessibilityLiveRegion="assertive" className="text-m3-error text-xs font-medium">{saveError}</Text>
      )}

      <PrimaryButton
        title={existing ? 'Update weight' : 'Log weight'}
        icon="monitor-weight"
        iconPosition="left"
        onPress={handleSave}
        disabled={loading || parseWeightInput(weightText) == null}
        loading={saving}
      />

    </BottomSheetScrollView>
  );
}
