import {
  addCalendarDays,
  parseLocalISO,
} from './calendar';

export interface LoggingHeatmapCell {
  date: string;
  logged: boolean;
}

export interface LoggingHeatmapModel {
  rows: LoggingHeatmapCell[][];
  currentWeekCount: number;
  windowCount: number;
  windowStart: string;
  windowEnd: string;
}

const WINDOW_DAYS = 30;
const ROW_COUNT = 3;
const DAYS_PER_ROW = 10;

function mondayOffset(dateISO: string): number {
  const day = parseLocalISO(dateISO).getDay();
  return day === 0 ? 6 : day - 1;
}

export function buildLoggingHeatmap(
  endDate: string,
  loggedDates: readonly string[],
): LoggingHeatmapModel {
  parseLocalISO(endDate);
  const logged = new Set(loggedDates);
  logged.forEach(parseLocalISO);

  const windowStart = addCalendarDays(endDate, -(WINDOW_DAYS - 1));
  const currentWeekStart = addCalendarDays(endDate, -mondayOffset(endDate));
  const cells = Array.from({ length: WINDOW_DAYS }, (_, index) => {
    const date = addCalendarDays(windowStart, index);
    return {
      date,
      logged: logged.has(date),
    };
  });
  const rows = Array.from({ length: ROW_COUNT }, (_, rowIndex) =>
    cells.slice(rowIndex * DAYS_PER_ROW, (rowIndex + 1) * DAYS_PER_ROW),
  );

  const currentWeekCount = [...logged].filter(
    (date) => date >= currentWeekStart && date <= endDate,
  ).length;

  return {
    rows,
    currentWeekCount,
    windowCount: cells.filter((cell) => cell.logged).length,
    windowStart,
    windowEnd: endDate,
  };
}
