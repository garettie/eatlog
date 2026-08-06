import assert from 'node:assert/strict';
import test from 'node:test';

import {
  externalWeightAction,
  healthConnectWindow,
  importedDatesToDelete,
  isHealthExportDirty,
  localDateForHealthInstant,
  selectLatestExternalWeights,
  type ExternalWeightCandidate,
  type LocalWeightForReconciliation,
} from './healthConnect';

function candidate(overrides: Partial<ExternalWeightCandidate> = {}): ExternalWeightCandidate {
  return {
    recordId: 'external-1',
    dataOrigin: 'com.scale',
    measuredAt: '2026-08-01T08:00:00.000Z',
    lastModifiedAt: '2026-08-01T08:01:00.000Z',
    weightKg: 80,
    ...overrides,
  };
}

test('rolling Health Connect window includes today and the previous 29 local dates', () => {
  const window = healthConnectWindow('2026-08-01');
  assert.equal(window.startDate, '2026-07-03');
  assert.equal(window.endDate, '2026-08-01');
  assert.equal((Date.parse(window.endTime) - Date.parse(window.startTime)) / 86400000, 30);
});

test('measurement instants map through the device local calendar date', () => {
  const instant = '2026-08-01T23:30:00.000Z';
  const date = new Date(instant);
  const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  assert.equal(localDateForHealthInstant(instant), expected);
});

test('same-day selection uses latest measurement and excludes current and legacy Eatlog origins', () => {
  const records = [
    candidate({ recordId: 'old', measuredAt: '2026-08-01T06:00:00.000Z', weightKg: 81 }),
    candidate({ recordId: 'latest-old-mod', measuredAt: '2026-08-01T08:00:00.000Z', lastModifiedAt: '2026-08-01T08:01:00.000Z' }),
    candidate({ recordId: 'latest-new-mod', measuredAt: '2026-08-01T08:00:00.000Z', lastModifiedAt: '2026-08-01T09:00:00.000Z', weightKg: 79.5 }),
    candidate({ recordId: 'own-production', dataOrigin: 'com.sgaret.eatlog', measuredAt: '2026-08-01T10:00:00.000Z' }),
    candidate({ recordId: 'own-development', dataOrigin: 'com.sgaret.eatlog.dev', measuredAt: '2026-08-01T10:00:00.000Z' }),
    candidate({ recordId: 'legacy-production', dataOrigin: 'com.marco.tracker', measuredAt: '2026-08-01T10:00:00.000Z' }),
    candidate({ recordId: 'legacy-development', dataOrigin: 'com.marco.tracker.dev', measuredAt: '2026-08-01T10:00:00.000Z' }),
  ];
  const selected = selectLatestExternalWeights(records, [
    'com.sgaret.eatlog',
    'com.sgaret.eatlog.dev',
    'com.marco.tracker',
    'com.marco.tracker.dev',
  ]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].recordId, 'latest-new-mod');
});

test('manual precedence, external updates, and idempotent external reads are explicit', () => {
  const selected = { ...candidate(), logDate: localDateForHealthInstant(candidate().measuredAt) };
  const manual: LocalWeightForReconciliation = { logDate: selected.logDate, origin: 'eatlog', recordId: null, dataOrigin: null, measuredAt: null, weightKg: 80 };
  const imported: LocalWeightForReconciliation = { logDate: selected.logDate, origin: 'health_connect', recordId: selected.recordId, dataOrigin: selected.dataOrigin, measuredAt: selected.measuredAt, weightKg: selected.weightKg };
  assert.equal(externalWeightAction(manual, selected), 'skip_manual');
  assert.equal(externalWeightAction(imported, selected), 'unchanged');
  assert.equal(externalWeightAction({ ...imported, weightKg: 79 }, selected), 'upsert');
  assert.equal(externalWeightAction(null, selected), 'upsert');
});

test('missing or replaced external links delete only imported local dates', () => {
  const imported = [
    { logDate: '2026-07-31', origin: 'health_connect' as const, recordId: 'gone', dataOrigin: 'scale', measuredAt: null, weightKg: 80 },
    { logDate: '2026-08-01', origin: 'health_connect' as const, recordId: 'kept', dataOrigin: 'scale', measuredAt: null, weightKg: 79 },
  ];
  const selected = [{ ...candidate({ recordId: 'kept' }), logDate: '2026-08-01' }];
  assert.deepEqual(importedDatesToDelete(imported, selected), ['2026-07-31']);
});

test('export revisions are dirty once and pending deletions are never published', () => {
  assert.equal(isHealthExportDirty(2, null, false), true);
  assert.equal(isHealthExportDirty(2, 1, false), true);
  assert.equal(isHealthExportDirty(2, 2, false), false);
  assert.equal(isHealthExportDirty(3, 2, true), false);
});
