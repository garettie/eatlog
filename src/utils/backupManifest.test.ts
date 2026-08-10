import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBackupManifestV2,
  isSupportedBackupFileName,
  isSafeArchivePath,
  MAX_BACKUP_ARCHIVE_BYTES,
  MAX_BACKUP_UNCOMPRESSED_BYTES,
  validateBackupArchiveSizes,
  validateBackupCounts,
  validateExtractedBackupPaths,
  validateBackupFileIntegrity,
  validateBackupManifest,
} from './backupManifest';
import { INSTALLATION_TOKEN_FILE_NAME } from '../services/installIdentity';

test('accepts Eatlog backups and legacy Marco backups', () => {
  assert.equal(isSupportedBackupFileName('eatlog-123.eatlog-backup'), true);
  assert.equal(isSupportedBackupFileName('marco-123.marco-backup'), true);
  assert.equal(isSupportedBackupFileName('backup.zip'), false);
  assert.equal(isSupportedBackupFileName('eatlog-export.csv'), false);
  assert.equal(isSupportedBackupFileName('eatlog-export.zip'), false);
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

test('backup allowlist excludes the app-scoped installation identity', () => {
  assert.throws(() => validateBackupManifest({
    ...v2,
    files: [
      ...v2.files,
      { archivePath: INSTALLATION_TOKEN_FILE_NAME, size: 32, md5: 'c'.repeat(32) },
    ],
  }, 9), /unexpected file metadata/);
});

test('validates empty, compressed, and expanded archive size boundaries', () => {
  assert.doesNotThrow(() => validateBackupArchiveSizes(1, 1));
  assert.doesNotThrow(() => validateBackupArchiveSizes(MAX_BACKUP_ARCHIVE_BYTES, MAX_BACKUP_UNCOMPRESSED_BYTES));
  for (const size of [0, -1, Number.NaN, MAX_BACKUP_ARCHIVE_BYTES + 1]) {
    assert.throws(() => validateBackupArchiveSizes(size), /empty or too large/);
  }
  for (const size of [0, -1, Number.NaN, MAX_BACKUP_UNCOMPRESSED_BYTES + 1]) {
    assert.throws(() => validateBackupArchiveSizes(1, size), /expands beyond/);
  }
});

test('no-photo and multi-photo archive layouts support Unicode and exact allowlists', () => {
  const noPhotos = createBackupManifestV2({
    createdAt: '2026-08-10T00:00:00.000Z',
    appVersion: '1.1.0',
    appBuild: '1',
    databaseVersion: 9,
    databaseFile: 'database.sqlite',
    files: [{ archivePath: 'database.sqlite', size: 4096, md5: 'a'.repeat(32) }],
    photoFiles: [],
    counts: { profile: 1, foodLogs: 0, meals: 0, weightLogs: 0, dailyTargets: 1, adaptiveReviews: 0, photos: 0 },
  });
  assert.doesNotThrow(() => validateBackupManifest(noPhotos, 9));
  assert.doesNotThrow(() => validateExtractedBackupPaths(['manifest.json', 'database.sqlite'], noPhotos));

  const photoFiles = [
    { archivePath: 'photos/11-café.jpg', mealId: 11, originalFileName: 'café.jpg' },
    { archivePath: 'photos/12-食事.jpg', mealId: 12, originalFileName: '食事.jpg' },
  ];
  const multiple = createBackupManifestV2({
    ...noPhotos,
    files: [
      noPhotos.files[0],
      { archivePath: photoFiles[0].archivePath, size: 128, md5: 'b'.repeat(32) },
      { archivePath: photoFiles[1].archivePath, size: 256, md5: 'c'.repeat(32) },
    ],
    photoFiles,
    counts: { ...noPhotos.counts, meals: 2, photos: 2 },
  });
  assert.doesNotThrow(() => validateBackupManifest(multiple, 9));
  assert.doesNotThrow(() => validateExtractedBackupPaths([
    'manifest.json', 'database.sqlite', photoFiles[0].archivePath, photoFiles[1].archivePath,
  ], multiple));
});

test('rejects missing, unexpected, duplicate, and unsafe extracted paths', () => {
  assert.throws(() => validateExtractedBackupPaths(['manifest.json'], v2), /do not match/);
  assert.throws(() => validateExtractedBackupPaths([
    'manifest.json', 'database.sqlite', 'photos/1-photo.jpg', INSTALLATION_TOKEN_FILE_NAME,
  ], v2), /do not match/);
  assert.throws(() => validateExtractedBackupPaths([
    'manifest.json', 'database.sqlite', 'photos/1-photo.jpg', 'photos/1-photo.jpg',
  ], v2), /duplicate/);
  assert.throws(() => validateExtractedBackupPaths([
    'manifest.json', 'database.sqlite', '../outside',
  ], v2), /unsafe/);
});

test('rejects missing or invalid manifest fields and duplicate declared paths', () => {
  assert.throws(() => validateBackupManifest(null, 9), /missing/);
  assert.throws(() => validateBackupManifest({ ...v2, appVersion: '' }, 9), /incomplete/);
  assert.throws(() => validateBackupManifest({ ...v2, databaseFile: 'missing.sqlite' }, 9), /incomplete/);
  assert.throws(() => validateBackupManifest({
    ...v2,
    photoFiles: [v2.photoFiles[0], { ...v2.photoFiles[0], mealId: 2 }],
    counts: { ...v2.counts, photos: 2 },
  }, 9), /invalid photo path/);
  assert.throws(() => validateBackupManifest({
    ...v2,
    files: [v2.files[0], v2.files[0], v2.files[1]],
  }, 9), /file metadata/);
});
