import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { getDb, getActiveMealPhotoUris } from '../db/database';
import { cleanupOrphanMealPhotos } from '../utils/mealPhotos';
import { parseMacroCsv, getDefaultCsvTimezone, MAX_MACRO_CSV_BYTES } from './macroCsv';
import { applyCsvImport, inspectCsvAgainstDatabase } from './csvImportCore';
import { waitForHealthConnectIdle } from './healthConnect';
import type { CsvImportMode, CsvImportPreview } from './macroCsv.types';
import type { OwnershipProgressListener, OwnershipResult } from './dataOwnership.types';

export async function pickAndInspectCsv(timezone = getDefaultCsvTimezone()): Promise<CsvImportPreview | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const selected = result.assets[0];
  const file = new File(selected.uri);
  try {
    if (!selected.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a Macro-compatible .csv file.');
    if (!file.exists) throw new Error('Could not open that CSV. Choose it again.');
    if (file.size > MAX_MACRO_CSV_BYTES) throw new Error('That CSV is too large to import.');
    const text = await file.text();
    const parsed = parseMacroCsv(text, timezone);
    if (!parsed.meals.length && !parsed.weights.length) throw new Error('The CSV has no meal or weight history to import.');
    return await inspectCsvAgainstDatabase(await getDb(), selected.name, text, parsed);
  } finally {
    try { if (file.exists) file.delete(); } catch { /* Picker copies expire with the cache. */ }
  }
}

export async function reinspectCsv(preview: CsvImportPreview, timezone: string): Promise<CsvImportPreview> {
  return inspectCsvAgainstDatabase(await getDb(), preview.fileName, preview.text, parseMacroCsv(preview.text, timezone));
}

export async function importCsv(
  preview: CsvImportPreview,
  mode: CsvImportMode,
  onProgress?: OwnershipProgressListener,
): Promise<OwnershipResult> {
  // Reparse the original bytes before any write; the reviewed timezone is fixed.
  const parsed = parseMacroCsv(preview.text, preview.parsed.timezone);
  const reviewed = { ...preview, parsed };
  await waitForHealthConnectIdle();
  const directory = new Directory(Paths.cache, `eatlog-csv-safety-${Date.now()}`);
  directory.create({ intermediates: true });
  const safety = await SQLite.openDatabaseAsync('database.sqlite', undefined, directory.uri);
  let completed = false;
  try {
    onProgress?.({ operation: 'import', phase: 'safety', completed: 0, total: 1,
      message: 'Creating an internal safety copy', cancellable: false });
    const db = await getDb();
    await SQLite.backupDatabaseAsync({ sourceDatabase: db, destDatabase: safety });
    await safety.closeAsync();
    const result = await applyCsvImport(db, reviewed, mode, onProgress);
    completed = true;
    if (mode === 'replace') {
      // Only after the database commits can detached photos be removed.
      await cleanupOrphanMealPhotos(await getActiveMealPhotoUris()).catch(() => {});
    }
    const skipped = result.mealsSkipped + result.weightsSkipped;
    return { operation: 'import', completedAt: new Date().toISOString(),
      summary: `Imported ${result.mealsAdded} meals and ${result.weightsAdded} weights.${skipped ? ` Skipped ${skipped} incoming records and kept existing history.` : ''}` };
  } finally {
    try { await safety.closeAsync(); } catch { /* Already closed after the snapshot. */ }
    // Preserve the internal safety database on failure; the transaction rolls back.
    try { if (completed && directory.exists) directory.delete(); } catch { /* Cache cleanup cannot undo a committed import. */ }
  }
}
