interface CalorieTarget {
  target_calories: number;
}

/** Before target history, use its earliest saved row—not the latest plan. Display-only. */
export function calendarTarget<T extends CalorieTarget>(historical: T | null, earliest: T | null): T | null {
  if (historical) return historical;
  return earliest && Number.isFinite(earliest.target_calories) && earliest.target_calories > 0 ? earliest : null;
}
