import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSqliteUtcTimestamp } from './sqliteTimestamp';

test('parses a timezone-less SQLite timestamp as UTC without an eight-hour local offset', () => {
  const timestamp = parseSqliteUtcTimestamp('2026-09-01 04:00:00');
  const localNow = new Date('2026-09-01T12:00:00+08:00');

  assert.equal(timestamp.toISOString(), '2026-09-01T04:00:00.000Z');
  assert.equal(localNow.getTime() - timestamp.getTime(), 0);
});

test('preserves an explicit UTC zone', () => {
  const timestamp = parseSqliteUtcTimestamp('2026-09-01T04:00:00Z');

  assert.equal(timestamp.toISOString(), '2026-09-01T04:00:00.000Z');
});

test('preserves an explicit numeric offset', () => {
  const timestamp = parseSqliteUtcTimestamp('2026-09-01T12:00:00+08:00');

  assert.equal(timestamp.toISOString(), '2026-09-01T04:00:00.000Z');
});

test('normalizes a compact numeric offset without engine-specific date parsing', () => {
  const timestamp = parseSqliteUtcTimestamp('2026-09-01T12:00:00+0800');

  assert.equal(timestamp.toISOString(), '2026-09-01T04:00:00.000Z');
});

test('returns an invalid date for an impossible calendar timestamp', () => {
  const timestamp = parseSqliteUtcTimestamp('2026-02-30 04:00:00');

  assert.equal(Number.isNaN(timestamp.getTime()), true);
});

test('returns an invalid date for malformed input', () => {
  const timestamp = parseSqliteUtcTimestamp('not-a-timestamp');

  assert.equal(Number.isNaN(timestamp.getTime()), true);
});
