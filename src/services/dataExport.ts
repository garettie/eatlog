import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { zip } from 'react-native-zip-archive';

import {
  getDatabaseVersion,
  getExportAdaptiveReviews,
  getExportDailyTargets,
  getExportFoodLogs,
  getExportMeals,
  getExportWeightLogs,
  getProfile,
} from '../db/database';
import { csv } from '../utils/csv';
import { fromKilograms } from '../utils/weightUnits';
import { getApplicationInfo } from '../utils/applicationInfo';
import type { OwnershipProgressListener, OwnershipResult } from './dataOwnership.types';

function nativePath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function writeCsv(directory: Directory, name: string, rows: Array<Array<string | number | null | undefined>>): void {
  const file = new File(directory, name);
  file.write(csv(rows));
}

export async function exportData(onProgress?: OwnershipProgressListener): Promise<OwnershipResult> {
  const stamp = Date.now();
  const stage = new Directory(Paths.cache, `eatlog-export-${stamp}`);
  const archive = new File(Paths.cache, `eatlog-export-${stamp}.zip`);
  stage.create({ intermediates: true });
  try {
    onProgress?.({ operation: 'export', phase: 'query', completed: 0, total: 3, message: 'Collecting your data', cancellable: true });
    const [profile, meals, foods, weights, targets, reviews] = await Promise.all([
      getProfile(), getExportMeals(), getExportFoodLogs(), getExportWeightLogs(),
      getExportDailyTargets(), getExportAdaptiveReviews(),
    ]);
    const unit = profile?.weight_unit ?? 'kg';

    writeCsv(stage, 'profile.csv', [[
      'display_name', 'sex', 'height_cm', 'birth_date', 'activity_level', 'goal_type',
      'goal_rate_kg_per_week', 'protein_preference', 'weight_unit', 'target_weight_kg',
      `target_weight_${unit}`, 'analytics_intro_dismissed', 'created_at',
    ], ...(profile ? [[
      profile.display_name, profile.sex, profile.height_cm, profile.birth_date, profile.activity_level,
      profile.goal_type, profile.goal_rate_kg_per_week, profile.protein_preference, unit,
      profile.target_weight_kg, profile.target_weight_kg == null ? null : fromKilograms(profile.target_weight_kg, unit),
      profile.analytics_intro_dismissed, profile.created_at,
    ]] : [])]);

    writeCsv(stage, 'meals.csv', [[
      'id', 'log_date', 'meal_type', 'name', 'created_at',
    ], ...meals.map((row) => [row.id, row.log_date, row.meal_type, row.name, row.created_at])]);

    writeCsv(stage, 'food-log-components.csv', [[
      'id', 'log_date', 'meal', 'meal_id', 'name', 'brand', 'source', 'source_food_id',
      'data_type', 'preparation', 'grams_logged', 'serving_size_g', 'serving_label', 'calories',
      'protein_g', 'carbs_g', 'fat_g', 'calories_per_100g', 'protein_g_per_100g',
      'carbs_g_per_100g', 'fat_g_per_100g', 'logged_at',
    ], ...foods.map((row) => [
      row.id, row.log_date, row.meal, row.meal_id, row.name, row.brand, row.source,
      row.source_food_id, row.data_type, row.preparation, row.grams_logged, row.serving_size_g,
      row.serving_label, row.calories, row.protein_g, row.carbs_g, row.fat_g,
      row.calories_per_100g, row.protein_g_per_100g, row.carbs_g_per_100g,
      row.fat_g_per_100g, row.logged_at,
    ])]);

    writeCsv(stage, 'weight-history.csv', [[
      'id', 'log_date', 'scale_weight_kg', `scale_weight_${unit}`, 'trend_weight_kg',
      `trend_weight_${unit}`, 'display_unit', 'origin', 'measured_at', 'created_at',
    ], ...weights.map((row) => [
      row.id, row.log_date, row.scale_weight_kg, fromKilograms(row.scale_weight_kg, unit),
      row.trend_weight_kg, fromKilograms(row.trend_weight_kg, unit), unit, row.origin,
      row.measured_at, row.created_at,
    ])]);

    writeCsv(stage, 'target-history.csv', [[
      'id', 'effective_date', 'tdee_estimate', 'target_calories', 'target_protein_g',
      'target_fat_g', 'target_carbs_g', 'calculation_method', 'created_at',
    ], ...targets.map((row) => [
      row.id, row.effective_date, row.tdee_estimate, row.target_calories,
      row.target_protein_g, row.target_fat_g, row.target_carbs_g,
      row.calculation_method, row.created_at,
    ])]);

    writeCsv(stage, 'adaptive-reviews.csv', [[
      'id', 'review_date', 'window_start', 'window_end', 'intake_day_count', 'weight_log_count',
      'average_intake_kcal', 'start_trend_weight_kg', 'end_trend_weight_kg', 'elapsed_days',
      'raw_tdee', 'previous_tdee', 'proposed_tdee', 'previous_target_calories',
      'previous_target_protein_g', 'previous_target_fat_g', 'previous_target_carbs_g',
      'proposed_target_calories', 'proposed_target_protein_g', 'proposed_target_fat_g',
      'proposed_target_carbs_g', 'evidence_hash', 'status', 'resulting_target_id', 'created_at', 'resolved_at',
    ], ...reviews.map((row) => [
      row.id, row.review_date, row.window_start, row.window_end, row.intake_day_count,
      row.weight_log_count, row.average_intake_kcal, row.start_trend_weight_kg,
      row.end_trend_weight_kg, row.elapsed_days, row.raw_tdee, row.previous_tdee,
      row.proposed_tdee, row.previous_target_calories,
      row.previous_target_protein_g, row.previous_target_fat_g, row.previous_target_carbs_g,
      row.proposed_target_calories, row.proposed_target_protein_g, row.proposed_target_fat_g,
      row.proposed_target_carbs_g, row.evidence_hash, row.status, row.resulting_target_id,
      row.created_at, row.resolved_at,
    ])]);

    const application = getApplicationInfo();
    new File(stage, 'manifest.json').write(JSON.stringify({
      format: 'eatlog-csv-export',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      appVersion: application.appVersion,
      appBuild: application.appBuild,
      databaseVersion: getDatabaseVersion(),
      files: stage.list().filter((entry): entry is File => entry instanceof File).map((file) => file.uri.split('/').pop()),
      note: 'CSV exports are human-readable and cannot be restored into Eatlog.',
    }, null, 2));

    onProgress?.({ operation: 'export', phase: 'zip', completed: 2, total: 3, message: 'Packaging CSV files', cancellable: false });
    await zip(nativePath(stage.uri), nativePath(archive.uri));
    if (!await Sharing.isAvailableAsync()) throw new Error('Android sharing is unavailable.');
    onProgress?.({ operation: 'export', phase: 'share', completed: 3, total: 3, message: 'Choose where to save your export', cancellable: false });
    await Sharing.shareAsync(archive.uri, { mimeType: 'application/zip', dialogTitle: 'Export Eatlog data' });
    return { operation: 'export', completedAt: new Date().toISOString(), summary: 'CSV export created.' };
  } finally {
    if (archive.exists) archive.delete();
    if (stage.exists) stage.delete();
  }
}
