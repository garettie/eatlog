import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import ChoiceCards from '../components/ChoiceCards';
import PrimaryButton from '../components/PrimaryButton';
import ResponsiveContent from '../components/ResponsiveContent';
import SegmentedControl from '../components/SegmentedControl';
import { useDataMaintenance } from '../context/DataMaintenanceContext';
import { importCsv, pickAndInspectCsv, reinspectCsv } from '../services/csvImport';
import { exportData } from '../services/dataExport';
import type { OwnershipProgressEvent } from '../services/dataOwnership.types';
import { getDefaultCsvTimezone } from '../services/macroCsv';
import { supportsHealthConnect } from '../services/platformFeatures';
import type { CsvImportMode, CsvImportPreview, CsvTimestampFormat } from '../services/macroCsv.types';
import { FORM_MAX_WIDTH } from '../theme/layout';
import { M3 } from '../theme/tokens';

export function CsvTransferScreen() {
    const { runDataMaintenance } = useDataMaintenance();
    const healthSync = supportsHealthConnect(Platform.OS);
    const [preview, setPreview] = useState<CsvImportPreview | null>(null);
    const [timezone, setTimezone] = useState(getDefaultCsvTimezone);
    const [mode, setMode] = useState<CsvImportMode>('merge');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [progress, setProgress] = useState<OwnershipProgressEvent | null>(null);
    const timezoneChanged = preview != null && timezone.trim() !== preview.parsed.timezone;
    const sourceRequired = preview != null && preview.parsed.meals.length > 0 && preview.parsed.timestampFormatSource === 'unconfirmed';
    const mounted = useRef(true);
    const busyRef = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    async function inspect(changeTimezone = false) {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true); setError(null); setMessage(null);
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

    async function exportCsv() {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true); setError(null); setMessage(null); setProgress(null);
        try {
            const result = await exportData((event) => { if (mounted.current) setProgress(event); });
            // Export creates stable record identities. Refresh a pending preview so
            // replacement still validates against the current database snapshot.
            let refreshed: CsvImportPreview | null = null;
            if (preview) {
                try {
                    refreshed = await reinspectCsv(preview, preview.parsed.timezone);
                } catch {
                    if (mounted.current) {
                        setPreview(null);
                        setError('Choose the CSV again to refresh its import preview.');
                    }
                }
            }
            if (mounted.current) {
                if (refreshed) setPreview(refreshed);
                setMessage(result.summary);
            }
        } catch (cause) {
            if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not export the CSV.');
        } finally {
            busyRef.current = false;
            if (mounted.current) { setBusy(false); setProgress(null); }
        }
    }

    async function chooseSource(format: CsvTimestampFormat) {
        if (!preview || busyRef.current) return;
        busyRef.current = true;
        setBusy(true); setError(null); setMessage(null);
        try {
            const result = await reinspectCsv(preview, timezone.trim(), format);
            if (mounted.current) { setPreview(result); setTimezone(result.parsed.timezone); }
        } catch (cause) {
            if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not update the CSV preview.');
        } finally {
            busyRef.current = false;
            if (mounted.current) setBusy(false);
        }
    }

    function apply() {
        if (!preview || busyRef.current || sourceRequired || timezone.trim() !== preview.parsed.timezone) return;
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
                        <Text className="text-lg font-bold text-m3-on-surface">CSV import and export</Text>
                        <Text className="text-sm text-m3-on-surface-variant">Transfer meal and weight history with Macro-compatible CSV files. Import keeps your profile and targets; export includes your current profile and targets. Use Backup & restore for a full Eatlog backup, including photos.</Text>
                    </View>
                    <PrimaryButton title={preview ? 'Choose another CSV' : 'Choose CSV to import'} icon="file-upload" onPress={() => void inspect()} disabled={busy} />
                    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void exportCsv()} className={`min-h-[48px] items-center justify-center rounded-full border border-m3-outline px-5 active:opacity-70 ${busy ? 'opacity-40' : ''}`}>
                        <Text className="text-sm font-semibold text-m3-primary">Export CSV</Text>
                    </Pressable>
                    {busy ? <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite"><ActivityIndicator color={M3.primary} /><Text className="text-sm text-m3-on-surface-variant">{progress?.message ?? 'Checking your CSV'}</Text></View> : null}
                    {preview ? <>
                        <Card className="p-5 gap-3">
                            <Text className="text-base font-semibold text-m3-on-surface">{preview.fileName}</Text>
                            {!sourceRequired ? <Text className="text-sm text-m3-on-surface-variant">{preview.parsed.dateStart ?? 'No dated entries'}{preview.parsed.dateEnd && preview.parsed.dateEnd !== preview.parsed.dateStart ? ` to ${preview.parsed.dateEnd}` : ''}</Text> : null}
                            <Text className="text-sm text-m3-on-surface">{preview.parsed.meals.length} meals · {preview.parsed.weights.length} weights</Text>
                            {preview.parsed.detailFallbacks > 0 ? <Text className="text-sm text-m3-on-surface-variant">{preview.parsed.detailFallbacks} meals will use their recorded nutrition totals because ingredient details cannot be reconciled. Validated original details are kept for re-export while the meal stays unchanged.</Text> : null}
                        </Card>
                        {preview.parsed.meals.length > 0 && preview.parsed.timestampFormatSource !== 'metadata' ? <View className="gap-3">
                            <Text className="text-base font-semibold text-m3-on-surface">Where was this CSV exported?</Text>
                            <Text className="text-sm text-m3-on-surface-variant">Choose the app so meals land on the right days and in the right sections.</Text>
                            <ChoiceCards<CsvTimestampFormat>
                                value={sourceRequired ? null : preview.parsed.timestampFormat}
                                onChange={(format) => void chooseSource(format)} disabled={busy} accessibilityLabel="CSV source"
                                options={[{ value: 'macro-wall-clock', title: 'Macro', icon: 'restaurant' }, { value: 'eatlog-utc', title: 'Eatlog', icon: 'egg' }]}
                            />
                        </View> : null}
                        {!sourceRequired ? <>
                        <View className="gap-3">
                            <Text className="text-base font-semibold text-m3-on-surface">Meal timezone</Text>
                            <Text className="text-sm text-m3-on-surface-variant">{preview.parsed.timestampFormat === 'eatlog-utc' ? 'Use the timezone where these meals were logged to restore their diary dates and sections.' : "Use the timezone where these meals were logged. Macro's diary dates and default meal sections stay the same."}</Text>
                            <TextInput accessibilityLabel="Meal timezone" value={timezone} onChangeText={setTimezone} editable={!busy} autoCapitalize="none" autoCorrect={false} placeholder="Asia/Manila" placeholderTextColor={M3.placeholder} className="min-h-[48px] rounded-xl border border-m3-outline-variant bg-m3-surface-container-high px-4 py-3 text-base text-m3-on-surface" />
                            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !timezoneChanged }} disabled={busy || !timezoneChanged} onPress={() => void inspect(true)} className={`min-h-[48px] items-center justify-center rounded-full border border-m3-outline px-5 active:opacity-70 ${busy || !timezoneChanged ? 'opacity-40' : ''}`}><Text className="text-sm font-semibold text-m3-primary">Apply timezone</Text></Pressable>
                            {timezoneChanged ? <Text className="text-sm text-m3-on-surface-variant">Apply the timezone to update the preview before importing.</Text> : null}
                        </View>
                        <View className="gap-3">
                            <Text className="text-base font-semibold text-m3-on-surface">How to import</Text>
                            <SegmentedControl<CsvImportMode> value={mode} onChange={setMode} disabled={busy} accessibilityLabel="CSV import mode" options={[{ value: 'merge', label: 'Merge' }, { value: 'replace', label: 'Replace history' }]} />
                            {mode === 'merge' ? <Text className="text-sm text-m3-on-surface-variant">Add meals only on days with no meals or food entries logged. Keep existing history and skip previously imported meals. {preview.duplicateMeals} incoming meals and {preview.conflictingWeights} incoming weights will be skipped.{preview.changedSourceMeals ? ` The skipped meals include ${preview.changedSourceMeals} changed source meals; your current entries are kept.` : ''}</Text> : <Text className="text-sm text-m3-on-surface-variant">Replace {preview.existingMeals} meals, {preview.existingFoodLogs} food entries, and {preview.existingWeights} weights. Meal photos, adaptive reviews, and day completeness confirmations are removed. Your profile and target history stay. Weight trends are recalculated.{healthSync ? ' Health Connect sync is paused.' : ''}</Text>}
                        </View>
                        <PrimaryButton title={mode === 'merge' ? 'Import CSV' : 'Replace history with CSV'} onPress={apply} disabled={busy || timezoneChanged} />
                        </> : null}
                    </> : null}
                    {message ? <Text accessibilityLiveRegion="polite" className="text-sm text-m3-on-surface-variant">{message}</Text> : null}
                    {error ? <Text accessibilityLiveRegion="assertive" className="text-sm text-m3-error">{error}</Text> : null}
                </ScrollView>
            </ResponsiveContent>
        </SafeAreaView>
    );
}
