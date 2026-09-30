import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import ResponsiveContent from '../components/ResponsiveContent';
import SegmentedControl from '../components/SegmentedControl';
import { useDataMaintenance } from '../context/DataMaintenanceContext';
import { importCsv, pickAndInspectCsv, reinspectCsv } from '../services/csvImport';
import { getDefaultCsvTimezone } from '../services/macroCsv';
import { supportsHealthConnect } from '../services/platformFeatures';
import type { CsvImportMode, CsvImportPreview } from '../services/macroCsv.types';
import { FORM_MAX_WIDTH } from '../theme/layout';
import { M3 } from '../theme/tokens';

export function CsvImportScreen() {
    const { runDataMaintenance } = useDataMaintenance();
    const healthSync = supportsHealthConnect(Platform.OS);
    const [preview, setPreview] = useState<CsvImportPreview | null>(null);
    const [timezone, setTimezone] = useState(getDefaultCsvTimezone);
    const [mode, setMode] = useState<CsvImportMode>('merge');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const timezoneChanged = preview != null && timezone.trim() !== preview.parsed.timezone;
    const mounted = useRef(true);
    const busyRef = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    async function inspect(changeTimezone = false) {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true); setError(null);
        try {
            const result = changeTimezone && preview
                ? await reinspectCsv(preview, timezone.trim())
                : await pickAndInspectCsv(timezone.trim());
            if (mounted.current && result) { setPreview(result); setTimezone(result.parsed.timezone); }
        } catch (cause) {
            if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not read this CSV. Choose a Macro-compatible CSV and try again.');
        } finally {
            busyRef.current = false;
            if (mounted.current) setBusy(false);
        }
    }

    function apply() {
        if (!preview || busyRef.current || timezone.trim() !== preview.parsed.timezone) return;
        const selectedPreview = preview;
        const selectedMode = mode;
        const run = () => {
            if (busyRef.current || !mounted.current) return;
            busyRef.current = true; setBusy(true); setError(null);
            void runDataMaintenance('Importing CSV', (report) => importCsv(selectedPreview, selectedMode, report))
                .catch((cause) => { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not import the CSV. Your existing data is unchanged.'); })
                .finally(() => { busyRef.current = false; if (mounted.current) setBusy(false); });
        };
        if (mode === 'replace') {
            Alert.alert('Replace food and weight history?', `This removes all existing food and weight entries and their meal photos. Your profile and target history stay. Adaptive reviews and day completeness confirmations are cleared and weight trends are recalculated.${healthSync ? ' Health Connect sync is paused.' : ''} Eatlog creates an internal safety copy first.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Replace history', style: 'destructive', onPress: run },
            ]);
        } else run();
    }

    return (
        <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-m3-surface">
            <ResponsiveContent className="flex-1" maxWidth={FORM_MAX_WIDTH}>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="p-6 gap-6">
                    <View className="gap-2">
                        <Text className="text-lg font-bold text-m3-on-surface">Import a Macro CSV</Text>
                        <Text className="text-sm text-m3-on-surface-variant">Bring meal and weight history from Macro or another Eatlog CSV export. Your profile and targets stay as they are. Use Backup & restore for a full Eatlog backup.</Text>
                    </View>
                    <PrimaryButton title={preview ? 'Choose another CSV' : 'Choose CSV to import'} icon="file-upload" onPress={() => void inspect()} disabled={busy} />
                    {busy ? <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite"><ActivityIndicator color={M3.primary} /><Text className="text-sm text-m3-on-surface-variant">Checking your CSV</Text></View> : null}
                    {preview ? <>
                        <Card className="p-5 gap-3">
                            <Text className="text-base font-semibold text-m3-on-surface">{preview.fileName}</Text>
                            <Text className="text-sm text-m3-on-surface-variant">{preview.parsed.dateStart ?? 'No dated entries'}{preview.parsed.dateEnd && preview.parsed.dateEnd !== preview.parsed.dateStart ? ` to ${preview.parsed.dateEnd}` : ''}</Text>
                            <Text className="text-sm text-m3-on-surface">{preview.parsed.meals.length} meals · {preview.parsed.weights.length} weights</Text>
                            {preview.parsed.detailFallbacks > 0 ? <Text className="text-sm text-m3-on-surface-variant">{preview.parsed.detailFallbacks} meals will use their recorded nutrition totals because ingredient details cannot be reconciled. Validated original details are kept for re-export while the meal stays unchanged.</Text> : null}
                        </Card>
                        <View className="gap-3">
                            <Text className="text-base font-semibold text-m3-on-surface">Meal timezone</Text>
                            <Text className="text-sm text-m3-on-surface-variant">Use the timezone where these meals were logged so they land on the right diary days.</Text>
                            <TextInput accessibilityLabel="Meal timezone" value={timezone} onChangeText={setTimezone} editable={!busy} autoCapitalize="none" autoCorrect={false} placeholder="Asia/Manila" placeholderTextColor={M3.placeholder} className="min-h-[48px] rounded-xl border border-m3-outline-variant bg-m3-surface-container-high px-4 py-3 text-base text-m3-on-surface" />
                            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !timezoneChanged }} disabled={busy || !timezoneChanged} onPress={() => void inspect(true)} className={`min-h-[48px] items-center justify-center rounded-full border border-m3-outline px-5 active:opacity-70 ${busy || !timezoneChanged ? 'opacity-40' : ''}`}><Text className="text-sm font-semibold text-m3-primary">Apply timezone</Text></Pressable>
                            {timezoneChanged ? <Text className="text-sm text-m3-on-surface-variant">Apply the timezone to update the preview before importing.</Text> : null}
                        </View>
                        <View className="gap-3">
                            <Text className="text-base font-semibold text-m3-on-surface">How to import</Text>
                            <SegmentedControl<CsvImportMode> value={mode} onChange={setMode} disabled={busy} accessibilityLabel="CSV import mode" options={[{ value: 'merge', label: 'Merge' }, { value: 'replace', label: 'Replace history' }]} />
                            {mode === 'merge' ? <Text className="text-sm text-m3-on-surface-variant">Add new entries and keep existing history. {preview.duplicateMeals} previously imported meals and {preview.conflictingWeights} existing weights will be skipped.{preview.changedSourceMeals ? ` The skipped meals include ${preview.changedSourceMeals} changed source meals; your current entries are kept.` : ''}</Text> : <Text className="text-sm text-m3-on-surface-variant">Replace {preview.existingMeals} meals, {preview.existingFoodLogs} food entries, and {preview.existingWeights} weights. Meal photos, adaptive reviews, and day completeness confirmations are removed. Your profile and target history stay. Weight trends are recalculated.{healthSync ? ' Health Connect sync is paused.' : ''}</Text>}
                        </View>
                        <PrimaryButton title={mode === 'merge' ? 'Import CSV' : 'Replace history with CSV'} onPress={apply} disabled={busy || timezoneChanged} />
                    </> : null}
                    {error ? <Text accessibilityLiveRegion="assertive" className="text-sm text-m3-error">{error}</Text> : null}
                </ScrollView>
            </ResponsiveContent>
        </SafeAreaView>
    );
}
