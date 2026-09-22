import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCalendarDays,
  addCalendarMonths,
  calendarDaysBetween,
  formatLogDateLabel,
  formatLocalISO,
  normalizeLogDateInput,
  parseLocalISO,
  getMonthGrid,
  getFixedMonthGrid,
} from './calendar';

test('log date labels identify today and show the selected weekday', () => {
  const today = parseLocalISO('2026-08-16');
  assert.equal(
    formatLogDateLabel('2026-08-16', today),
    'Today · Sunday, August 16, 2026',
  );
  assert.equal(
    formatLogDateLabel('2026-08-17', today),
    'Monday, August 17, 2026',
  );
});

test('local ISO dates round-trip at local midnight', () => {
  const date = parseLocalISO('2026-07-28');
  assert.equal(date.getHours(), 0);
  assert.equal(formatLocalISO(date), '2026-07-28');
});

test('strict local ISO parsing rejects malformed and impossible dates', () => {
  for (const value of ['2026-7-28', '2026-02-29', '2026-13-01', 'not-a-date']) {
    assert.throws(() => parseLocalISO(value), RangeError);
  }
});

test('log date input accepts local ISO strings and rejects press events', () => {
  assert.equal(normalizeLogDateInput('2026-08-16'), '2026-08-16');
  assert.equal(normalizeLogDateInput({ nativeEvent: { timestamp: 1 } }), null);
  assert.equal(normalizeLogDateInput('undefined'), null);
  assert.equal(normalizeLogDateInput('2026-02-30'), null);
});

test('calendar arithmetic includes leap day', () => {
  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addCalendarDays('2024-02-29', 1), '2024-03-01');
  assert.equal(calendarDaysBetween('2024-02-28', '2024-02-29'), 1);
  assert.equal(calendarDaysBetween('2024-02-29', '2024-03-01'), 1);
});

test('month subtraction clamps the 29th, 30th, and 31st to the target month', () => {
  assert.equal(addCalendarMonths('2024-03-29', -1), '2024-02-29');
  assert.equal(addCalendarMonths('2024-03-30', -1), '2024-02-29');
  assert.equal(addCalendarMonths('2024-03-31', -1), '2024-02-29');
  assert.equal(addCalendarMonths('2023-03-31', -1), '2023-02-28');
});

test('inclusive 14-day range boundaries are review date minus 13 through review date', () => {
  const end = '2026-01-14';
  const start = addCalendarDays(end, -13);
  assert.equal(start, '2026-01-01');
  assert.equal(calendarDaysBetween(start, end), 13);
  assert.equal(calendarDaysBetween(end, end), 0);
});

test('calendar day count is not altered by a DST transition', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const start = parseLocalISO('2024-03-09');
    const end = parseLocalISO('2024-03-11');
    assert.equal((end.getTime() - start.getTime()) / (60 * 60 * 1000), 47);
    assert.equal(calendarDaysBetween('2024-03-09', '2024-03-11'), 2);
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimezone;
    }
  }
});

test('month grids start on Monday and include spillover days', () => {
  const grid = getMonthGrid(parseLocalISO('2026-08-01'));

  assert.equal(grid.length, 6);
  assert.equal(formatLocalISO(grid[0][0]), '2026-07-27');
  assert.equal(formatLocalISO(grid[5][6]), '2026-09-06');
  for (const week of grid) {
    assert.equal(week.length, 7);
    assert.deepEqual(week.map((date) => date.getDay()), [1, 2, 3, 4, 5, 6, 0]);
  }
});

test('fixed month grids always show six weeks so paging never changes their height', () => {
  // February 2027 starts on a Monday and fits in exactly four weeks.
  assert.equal(getMonthGrid(parseLocalISO('2027-02-01')).length, 4);
  const grid = getFixedMonthGrid(parseLocalISO('2027-02-01'));

  assert.equal(grid.length, 6);
  assert.equal(formatLocalISO(grid[0][0]), '2027-02-01');
  assert.equal(formatLocalISO(grid[5][6]), '2027-03-14');
  for (const week of grid) {
    assert.deepEqual(week.map((date) => date.getDay()), [1, 2, 3, 4, 5, 6, 0]);
  }
  assert.equal(getFixedMonthGrid(parseLocalISO('2026-08-01')).length, 6);
});

test('month grids preserve local ordering across year boundaries', () => {
  const grid = getMonthGrid(parseLocalISO('2026-01-01'));

  assert.equal(formatLocalISO(grid[0][0]), '2025-12-29');
  assert.equal(formatLocalISO(grid[0][3]), '2026-01-01');
  assert.equal(formatLocalISO(grid.at(-1)!.at(-1)!), '2026-02-01');
});
