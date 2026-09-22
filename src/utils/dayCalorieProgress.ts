interface TargetChange {
  effective_date: string;
  target_calories: number;
}

export interface DayCalories {
  calories: number;
  targetCalories: number;
}

/**
 * Pairs each day's logged calories with the target in effect on that day, the way the Diary
 * calendar draws its rings. `targetChanges` must be sorted by effective date.
 */
export function dayCalorieProgress(
  days: string[],
  loggedCalories: Array<{ log_date: string; calories: number }>,
  initialTarget: TargetChange | null,
  targetChanges: TargetChange[],
): Map<string, DayCalories> {
  const caloriesByDay = new Map(loggedCalories.map((row) => [row.log_date, row.calories]));
  const progress = new Map<string, DayCalories>();
  let activeTarget = initialTarget;
  let targetIndex = 0;
  for (const day of days) {
    while (targetIndex < targetChanges.length && targetChanges[targetIndex].effective_date <= day) {
      activeTarget = targetChanges[targetIndex];
      targetIndex += 1;
    }
    progress.set(day, {
      calories: caloriesByDay.get(day) ?? 0,
      targetCalories: activeTarget?.target_calories ?? 0,
    });
  }
  return progress;
}
