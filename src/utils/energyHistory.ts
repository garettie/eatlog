import {
  addCalendarDays,
  calendarDaysBetween,
  formatLocalISO,
  getMonthGrid,
  getMonthStart,
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

export type CalorieCalendarDayStatus =
  | 'under'
  | 'target'
  | 'over'
  | 'missing'
  | 'future'
  | 'target-unavailable';

export interface CalorieCalendarDay {
  date: string;
  inMonth: boolean;
  status: CalorieCalendarDayStatus;
  calories: number | null;
  targetCalories: number | null;
  deltaCalories: number | null;
  progress: number;
}

export interface CalorieCalendarWeek {
  startDate: string;
  endDate: string;
  days: CalorieCalendarDay[];
  loggedDays: number;
  totalCalories: number;
  targetDays: number;
  targetCalories: number;
  deltaCalories: number | null;
}

export interface CalorieCalendarMonth {
  monthStart: string;
  monthEnd: string;
  gridStart: string;
  gridEnd: string;
  weeks: CalorieCalendarWeek[];
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

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function buildCalorieCalendar(
  monthStart: string,
  today: string,
  dailyEnergy: readonly DailyEnergy[],
  targetHistory: readonly EnergyTarget[],
): CalorieCalendarMonth {
  const normalizedMonthStartDate = getMonthStart(parseLocalISO(monthStart));
  const normalizedMonthStart = formatLocalISO(normalizedMonthStartDate);
  const normalizedToday = formatLocalISO(parseLocalISO(today));
  const monthEndDate = new Date(normalizedMonthStartDate);
  monthEndDate.setMonth(monthEndDate.getMonth() + 1, 0);
  const monthEnd = formatLocalISO(monthEndDate);
  const grid = getMonthGrid(normalizedMonthStartDate);
  const gridStart = formatLocalISO(grid[0][0]);
  const gridEnd = formatLocalISO(grid[grid.length - 1][6]);
  const energyByDate = new Map(dailyEnergy.map((day) => [day.log_date, day.calories] as const));
  const targets = [...targetHistory].sort((a, b) => (
    a.effective_date.localeCompare(b.effective_date) || a.id - b.id
  ));

  const weeks = grid.map((dates) => {
    const days = dates.map((date) => {
      const dateISO = formatLocalISO(date);
      const target = activeTarget(targets, dateISO);
      const calories = energyByDate.has(dateISO) ? energyByDate.get(dateISO)! : null;
      const future = dateISO > normalizedToday;
      let status: CalorieCalendarDayStatus;
      if (future) {
        status = 'future';
      } else if (calories == null) {
        status = 'missing';
      } else if (target == null) {
        status = 'target-unavailable';
      } else if (calories < target.target_calories) {
        status = 'under';
      } else if (calories > target.target_calories) {
        status = 'over';
      } else {
        status = 'target';
      }

      const targetCalories = target?.target_calories ?? null;
      const deltaCalories = status === 'under' || status === 'target' || status === 'over'
        ? calories! - targetCalories!
        : null;
      const progress = calories != null && targetCalories != null && targetCalories > 0 && !future
        ? clampProgress(calories / targetCalories)
        : 0;

      return {
        date: dateISO,
        inMonth: dateISO >= normalizedMonthStart && dateISO <= monthEnd,
        status,
        calories,
        targetCalories,
        deltaCalories,
        progress,
      };
    });

    const logged = days.filter((day) => day.calories != null && day.status !== 'future');
    const withTargets = logged.filter((day) => day.targetCalories != null);
    const totalCalories = logged.reduce((sum, day) => sum + day.calories!, 0);
    const targetCalories = withTargets.reduce((sum, day) => sum + day.targetCalories!, 0);

    return {
      startDate: days[0].date,
      endDate: days[days.length - 1].date,
      days,
      loggedDays: logged.length,
      totalCalories,
      targetDays: withTargets.length,
      targetCalories,
      deltaCalories: logged.length > 0 && withTargets.length === logged.length
        ? totalCalories - targetCalories
        : null,
    };
  });

  return { monthStart: normalizedMonthStart, monthEnd, gridStart, gridEnd, weeks };
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
