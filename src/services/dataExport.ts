import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { getDb, type DailyTarget, type ExportMeal, type FoodLog, type Profile, type WeightLog } from '../db/database';
import { todayISO } from '../utils/calendar';
import { buildMacroCsv } from './macroCsvExport';
import { cleanupCsvRecordLinks, writeCsvRecordLink } from './csvImportCore';
import type { CsvRecordLink } from './csvRecordIdentity';
import type { OwnershipProgressListener, OwnershipResult } from './dataOwnership.types';

export async function exportData(onProgress?: OwnershipProgressListener): Promise<OwnershipResult> {
  const file = new File(Paths.cache, `eatlog-export-${Date.now()}.csv`);
  try {
    onProgress?.({ operation: 'export', phase: 'query', completed: 0, total: 2, message: 'Collecting your data', cancellable: false });
    const db = await getDb();
    let text = '';
    await db.withExclusiveTransactionAsync(async (txn) => {
      await cleanupCsvRecordLinks(txn);
      const profile = await txn.getFirstAsync<Profile>('SELECT * FROM profile WHERE id = 1');
      const meals = await txn.getAllAsync<ExportMeal>('SELECT id, name, log_date, meal_type, created_at FROM meals ORDER BY log_date, id');
      const foods = await txn.getAllAsync<FoodLog>('SELECT * FROM food_logs ORDER BY log_date, id');
      const weights = await txn.getAllAsync<WeightLog>('SELECT * FROM weight_logs ORDER BY log_date, id');
      const currentTarget = await txn.getFirstAsync<DailyTarget>('SELECT * FROM daily_targets WHERE effective_date <= ? ORDER BY effective_date DESC, id DESC LIMIT 1', [todayISO()]);
      const links = await txn.getAllAsync<CsvRecordLink>('SELECT * FROM csv_record_links');
      const result = buildMacroCsv({ profile, meals, foods, weights, currentTarget, links }, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', createId: () => Crypto.randomUUID() });
      text = result.text;
      for (const link of result.newLinks) await writeCsvRecordLink(txn, link);
    });
    file.write(text);
    if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
    onProgress?.({ operation: 'export', phase: 'share', completed: 2, total: 2, message: 'Choose where to save your CSV', cancellable: false });
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Export Eatlog CSV' });
    return { operation: 'export', completedAt: new Date().toISOString(), summary: 'CSV export created.' };
  } finally {
    try { if (file.exists) file.delete(); } catch { /* Sharing success is independent of cache cleanup. */ }
  }
}
