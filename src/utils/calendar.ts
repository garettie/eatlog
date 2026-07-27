export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
