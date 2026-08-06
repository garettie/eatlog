import { Platform } from 'react-native';
import type { Permission, RecordResult } from 'react-native-health-connect';

import {
  getHealthConnectState,
  getPendingHealthConnectDeletions,
  getPendingHealthConnectExports,
  markHealthConnectDeletionComplete,
  markHealthConnectExported,
  reconcileHealthConnectWeights,
  setHealthConnectEnabled,
  setHealthConnectLastSync,
} from '../db/database';
import { todayISO } from '../utils/calendar';
import { healthConnectWindow, selectLatestExternalWeights, type ExternalWeightCandidate } from '../utils/healthConnect';
import { getApplicationInfo } from '../utils/applicationInfo';
import type { HealthConnectResetResult, HealthConnectStatus, HealthSyncResult } from './healthConnect.types';

const WEIGHT_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'write', recordType: 'Weight' },
];

const EATLOG_APPLICATION_IDS = [
  'com.sgaret.eatlog',
  'com.sgaret.eatlog.dev',
  'com.marco.tracker',
  'com.marco.tracker.dev',
] as const;

let syncPromise: Promise<HealthSyncResult> | null = null;
let healthConnectModule: typeof import('react-native-health-connect') | null | undefined;

function getHealthConnectModule(): typeof import('react-native-health-connect') | null {
  if (healthConnectModule !== undefined) return healthConnectModule;
  try {
    healthConnectModule = require('react-native-health-connect') as typeof import('react-native-health-connect');
  } catch {
    // A JavaScript update can reach an older development client before its
    // native modules are rebuilt. Treat that binary as unsupported instead of
    // crashing the entire app during module evaluation.
    healthConnectModule = null;
  }
  return healthConnectModule;
}

function permissionDirections(permissions: Array<{ accessType: string; recordType: string }>): { canRead: boolean; canWrite: boolean } {
  return {
    canRead: permissions.some((permission) => permission.recordType === 'Weight' && permission.accessType === 'read'),
    canWrite: permissions.some((permission) => permission.recordType === 'Weight' && permission.accessType === 'write'),
  };
}

async function availability(): Promise<'available' | 'unavailable' | 'update'> {
  if (Platform.OS !== 'android') return 'unavailable';
  const healthConnect = getHealthConnectModule();
  if (!healthConnect) return 'unavailable';
  try {
    const sdk = await healthConnect.getSdkStatus();
    if (sdk === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update';
    if (sdk !== healthConnect.SdkAvailabilityStatus.SDK_AVAILABLE) return 'unavailable';
    return await healthConnect.initialize() ? 'available' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
  const state = await getHealthConnectState();
  const sdk = await availability();
  if (sdk === 'unavailable') return {
    kind: 'unavailable', canRead: false, canWrite: false, enabled: false, lastSyncAt: state.last_sync_at,
    message: 'Health Connect is not available on this device.',
  };
  if (sdk === 'update') return {
    kind: 'provider_update_required', canRead: false, canWrite: false, enabled: false, lastSyncAt: state.last_sync_at,
    message: 'Update Health Connect to use weight sync.',
  };
  const healthConnect = getHealthConnectModule();
  if (!healthConnect) throw new Error('Health Connect requires a rebuilt Eatlog APK.');
  const directions = permissionDirections(await healthConnect.getGrantedPermissions());
  if (!directions.canRead && !directions.canWrite) return {
    kind: 'disconnected', ...directions, enabled: false, lastSyncAt: state.last_sync_at,
    message: 'Connect to read or write body-weight records.',
  };
  if (!state.enabled) return {
    kind: 'paused', ...directions, enabled: false, lastSyncAt: state.last_sync_at,
    message: 'Weight sync is paused. Your data and permissions are unchanged.',
  };
  if (!directions.canRead || !directions.canWrite) return {
    kind: 'partial', ...directions, enabled: true, lastSyncAt: state.last_sync_at,
    message: directions.canRead ? 'Eatlog can import weights but cannot publish them.' : 'Eatlog can publish weights but cannot import them.',
  };
  return {
    kind: 'connected', ...directions, enabled: true, lastSyncAt: state.last_sync_at,
    message: 'Weight sync is connected.',
  };
}

export async function connectHealthConnect(): Promise<HealthConnectStatus> {
  const sdk = await availability();
  if (sdk !== 'available') return getHealthConnectStatus();
  const healthConnect = getHealthConnectModule();
  if (!healthConnect) return getHealthConnectStatus();
  const granted = await healthConnect.requestPermission(WEIGHT_PERMISSIONS);
  const directions = permissionDirections(granted);
  await setHealthConnectEnabled(directions.canRead || directions.canWrite);
  if (directions.canRead || directions.canWrite) await syncHealthConnectWeights(true);
  return getHealthConnectStatus();
}

async function readAllWeights(startTime: string, endTime: string): Promise<ExternalWeightCandidate[]> {
  const healthConnect = getHealthConnectModule();
  if (!healthConnect) throw new Error('Health Connect requires a rebuilt Eatlog APK.');
  const candidates: ExternalWeightCandidate[] = [];
  let pageToken: string | undefined;
  do {
    const page = await healthConnect.readRecords('Weight', {
      timeRangeFilter: { operator: 'between', startTime, endTime },
      ascendingOrder: true,
      pageSize: 1000,
      pageToken,
    });
    for (const record of page.records as RecordResult<'Weight'>[]) {
      candidates.push({
        recordId: record.metadata?.id ?? '',
        dataOrigin: record.metadata?.dataOrigin ?? null,
        measuredAt: record.time,
        lastModifiedAt: record.metadata?.lastModifiedTime ?? null,
        weightKg: record.weight.inKilograms,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return candidates;
}

async function performSync(force: boolean): Promise<HealthSyncResult> {
  const state = await getHealthConnectState();
  const completedAt = new Date().toISOString();
  const empty: HealthSyncResult = {
    read: false, wrote: false, imported: 0, updated: 0, deleted: 0,
    exported: 0, exportDeletions: 0, skippedManual: 0, completedAt,
  };
  if (!state.enabled && !force) return empty;
  if (await availability() !== 'available') return empty;
  const healthConnect = getHealthConnectModule();
  if (!healthConnect) return empty;
  const directions = permissionDirections(await healthConnect.getGrantedPermissions());
  if (!directions.canRead && !directions.canWrite) return empty;

  const result = { ...empty };
  if (directions.canRead) {
    const window = healthConnectWindow(todayISO());
    const selected = selectLatestExternalWeights(
      await readAllWeights(window.startTime, window.endTime),
      [...EATLOG_APPLICATION_IDS, getApplicationInfo().applicationId]
        .filter((applicationId): applicationId is string => applicationId != null),
    );
    const reconciled = await reconcileHealthConnectWeights(
      selected.map((record) => ({
        logDate: record.logDate,
        scaleWeightKg: record.weightKg,
        recordId: record.recordId,
        dataSource: record.dataOrigin,
        lastModifiedAt: record.lastModifiedAt,
        measuredAt: record.measuredAt,
      })),
      window.startDate,
      window.endDate,
    );
    result.read = true;
    result.imported = reconciled.inserted;
    result.updated = reconciled.updated;
    result.deleted = reconciled.deleted;
    result.skippedManual = reconciled.skippedManual;
  }

  if (directions.canWrite) {
    const deletions = await getPendingHealthConnectDeletions();
    for (const deletion of deletions) {
      await healthConnect.deleteRecordsByUuids(
        'Weight', deletion.record_id ? [deletion.record_id] : [], [deletion.client_record_id],
      );
      await markHealthConnectDeletionComplete(deletion.log_date);
      result.exportDeletions += 1;
    }

    const exports = await getPendingHealthConnectExports();
    if (exports.length > 0) {
      const ids = await healthConnect.insertRecords(exports.map(({ log, ledger }) => ({
        recordType: 'Weight' as const,
        weight: { unit: 'kilograms' as const, value: log.scale_weight_kg },
        time: log.measured_at ?? new Date(`${log.log_date}T12:00:00`).toISOString(),
        metadata: {
          clientRecordId: ledger.client_record_id,
          clientRecordVersion: log.revision,
          recordingMethod: healthConnect.RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY,
        },
      })));
      if (ids.length !== exports.length) throw new Error('Health Connect returned an incomplete export result.');
      for (let index = 0; index < exports.length; index += 1) {
        await markHealthConnectExported(exports[index].log.log_date, ids[index], exports[index].log.revision);
      }
      result.exported = exports.length;
    }
    result.wrote = true;
  }
  result.completedAt = new Date().toISOString();
  await setHealthConnectLastSync(result.completedAt);
  return result;
}

export function syncHealthConnectWeights(force = false): Promise<HealthSyncResult> {
  if (!syncPromise) {
    syncPromise = performSync(force).finally(() => { syncPromise = null; });
  }
  return syncPromise;
}

export async function waitForHealthConnectIdle(): Promise<void> {
  if (syncPromise) await syncPromise.catch(() => {});
}

export async function pauseHealthConnectSync(): Promise<void> {
  await setHealthConnectEnabled(false);
}

export async function resumeHealthConnectSync(): Promise<HealthConnectStatus> {
  await setHealthConnectEnabled(true);
  await syncHealthConnectWeights(true);
  return getHealthConnectStatus();
}

export function manageHealthConnectAccess(): void {
  const healthConnect = getHealthConnectModule();
  if (!healthConnect) throw new Error('Health Connect requires a rebuilt Eatlog APK.');
  healthConnect.openHealthConnectSettings();
}

export async function deleteEatlogHealthConnectWeights(): Promise<HealthConnectResetResult> {
  if (await availability() !== 'available') return {
    attempted: false, deleted: false, warning: 'Health Connect is unavailable, so Eatlog-written weight records may remain there.',
  };
  const healthConnect = getHealthConnectModule();
  if (!healthConnect) return {
    attempted: false, deleted: false, warning: 'This Eatlog APK does not include Health Connect, so Eatlog-written weight records may remain there.',
  };
  const { canWrite } = permissionDirections(await healthConnect.getGrantedPermissions());
  if (!canWrite) return {
    attempted: false, deleted: false, warning: 'Write access is not granted, so Eatlog-written weight records may remain in Health Connect.',
  };
  try {
    await healthConnect.deleteRecordsByTimeRange('Weight', {
      operator: 'between', startTime: '1970-01-01T00:00:00.000Z', endTime: new Date(Date.now() + 86400000).toISOString(),
    });
    return { attempted: true, deleted: true, warning: null };
  } catch {
    return { attempted: true, deleted: false, warning: 'Eatlog could not remove its Health Connect records. They may remain after local reset.' };
  }
}
