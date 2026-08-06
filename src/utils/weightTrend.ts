import { calendarDaysBetween, parseLocalISO } from './calendar';
import { ADAPTIVE_ALGORITHM_CONFIG } from './adaptiveAlgorithmConfig';

export interface ScaleReading {
  logDate: string;
  scaleWeightKg: number;
}

export interface TrendReading extends ScaleReading {
  trendWeightKg: number;
}

function roundStoredWeight(weightKg: number): number {
  const scaled = (weightKg + Number.EPSILON * weightKg) * 1000;
  if (!Number.isFinite(scaled)) {
    throw new RangeError('Stored trend weight overflowed');
  }
  const rounded = Math.round(scaled) / 1000;
  if (!Number.isFinite(rounded)) {
    throw new RangeError('Stored trend weight must be finite');
  }
  return rounded;
}

export function alphaForElapsedDays(elapsedDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) {
    throw new RangeError('Elapsed days must be finite and positive');
  }
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) {
    throw new RangeError('Trend half-life must be finite and positive');
  }
  const alpha = 1 - Math.exp(-Math.LN2 * elapsedDays / halfLifeDays);
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
    throw new RangeError('Trend alpha must be finite and within (0, 1]');
  }
  return alpha;
}

export function computeWeightTrend(readings: ScaleReading[]): TrendReading[] {
  const validated = readings.map((reading, index) => {
    parseLocalISO(reading.logDate);
    if (!Number.isFinite(reading.scaleWeightKg) || reading.scaleWeightKg <= 0) {
      throw new RangeError('Scale weights must be finite and positive');
    }
    if (index > 0 && reading.logDate === readings[index - 1].logDate) {
      throw new RangeError(`Duplicate weight date: ${reading.logDate}`);
    }
    if (index > 0 && reading.logDate < readings[index - 1].logDate) {
      throw new RangeError('Weight readings must be chronological');
    }
    return { ...reading };
  });

  let previousTrend: number | null = null;
  let previousDate: string | null = null;
  return validated.map((reading) => {
    const trendWeightKg = previousTrend === null
      ? roundStoredWeight(reading.scaleWeightKg)
      : (() => {
          const alpha = alphaForElapsedDays(
            calendarDaysBetween(previousDate!, reading.logDate),
            ADAPTIVE_ALGORITHM_CONFIG.trendHalfLifeDays,
          );
          return roundStoredWeight(
            alpha * reading.scaleWeightKg + (1 - alpha) * previousTrend!,
          );
        })();
    previousTrend = trendWeightKg;
    previousDate = reading.logDate;
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
