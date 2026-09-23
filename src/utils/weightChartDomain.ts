import { fromKilograms, toKilograms, type WeightUnit } from './weightUnits';

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
  unit: WeightUnit = 'kg',
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

  // The three gridlines sit at the top, middle, and bottom, so snap the domain until each one
  // lands on a whole number in the unit the user reads. Rounding the center moves it by at most
  // half a unit, so the half-span grows by that much to keep the padded content inside.
  const center = Math.round(fromKilograms(contentCenter, unit));
  const halfSpan = Math.ceil(fromKilograms(paddedSpan, unit) / 2 + 0.5);
  const min = toKilograms(center - halfSpan, unit);
  const max = toKilograms(center + halfSpan, unit);

  return { min, max, ticks: [max, toKilograms(center, unit), min] };
}
