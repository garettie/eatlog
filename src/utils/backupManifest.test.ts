import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSupportedBackupFileName,
  isSafeArchivePath,
  validateBackupCounts,
  validateBackupFileIntegrity,
  validateBackupManifest,
} from './backupManifest';

test('accepts Eatlog backups and legacy Marco backups', () => {
  assert.equal(isSupportedBackupFileName('eatlog-123.eatlog-backup'), true);
  assert.equal(isSupportedBackupFileName('marco-123.marco-backup'), true);
  assert.equal(isSupportedBackupFileName('backup.zip'), false);
});

const v1 = {
  formatVersion: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  appVersion: '1.0.0',
  databaseVersion: 5,
  databaseFile: 'database.sqlite',
  photoFiles: [{ archivePath: 'photos/1-photo.jpg', mealId: 1, originalFileName: 'photo.jpg' }],
  counts: { foodLogs: 2, meals: 1, weightLogs: 3, dailyTargets: 1, photos: 1 },
} as const;

const v2 = {
  ...v1,
  formatVersion: 2,
  databaseVersion: 6,
  appBuild: '42',
  files: [
    { archivePath: 'database.sqlite', size: 4096, md5: 'a'.repeat(32) },
    { archivePath: 'photos/1-photo.jpg', size: 128, md5: 'b'.repeat(32) },
  ],
  counts: { ...v1.counts, profile: 1, adaptiveReviews: 0 },
} as const;

test('accepts structural v1 and hashed v2 manifests, including v6 backups on v9', () => {
  assert.equal(validateBackupManifest(v1, 9).formatVersion, 1);
  assert.equal(validateBackupManifest(v2, 9).formatVersion, 2);
});

test('rejects unsafe, absolute, duplicate, and backslash archive paths', () => {
  for (const path of ['../database.sqlite', '/database.sqlite', 'photos/../../x', 'photos\\x.jpg', 'photos//x.jpg']) {
    assert.equal(isSafeArchivePath(path), false, path);
  }
  assert.throws(() => validateBackupManifest({
    ...v1,
    photoFiles: [{ ...v1.photoFiles[0], archivePath: 'photos/../photo.jpg' }],
  }, 6), /invalid photo path/);
  assert.throws(() => validateBackupManifest({
    ...v1,
    photoFiles: [{ ...v1.photoFiles[0], originalFileName: '../photo.jpg' }],
  }, 6), /invalid photo path/);
});

test('rejects newer databases, bad counts, missing metadata, size, and hash fields', () => {
  assert.throws(() => validateBackupManifest({ ...v2, databaseVersion: 7 }, 6), /newer database/);
  assert.throws(() => validateBackupManifest({ ...v2, counts: { ...v2.counts, photos: -1 } }, 6), /row counts/);
  assert.throws(() => validateBackupManifest({ ...v2, files: v2.files.slice(0, 1) }, 6), /missing file metadata/);
  assert.throws(() => validateBackupManifest({ ...v2, files: [{ ...v2.files[0], size: -1 }, v2.files[1]] }, 6), /file metadata/);
  assert.throws(() => validateBackupManifest({ ...v2, files: [{ ...v2.files[0], md5: 'wrong' }, v2.files[1]] }, 6), /file metadata/);
});

test('validates actual database counts, file sizes, and integrity hashes', () => {
  assert.doesNotThrow(() => validateBackupCounts(v2.counts, v2.counts));
  assert.throws(() => validateBackupCounts(v2.counts, { ...v2.counts, weightLogs: 4 }), /row counts/);
  assert.doesNotThrow(() => validateBackupFileIntegrity(v2.files[0], { size: 4096, md5: 'A'.repeat(32) }));
  assert.throws(() => validateBackupFileIntegrity(v2.files[0], { size: 4095, md5: 'a'.repeat(32) }), /integrity check/);
  assert.throws(() => validateBackupFileIntegrity(v2.files[0], { size: 4096, md5: 'b'.repeat(32) }), /integrity check/);
});
