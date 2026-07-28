import { calendarDaysBetween, parseLocalISO } from './calendar';

export interface ScaleReading {
  logDate: string;
  scaleWeightKg: number;
}

export interface TrendReading extends ScaleReading {
  trendWeightKg: number;
}

const TREND_ALPHA = 0.15;

function roundStoredWeight(weightKg: number): number {
  return Math.round((weightKg + Number.EPSILON * weightKg) * 1000) / 1000;
}

export function computeWeightTrend(readings: ScaleReading[]): TrendReading[] {
  const sorted = readings.map((reading) => {
    parseLocalISO(reading.logDate);
    return { ...reading };
  }).sort((a, b) => a.logDate.localeCompare(b.logDate));

  let previousTrend: number | null = null;
  return sorted.map((reading, index) => {
    if (!Number.isFinite(reading.scaleWeightKg) || reading.scaleWeightKg <= 0) {
      throw new RangeError('Scale weights must be finite and positive');
    }
    if (index > 0 && reading.logDate === sorted[index - 1].logDate) {
      throw new RangeError(`Duplicate weight date: ${reading.logDate}`);
    }

    const trendWeightKg = previousTrend === null
      ? roundStoredWeight(reading.scaleWeightKg)
      : roundStoredWeight(
        TREND_ALPHA * reading.scaleWeightKg + (1 - TREND_ALPHA) * previousTrend,
      );
    previousTrend = trendWeightKg;
    return { ...reading, trendWeightKg };
  });
}

export function computeNormalizedWeeklyRate(
  start: Pick<TrendReading, 'logDate' | 'trendWeightKg'>,
  end: Pick<TrendReading, 'logDate' | 'trendWeightKg'>,
): number | null {
  const elapsedDays = calendarDaysBetween(start.logDate, end.logDate);
  if (elapsedDays === 0) return null;
  return (end.trendWeightKg - start.trendWeightKg) / elapsedDays * 7;
}
