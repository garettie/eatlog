import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { todayISO } from '../utils/calendar';

type TodayListener = (today: string) => void;

let currentToday = todayISO();
const listeners = new Set<TodayListener>();
let started = false;
let midnightTimer: ReturnType<typeof setTimeout> | null = null;

function refresh() {
  const next = todayISO();
  if (next === currentToday) return;
  currentToday = next;
  listeners.forEach((listener) => listener(next));
}

function scheduleMidnightRefresh() {
  if (midnightTimer) clearTimeout(midnightTimer);
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  midnightTimer = setTimeout(() => {
    refresh();
    scheduleMidnightRefresh();
  }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
}

function ensureStarted() {
  if (started) return;
  started = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });
  scheduleMidnightRefresh();
}

export function useToday(): string {
  const [today, setToday] = useState(currentToday);

  useEffect(() => {
    ensureStarted();
    listeners.add(setToday);
    return () => {
      listeners.delete(setToday);
    };
  }, []);

  return today;
}
