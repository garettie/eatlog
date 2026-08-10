import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { resolveProfileSafetyRoute } from '../utils/profileSafetyGate';
import type { SafetyProfileInput, TargetSafetyInput } from '../utils/nutritionSafety';

test('underage existing profile enters correction path without deleting history', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE profile (
      id INTEGER PRIMARY KEY,
      display_name TEXT NOT NULL,
      sex TEXT NOT NULL,
      height_cm REAL NOT NULL,
      birth_date TEXT NOT NULL,
      activity_level TEXT NOT NULL,
      goal_type TEXT NOT NULL,
      goal_rate_kg_per_week REAL NOT NULL,
      protein_preference TEXT NOT NULL,
      weight_unit TEXT NOT NULL,
      target_weight_kg REAL
    );
    CREATE TABLE food_logs (
      id INTEGER PRIMARY KEY,
      log_date TEXT NOT NULL,
      name TEXT NOT NULL,
      calories REAL NOT NULL
    );
    CREATE TABLE weight_logs (
      id INTEGER PRIMARY KEY,
      log_date TEXT NOT NULL,
      scale_weight_kg REAL NOT NULL,
      trend_weight_kg REAL NOT NULL
    );
    CREATE TABLE daily_targets (
      id INTEGER PRIMARY KEY,
      effective_date TEXT NOT NULL,
      tdee_estimate REAL NOT NULL,
      target_calories INTEGER NOT NULL,
      target_protein_g REAL NOT NULL,
      target_fat_g REAL NOT NULL,
      target_carbs_g REAL NOT NULL,
      calculation_method TEXT NOT NULL
    );
    INSERT INTO profile VALUES
      (1, 'Existing user', 'female', 170, '2010-08-10', 'moderate', 'maintain', 0, 'moderate', 'kg', 80);
    INSERT INTO food_logs VALUES
      (41, '2026-08-01', 'Rice', 195),
      (42, '2026-08-02', 'Egg', 72);
    INSERT INTO weight_logs VALUES
      (7, '2026-08-01', 80.5, 80.2),
      (8, '2026-08-02', 80.1, 80.1);
    INSERT INTO daily_targets VALUES
      (9, '2026-08-01', 2000, 2000, 80, 55, 296, 'initial_estimate'),
      (10, '2026-08-02', 2000, 2000, 80, 55, 296, 'manual');
  `);

  try {
    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as unknown as SafetyProfileInput;
    const latestWeight = db.prepare(
      'SELECT * FROM weight_logs ORDER BY log_date DESC LIMIT 1',
    ).get() as { trend_weight_kg: number };
    const target = db.prepare(
      'SELECT * FROM daily_targets ORDER BY effective_date DESC LIMIT 1',
    ).get() as unknown as TargetSafetyInput;
    const historical = {
      foodLogs: db.prepare('SELECT * FROM food_logs ORDER BY id').all(),
      weights: db.prepare('SELECT * FROM weight_logs ORDER BY id').all(),
      targets: db.prepare('SELECT * FROM daily_targets ORDER BY id').all(),
    };

    assert.equal(resolveProfileSafetyRoute({
      profile,
      currentWeightKg: latestWeight.trend_weight_kg,
      target,
      referenceDate: '2026-08-10',
    }), 'ProfileCorrection');
    assert.deepEqual({
      foodLogs: db.prepare('SELECT * FROM food_logs ORDER BY id').all(),
      weights: db.prepare('SELECT * FROM weight_logs ORDER BY id').all(),
      targets: db.prepare('SELECT * FROM daily_targets ORDER BY id').all(),
    }, historical);
  } finally {
    db.close();
  }
});
