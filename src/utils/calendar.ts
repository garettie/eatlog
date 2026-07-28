const LOCAL_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseLocalISO(dateISO: string): Date {
  const match = LOCAL_ISO_PATTERN.exec(dateISO);
  if (!match) {
    throw new RangeError(`Invalid local ISO date: ${dateISO}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw new RangeError(`Invalid local ISO date: ${dateISO}`);
  }

  return date;
}

export function formatLocalISO(date: Date): string {
  const time = date.getTime();
  const year = date.getFullYear();
  if (!Number.isFinite(time) || year < 0 || year > 9999) {
    throw new RangeError('Invalid local date');
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${month}-${day}`;
}

export function addCalendarDays(dateISO: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError('Calendar day offset must be an integer');
  }

  const date = parseLocalISO(dateISO);
  date.setDate(date.getDate() + days);
  return formatLocalISO(date);
}

export function addCalendarMonths(dateISO: string, months: number): string {
  if (!Number.isInteger(months)) {
    throw new RangeError('Calendar month offset must be an integer');
  }

  const date = parseLocalISO(dateISO);
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDayDate = new Date(0);
  lastDayDate.setHours(0, 0, 0, 0);
  lastDayDate.setFullYear(date.getFullYear(), date.getMonth() + 1, 0);
  const lastDay = lastDayDate.getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return formatLocalISO(date);
}

export function calendarDaysBetween(startISO: string, endISO: string): number {
  const start = parseLocalISO(startISO);
  const end = parseLocalISO(endISO);
  const utcDay = (date: Date): number => {
    const utc = new Date(0);
    utc.setUTCHours(0, 0, 0, 0);
    utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    return utc.getTime() / MS_PER_DAY;
  };

  return utcDay(end) - utcDay(start);
}

export function todayISO(): string {
  return formatLocalISO(new Date());
}

export function isoFromDate(d: Date): string {
  return formatLocalISO(d);
}

export function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekDates(date: Date): Date[] {
  const monday = getWeekMonday(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function getMonthStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getMonthDates(monthStart: Date): Date[] {
  const d = new Date(monthStart);
  const days: Date[] = [];
  while (d.getMonth() === monthStart.getMonth()) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function formatMonthLabel(monthStart: Date): string {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${monthNames[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function isFuture(d: Date): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy > now;
}

export function formatDayHeader(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dayNames[d.getDay()]} ${monthNames[d.getMonth()]} ${d.getDate()}`;
}

export function formatWeekRange(weekDates: Date[]): string {
  if (weekDates.length === 0) return '';
  const first = weekDates[0];
  const last = weekDates[weekDates.length - 1];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return `${monthNames[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${monthNames[first.getMonth()]} ${first.getDate()} – ${monthNames[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
  }
  return `${monthNames[first.getMonth()]} ${first.getDate()}, ${first.getFullYear()} – ${monthNames[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
}
