import { addCalendarDays, formatLocalISO, parseLocalISO } from './calendar';

export interface ExternalWeightCandidate {
  recordId: string;
  dataOrigin: string | null;
  measuredAt: string;
  lastModifiedAt: string | null;
  weightKg: number;
}

export interface SelectedExternalWeight extends ExternalWeightCandidate {
  logDate: string;
}

export interface LocalWeightForReconciliation {
  logDate: string;
  origin: 'eatlog' | 'health_connect';
  recordId: string | null;
  dataOrigin: string | null;
  measuredAt: string | null;
  weightKg: number;
}

export function externalWeightAction(
  existing: LocalWeightForReconciliation | null,
  candidate: SelectedExternalWeight,
): 'skip_manual' | 'unchanged' | 'upsert' {
  if (existing?.origin === 'eatlog') return 'skip_manual';
  if (existing?.recordId === candidate.recordId
    && existing.dataOrigin === candidate.dataOrigin
    && existing.measuredAt === candidate.measuredAt
    && Math.abs(existing.weightKg - candidate.weightKg) < 0.000001) return 'unchanged';
  return 'upsert';
}

export function importedDatesToDelete(
  imported: LocalWeightForReconciliation[],
  selected: SelectedExternalWeight[],
): string[] {
  const selectedByDate = new Map(selected.map((record) => [record.logDate, record.recordId]));
  return imported
    .filter((record) => selectedByDate.get(record.logDate) !== record.recordId)
    .map((record) => record.logDate);
}

export function isHealthExportDirty(revision: number, exportedRevision: number | null, pendingDelete: boolean): boolean {
  return !pendingDelete && (exportedRevision == null || exportedRevision < revision);
}

export function localDateForHealthInstant(instant: string): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid Health Connect measurement time.');
  return formatLocalISO(date);
}

export function healthConnectWindow(today: string): { startDate: string; endDate: string; startTime: string; endTime: string } {
  parseLocalISO(today);
  const startDate = addCalendarDays(today, -29);
  const endDate = today;
  const start = parseLocalISO(startDate);
  const end = parseLocalISO(addCalendarDays(today, 1));
  return { startDate, endDate, startTime: start.toISOString(), endTime: end.toISOString() };
}

export function selectLatestExternalWeights(
  records: ExternalWeightCandidate[],
  ownDataOrigins: readonly string[],
): SelectedExternalWeight[] {
  const ownOrigins = new Set(ownDataOrigins);
  const selected = new Map<string, SelectedExternalWeight>();
  for (const record of records) {
    if (!record.recordId || !Number.isFinite(record.weightKg) || record.weightKg <= 0) continue;
    if (record.dataOrigin && ownOrigins.has(record.dataOrigin)) continue;
    const candidate: SelectedExternalWeight = { ...record, logDate: localDateForHealthInstant(record.measuredAt) };
    const existing = selected.get(candidate.logDate);
    if (!existing) {
      selected.set(candidate.logDate, candidate);
      continue;
    }
    const measurementDelta = Date.parse(candidate.measuredAt) - Date.parse(existing.measuredAt);
    const modifiedDelta = Date.parse(candidate.lastModifiedAt ?? candidate.measuredAt)
      - Date.parse(existing.lastModifiedAt ?? existing.measuredAt);
    if (measurementDelta > 0 || (measurementDelta === 0 && modifiedDelta > 0)) {
      selected.set(candidate.logDate, candidate);
    }
  }
  return [...selected.values()].sort((left, right) => left.logDate.localeCompare(right.logDate));
}
