import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';

import { getDatabaseVersion, getExportDailyTargets, getExportFoodLogs, getExportWeightLogs } from '../db/database';
import { csv } from '../utils/csv';

export async function exportData(): Promise<void> {
  const [foods, weights, targets] = await Promise.all([getExportFoodLogs(), getExportWeightLogs(), getExportDailyTargets()]);
  const file = new File(Paths.cache, `marco-export-${Date.now()}.zip`);
  try {
    file.write(zipSync({
      'food-logs.csv': strToU8(csv([['id', 'log_date', 'name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'grams_logged'], ...foods.map((row) => [row.id, row.log_date, row.name, row.calories, row.protein_g, row.carbs_g, row.fat_g, row.grams_logged])])),
      'weight-logs.csv': strToU8(csv([['id', 'log_date', 'scale_weight_kg', 'trend_weight_kg'], ...weights.map((row) => [row.id, row.log_date, row.scale_weight_kg, row.trend_weight_kg])])),
      'daily-targets.csv': strToU8(csv([['id', 'effective_date', 'target_calories', 'target_protein_g', 'target_fat_g', 'target_carbs_g'], ...targets.map((row) => [row.id, row.effective_date, row.target_calories, row.target_protein_g, row.target_fat_g, row.target_carbs_g])])),
      'manifest.json': strToU8(JSON.stringify({ createdAt: new Date().toISOString(), appVersion: '1.0.0', databaseVersion: getDatabaseVersion() })),
    }, { level: 6 }));
    if (!await Sharing.isAvailableAsync()) throw new Error('Android sharing is unavailable.');
    await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: 'Export Marco data' });
  } finally {
    if (file.exists) file.delete();
  }
}
