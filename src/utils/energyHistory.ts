import {
  addCalendarDays,
  calendarDaysBetween,
  parseLocalISO,
} from './calendar';

export type EnergyRange = '1M' | '3M' | '6M' | '1Y';

export interface DailyEnergy {
  log_date: string;
  calories: number;
}

export interface EnergyTarget {
  id: number;
  effective_date: string;
  target_calories: number;
  tdee_estimate: number;
}

export interface EnergyHistoryPoint {
  startDate: string;
  endDate: string;
  dayCount: number;
  loggedDayCount: number;
  averageCalories: number | null;
  intakeTrendCalories: number | null;
  targetCalories: number | null;
  expenditureCalories: number | null;
}

export interface EnergyHistoryModel {
  points: EnergyHistoryPoint[];
  loggedDayCount: number;
  totalDayCount: number;
  coverage: number;
  averageCalories: number | null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function activeTarget(
  targets: readonly EnergyTarget[],
  date: string,
): EnergyTarget | null {
  let active: EnergyTarget | null = null;
  for (const target of targets) {
    if (target.effective_date > date) break;
    active = target;
  }
  return active;
}

export function buildEnergyHistory(
  range: EnergyRange,
  startDate: string,
  endDate: string,
  dailyEnergy: readonly DailyEnergy[],
  targetHistory: readonly EnergyTarget[],
): EnergyHistoryModel {
  parseLocalISO(startDate);
  parseLocalISO(endDate);
  const totalDayCount = calendarDaysBetween(startDate, endDate) + 1;
  if (totalDayCount <= 0) {
    throw new RangeError('Energy history end date must not precede its start date');
  }

  const energyByDate = new Map(
    dailyEnergy
      .filter((day) => day.log_date >= startDate && day.log_date <= endDate)
      .map((day) => [day.log_date, day.calories] as const),
  );
  const targets = [...targetHistory].sort((a, b) => (
    a.effective_date.localeCompare(b.effective_date) || a.id - b.id
  ));
  const loggedValues = [...energyByDate.values()];
  const points: EnergyHistoryPoint[] = [];

  if (range === '1M') {
    for (let index = 0; index < totalDayCount; index += 1) {
      const date = addCalendarDays(startDate, index);
      const calories = energyByDate.get(date) ?? null;
      const rollingStart = addCalendarDays(date, -6);
      const rollingValues = dailyEnergy
        .filter((day) => day.log_date >= rollingStart && day.log_date <= date)
        .map((day) => day.calories);
      const target = activeTarget(targets, date);
      points.push({
        startDate: date,
        endDate: date,
        dayCount: 1,
        loggedDayCount: calories == null ? 0 : 1,
        averageCalories: calories,
        intakeTrendCalories: rollingValues.length >= 4 ? mean(rollingValues) : null,
        targetCalories: target?.target_calories ?? null,
        expenditureCalories: target?.tdee_estimate ?? null,
      });
    }
  } else {
    for (let bucketStart = startDate; bucketStart <= endDate; bucketStart = addCalendarDays(bucketStart, 7)) {
      const bucketEnd = addCalendarDays(
        bucketStart,
        Math.min(6, calendarDaysBetween(bucketStart, endDate)),
      );
      const values = dailyEnergy
        .filter((day) => day.log_date >= bucketStart && day.log_date <= bucketEnd)
        .map((day) => day.calories);
      const average = mean(values);
      const target = activeTarget(targets, bucketEnd);
      points.push({
        startDate: bucketStart,
        endDate: bucketEnd,
        dayCount: calendarDaysBetween(bucketStart, bucketEnd) + 1,
        loggedDayCount: values.length,
        averageCalories: average,
        intakeTrendCalories: average,
        targetCalories: target?.target_calories ?? null,
        expenditureCalories: target?.tdee_estimate ?? null,
      });
    }
  }

  return {
    points,
    loggedDayCount: loggedValues.length,
    totalDayCount,
    coverage: loggedValues.length / totalDayCount,
    averageCalories: mean(loggedValues),
  };
}
