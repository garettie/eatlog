import type { MealType } from '../db/database';

const formatters = new Map<string, Intl.DateTimeFormat>();

export function macroCsvDateParts(timestamp: Date, timezone: string): { date: string; hour: number; minute: number; second: number } {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(timestamp);
  const part = (key: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === key)!.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')),
    minute: Number(part('minute')), second: Number(part('second')) };
}

// Macro APK's DEFAULT_MEAL_CATEGORY_TIME_RANGES, with exclusive end minutes.
export function macroMealType(hour: number): MealType {
  return hour >= 4 && hour < 11 ? 'breakfast' : hour >= 11 && hour < 14 ? 'lunch'
    : hour >= 17 && hour < 22 ? 'dinner' : 'snack';
}

// Preserve the interpretation used for Eatlog exports before format metadata.
export function legacyEatlogMealType(hour: number): MealType {
  return hour >= 5 && hour < 11 ? 'breakfast' : hour >= 11 && hour < 16 ? 'lunch'
    : hour >= 16 && hour < 22 ? 'dinner' : 'snack';
}

/** Macro's Z timestamp encodes local wall time, not an instant. Decode only for storage. */
export function macroWallClockToInstant(timestamp: Date, timezone: string): Date {
  const desired = timestamp.getTime();
  let instant = desired;
  for (let pass = 0; pass < 3; pass++) {
    const parts = macroCsvDateParts(new Date(instant), timezone);
    const local = Date.parse(`${parts.date}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}Z`)
      + timestamp.getUTCMilliseconds();
    const adjustment = desired - local;
    if (!adjustment) break;
    instant += adjustment;
  }
  return new Date(instant);
}
