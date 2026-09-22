/**
 * The calendar day mark, shared by the Diary strip and the Analytics calendar, at its 36dp
 * design size. The calorie ring runs along the outer edge; the selected and today discs sit
 * inside it with a dark gap, so the ring keeps its contrast in every state.
 */
export const CALENDAR_DAY = {
  size: 36,
  ringRadius: 16.5,
  ringStroke: 3,
  /** Unlogged days read as an empty slot, not a grey ring competing with the blue. */
  trackOpacity: 0.4,
  discRadius: 13,
  todayDiscOpacity: 0.18,
} as const;
