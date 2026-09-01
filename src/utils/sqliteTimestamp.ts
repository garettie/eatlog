const SQLITE_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|([+-])(\d{2}):?(\d{2}))?$/i;

export function parseSqliteUtcTimestamp(value: string): Date {
  const match = SQLITE_TIMESTAMP.exec(value);
  if (!match) return new Date(Number.NaN);

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, offsetSign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number((fractionText ?? '').padEnd(3, '0'));
  const offsetHour = Number(offsetHourText ?? 0);
  const offsetMinute = Number(offsetMinuteText ?? 0);

  if (offsetHour > 23 || offsetMinute > 59) return new Date(Number.NaN);

  const wallClock = new Date(0);
  wallClock.setUTCFullYear(year, month - 1, day);
  wallClock.setUTCHours(hour, minute, second, millisecond);

  const hasValidComponents = wallClock.getUTCFullYear() === year
    && wallClock.getUTCMonth() === month - 1
    && wallClock.getUTCDate() === day
    && wallClock.getUTCHours() === hour
    && wallClock.getUTCMinutes() === minute
    && wallClock.getUTCSeconds() === second
    && wallClock.getUTCMilliseconds() === millisecond;
  if (!hasValidComponents) return new Date(Number.NaN);

  const offsetDirection = offsetSign === '-' ? -1 : 1;
  const offsetMs = offsetDirection * (offsetHour * 60 + offsetMinute) * 60_000;
  return new Date(wallClock.getTime() - offsetMs);
}
