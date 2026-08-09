import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ResponsiveContent from '../components/ResponsiveContent';
import { FORM_MAX_WIDTH } from '../theme/layout';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import { useDataMaintenance } from '../context/DataMaintenanceContext';
import {
    discardRestorePreview,
    pickAndInspectBackup,
    restoreBackup,
    shareBackup,
} from '../services/dataBackup';
import { exportData } from '../services/dataExport';
import {
    connectHealthConnect,
    getHealthConnectStatus,
    manageHealthConnectAccess,
    pauseHealthConnectSync,
    resumeHealthConnectSync,
    syncHealthConnectWeights,
} from '../services/healthConnect';
import type { OwnershipProgressEvent, RestorePreview } from '../services/dataOwnership.types';
import type { HealthConnectStatus } from '../services/healthConnect.types';
import { M3 } from '../theme/tokens';

function Screen({ children }: { children: React.ReactNode }) {
    return (
        <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-m3-surface">
            <ResponsiveContent className="flex-1" maxWidth={FORM_MAX_WIDTH}>{children}</ResponsiveContent>
        </SafeAreaView>
    );
}

function Message({ text, error = false }: { text: string; error?: boolean }) {
    return (
        <Text accessibilityLiveRegion={error ? 'assertive' : 'polite'} className={`text-sm ${error ? 'text-m3-error' : 'text-m3-on-surface-variant'}`}>
            {text}
        </Text>
    );
}

function SecondaryButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            className={`min-h-[48px] items-center justify-center rounded-full border border-m3-outline px-5 active:opacity-70 ${disabled ? 'opacity-40' : ''}`}
        >
            <Text className="text-sm font-semibold text-m3-primary">{title}</Text>
        </Pressable>
    );
}

function ProgressCard({ progress }: { progress: OwnershipProgressEvent }) {
    return (
        <Card className="p-5 gap-3">
            <View className="flex-row items-center gap-3" accessible accessibilityLiveRegion="polite">
                <ActivityIndicator color={M3.primary} />
                <View className="flex-1 gap-1">
                    <Text className="text-sm font-semibold text-m3-on-surface">{progress.message}</Text>
                    <Text className="text-xs text-m3-on-surface-variant">Step {Math.min(progress.completed + 1, progress.total)} of {progress.total}</Text>
                </View>
            </View>
        </Card>
    );
}

export function BackupRestoreScreen() {
    const { runDataMaintenance } = useDataMaintenance();
    const [progress, setProgress] = useState<OwnershipProgressEvent | null>(null);
    const [preview, setPreview] = useState<RestorePreview | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const restoringRef = useRef(false);

    useEffect(() => () => {
        controllerRef.current?.abort();
        if (preview && !restoringRef.current) discardRestorePreview(preview);
    }, [preview]);

    const backup = useCallback(async () => {
        const controller = new AbortController();
        controllerRef.current = controller;
        setProgress(null); setError(null); setMessage(null);
        try {
            const result = await shareBackup(setProgress, controller.signal);
            setMessage(result.summary);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not create the backup.');
        } finally {
            controllerRef.current = null;
            setProgress(null);
        }
    }, []);

    const inspect = useCallback(async () => {
        setProgress(null); setError(null); setMessage(null);
        if (preview) discardRestorePreview(preview);
        setPreview(null);
        try {
            setPreview(await pickAndInspectBackup(setProgress));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not inspect the backup.');
        } finally {
            setProgress(null);
        }
    }, [preview]);

    const confirmRestore = useCallback(() => {
        if (!preview) return;
        Alert.alert(
            'Replace all Eatlog data?',
            'The validated backup will replace the current database and meal photos. Eatlog will create an internal safety copy first.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore backup', style: 'destructive', onPress: () => {
                        restoringRef.current = true;
                        void runDataMaintenance('Restoring backup', (report) => restoreBackup(preview, report)).catch(() => { });
                    },
                },
            ],
        );
    }, [preview, runDataMaintenance]);

    return (
        <Screen>
            <ScrollView contentContainerClassName="p-6 gap-6">
                <View className="gap-2">
                    <Text className="text-lg font-bold text-m3-on-surface">Back up your Eatlog data</Text>
                    <Text className="text-sm text-m3-on-surface-variant">Save a restorable copy of your profile, history, targets, reviews, and meal photos.</Text>
                </View>
                <View className="gap-3">
                    <PrimaryButton title="Create and save backup" icon="backup" onPress={() => void backup()} disabled={progress != null} />
                    <SecondaryButton title="Choose backup to restore" onPress={() => void inspect()} disabled={progress != null} />
                </View>
                {progress ? <ProgressCard progress={progress} /> : null}
                {progress?.cancellable ? <SecondaryButton title="Cancel" onPress={() => controllerRef.current?.abort()} /> : null}
                {preview ? (
                    <Card className="p-5 gap-4">
                        <View className="gap-1">
                            <Text className="text-base font-bold text-m3-on-surface">Backup ready to restore</Text>
                            <Text className="text-sm text-m3-on-surface-variant">Created {new Date(preview.manifest.createdAt).toLocaleString()} · Eatlog {preview.manifest.appVersion}</Text>
                        </View>
                        <View className="flex-row flex-wrap gap-x-5 gap-y-2">
                            <Text className="text-sm text-m3-on-surface">{preview.manifest.counts.foodLogs} food logs</Text>
                            <Text className="text-sm text-m3-on-surface">{preview.manifest.counts.weightLogs} weights</Text>
                            <Text className="text-sm text-m3-on-surface">{preview.manifest.counts.photos} photos</Text>
                        </View>
                        <PrimaryButton title="Restore this backup" onPress={confirmRestore} />
                    </Card>
                ) : null}
                {message ? <Message text={message} /> : null}
                {error ? <Message text={error} error /> : null}
            </ScrollView>
        </Screen>
    );
}

export function ExportDataScreen() {
    const [progress, setProgress] = useState<OwnershipProgressEvent | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const run = useCallback(async () => {
        setProgress(null); setMessage(null); setError(null);
        try {
            const result = await exportData(setProgress);
            setMessage(result.summary);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not export your data.');
        } finally {
            setProgress(null);
        }
    }, []);
    return (
        <Screen>
            <ScrollView contentContainerClassName="p-6 gap-6">
                <View className="gap-2"><Text className="text-lg font-bold text-m3-on-surface">Export your data</Text><Text className="text-sm text-m3-on-surface-variant">Save your food, weight, target, and review history as readable CSV files.</Text></View>
                <Card className="p-5 gap-2"><Text className="text-sm font-semibold text-m3-on-surface">For reading, not restoring</Text><Text className="text-sm text-m3-on-surface-variant">CSV exports include no meal photos, caches, or Health Connect sync metadata. Use Backup & restore when you need to restore Eatlog.</Text></Card>
                <PrimaryButton title="Create CSV export" icon="file-download" onPress={() => void run()} disabled={progress != null} />
                {progress ? <ProgressCard progress={progress} /> : null}
                {message ? <Message text={message} /> : null}
                {error ? <Message text={error} error /> : null}
            </ScrollView>
        </Screen>
    );
}

const HEALTH_LABELS: Record<HealthConnectStatus['kind'], string> = {
    unavailable: 'Unavailable',
    provider_update_required: 'Update required',
    disconnected: 'Not connected',
    partial: 'Limited access',
    paused: 'Paused',
    syncing: 'Syncing',
    connected: 'Connected',
    error: 'Needs attention',
};

const HEALTH_STATUS_COPY: Record<HealthConnectStatus['kind'], string> = {
    unavailable: 'Health Connect is not available on this device.',
    provider_update_required: 'Update Health Connect to continue.',
    disconnected: 'Connect Health Connect to sync weights.',
    partial: 'Some permissions are missing.',
    paused: 'Weight sync is paused.',
    syncing: 'Syncing weight history.',
    connected: 'Weight sync is on.',
    error: 'Weight sync needs attention.',
};

export function HealthConnectScreen({ onDataChanged }: { onDataChanged: () => void }) {
    const [status, setStatus] = useState<HealthConnectStatus | null>(null);
    const [busyAction, setBusyAction] = useState<'connect' | 'sync' | 'pause' | 'resume' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const refresh = useCallback(async () => {
        try { setStatus(await getHealthConnectStatus()); }
        catch { setError('Could not check Health Connect access.'); }
    }, []);
    useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

    const act = useCallback(async (action: 'connect' | 'sync' | 'pause' | 'resume') => {
        setBusyAction(action); setError(null);
        try {
            if (action === 'connect') await connectHealthConnect();
            if (action === 'pause') await pauseHealthConnectSync();
            if (action === 'resume') await resumeHealthConnectSync();
            if (action === 'sync') {
                const result = await syncHealthConnectWeights();
                if (result.imported + result.updated + result.deleted > 0) onDataChanged();
            }
            await refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Health Connect could not complete the request.');
        } finally { setBusyAction(null); }
    }, [onDataChanged, refresh]);

    return (
        <Screen>
            <ScrollView contentContainerClassName="p-6 gap-6">
                <View className="gap-2"><Text className="text-lg font-bold text-m3-on-surface">Sync weight with Health Connect</Text><Text className="text-sm text-m3-on-surface-variant">Keep weight entries in sync between Eatlog and Android.</Text></View>
                <Card className="p-5 gap-3">
                    <View className="flex-row items-center gap-3" accessible accessibilityLiveRegion="polite"><View className="h-11 w-11 items-center justify-center rounded-full bg-m3-surface-container-high"><MaterialIcons name="health-and-safety" size={22} color={M3.primary} /></View><View className="flex-1 gap-0.5"><Text className="text-base font-bold text-m3-on-surface">{busyAction === 'sync' ? 'Syncing weights' : status ? HEALTH_LABELS[status.kind] : 'Checking access'}</Text><Text className="text-sm text-m3-on-surface-variant">{busyAction === 'sync' ? 'Updating weight history' : status ? HEALTH_STATUS_COPY[status.kind] : 'Checking access'}</Text></View>{busyAction ? <ActivityIndicator color={M3.primary} /> : null}</View>
                    {status?.lastSyncAt ? <Text className="text-xs text-m3-on-surface-variant">Last sync {new Date(status.lastSyncAt).toLocaleString()}</Text> : null}
                </Card>
                {status?.kind === 'disconnected' ? <PrimaryButton title="Connect Health Connect" onPress={() => void act('connect')} loading={busyAction === 'connect'} disabled={busyAction != null} /> : null}
                {status?.kind === 'paused' ? <PrimaryButton title="Resume weight sync" onPress={() => void act('resume')} loading={busyAction === 'resume'} disabled={busyAction != null} /> : null}
                {status?.enabled ? <PrimaryButton title="Sync now" onPress={() => void act('sync')} loading={busyAction === 'sync'} disabled={busyAction != null} /> : null}
                {status?.enabled ? <SecondaryButton title="Pause sync" onPress={() => void act('pause')} disabled={busyAction != null} /> : null}
                {status && status.kind !== 'unavailable' ? <SecondaryButton title="Manage access" onPress={manageHealthConnectAccess} disabled={busyAction != null} /> : null}
                {status?.kind === 'partial' ? <Message text="Some weight access is missing. Update permissions in Health Connect for full sync." /> : null}
                {status?.kind === 'unavailable' ? <Message text="Health Connect is unavailable on this device or build." /> : null}
                {error ? <><Message text={error} error /><SecondaryButton title="Retry status check" onPress={() => void refresh()} disabled={busyAction != null} /></> : null}
                <Text className="text-xs text-m3-on-surface-variant">Sync runs automatically. Use Sync now to refresh it.</Text>
            </ScrollView>
        </Screen>
    );
}
