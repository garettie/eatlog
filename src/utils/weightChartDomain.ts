const MINIMUM_SPAN_KG = 4;
const PADDING_RATIO = 0.1;

export interface WeightChartDomain {
  min: number;
  max: number;
  ticks: [number, number, number];
}

export function getWeightChartDomain(
  valuesKg: number[],
  targetWeightKg: number | null,
): WeightChartDomain {
  const values = valuesKg.filter(Number.isFinite);
  if (targetWeightKg != null && Number.isFinite(targetWeightKg)) {
    values.push(targetWeightKg);
  }

  if (values.length === 0) {
    return { min: 0, max: 1, ticks: [1, 0.5, 0] };
  }

  const contentMin = Math.min(...values);
  const contentMax = Math.max(...values);
  const contentCenter = (contentMin + contentMax) / 2;
  const contentSpan = Math.max(MINIMUM_SPAN_KG, contentMax - contentMin);
  const paddedSpan = contentSpan * (1 + PADDING_RATIO * 2);
  const min = contentCenter - paddedSpan / 2;
  const max = contentCenter + paddedSpan / 2;

  return { min, max, ticks: [max, contentCenter, min] };
}
