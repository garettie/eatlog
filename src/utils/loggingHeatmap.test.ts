import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLoggingHeatmap } from './loggingHeatmap';

test('builds a rolling 30-day block with three rows of ten days', () => {
  const result = buildLoggingHeatmap('2026-08-01', []);

  assert.equal(result.windowStart, '2026-07-03');
  assert.equal(result.windowEnd, '2026-08-01');
  assert.equal(result.rows.length, 3);
  assert.ok(result.rows.every((row) => row.length === 10));
  assert.equal(result.rows[0][0].date, '2026-07-03');
  assert.equal(result.rows[0][9].date, '2026-07-12');
  assert.equal(result.rows[1][0].date, '2026-07-13');
  assert.equal(result.rows[2][9].date, '2026-08-01');
  assert.equal(result.windowCount, 0);
});

test('deduplicates logged dates and counts only the current Monday-based week', () => {
  const result = buildLoggingHeatmap('2026-07-29', [
    '2026-07-26',
    '2026-07-27',
    '2026-07-27',
    '2026-07-28',
  ]);

  assert.equal(result.currentWeekCount, 2);
  assert.equal(result.windowCount, 3);
  assert.equal(result.rows.flat().filter((cell) => cell.logged).length, 3);
});

test('keeps leap-day and year-boundary dates inside the rolling window', () => {
  const leap = buildLoggingHeatmap('2024-03-01', ['2024-02-29']);
  const year = buildLoggingHeatmap('2026-01-02', ['2025-12-31']);

  assert.equal(leap.windowStart, '2024-02-01');
  assert.equal(leap.rows.flat().find((cell) => cell.date === '2024-02-29')?.logged, true);
  assert.equal(year.rows.flat().find((cell) => cell.date === '2025-12-31')?.logged, true);
});

test('returns neutral empty history and ignores dates outside the window', () => {
  const result = buildLoggingHeatmap('2026-08-01', ['2026-06-01', '2026-08-02']);

  assert.equal(result.currentWeekCount, 0);
  assert.equal(result.rows.flat().filter((cell) => cell.logged).length, 0);
});

test('calendar alignment is unchanged by daylight-saving transitions', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const result = buildLoggingHeatmap('2024-03-11', ['2024-03-10', '2024-03-11']);
    assert.equal(result.windowStart, '2024-02-11');
    assert.equal(result.rows[2][9].date, '2024-03-11');
    assert.equal(result.currentWeekCount, 1);
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimezone;
    }
  }
});
