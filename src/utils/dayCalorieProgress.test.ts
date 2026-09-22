import assert from 'node:assert/strict';
import test from 'node:test';

import { dayCalorieProgress } from './dayCalorieProgress';

test('each day pairs its logged calories with the target in effect that day', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  const progress = dayCalorieProgress(
    days,
    [
      { log_date: '2026-09-01', calories: 1800 },
      { log_date: '2026-09-03', calories: 2500 },
    ],
    { effective_date: '2026-08-20', target_calories: 2000 },
    [{ effective_date: '2026-09-03', target_calories: 2200 }],
  );

  assert.deepEqual(progress.get('2026-09-01'), { calories: 1800, targetCalories: 2000 });
  assert.deepEqual(progress.get('2026-09-02'), { calories: 0, targetCalories: 2000 });
  assert.deepEqual(progress.get('2026-09-03'), { calories: 2500, targetCalories: 2200 });
  assert.deepEqual(progress.get('2026-09-04'), { calories: 0, targetCalories: 2200 });
});

test('days before any target keep their calories with no target', () => {
  const progress = dayCalorieProgress(['2026-09-01'], [{ log_date: '2026-09-01', calories: 900 }], null, []);
  assert.deepEqual(progress.get('2026-09-01'), { calories: 900, targetCalories: 0 });
});
