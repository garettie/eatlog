export type PortionUnit = 'g' | 'ml';

const MEASUREMENT_SOURCE = '(\\d+(?:\\.\\d+)?)\\s*(g|grams?|ml|milliliters?)\\b';

function normalizedUnit(value: string): PortionUnit {
  return value.toLowerCase().startsWith('m') ? 'ml' : 'g';
}

function sameAmount(first: number, second: number): boolean {
  return Math.abs(first - second) < 0.01;
}

function formatAmount(value: number, unit: PortionUnit): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${unit}`;
}

export function parsePositivePortionInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function cleanDuplicateMeasurements(label: string): string {
  const duplicateParentheses = new RegExp(
    `(\\(\\s*${MEASUREMENT_SOURCE}\\s*\\))\\s*(?:·\\s*)?\\(\\s*${MEASUREMENT_SOURCE}\\s*\\)`,
    'gi',
  );
  let cleaned = label.trim().replace(/\s+/g, ' ');
  let previous = '';

  while (cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned.replace(
      duplicateParentheses,
      (match, firstGroup, firstValue, firstUnit, secondValue, secondUnit) =>
        normalizedUnit(firstUnit) === normalizedUnit(secondUnit)
          && sameAmount(Number(firstValue), Number(secondValue))
          ? firstGroup.replace(/\s+/g, '')
          : match,
    );
  }

  return cleaned;
}

function includesAmount(label: string, value: number, unit: PortionUnit): boolean {
  const measurements = new RegExp(MEASUREMENT_SOURCE, 'gi');
  for (const match of label.matchAll(measurements)) {
    if (normalizedUnit(match[2]) === unit && sameAmount(Number(match[1]), value)) return true;
  }
  return false;
}

export function formatPortionLabel(
  label: string | null | undefined,
  weight: number,
  unit: PortionUnit = 'g',
): string {
  const cleanLabel = label ? cleanDuplicateMeasurements(label) : '';
  const formattedWeight = formatAmount(weight, unit);
  if (!cleanLabel) return formattedWeight;
  return includesAmount(cleanLabel, weight, unit)
    ? cleanLabel
    : `${cleanLabel} · ${formattedWeight}`;
}

export function formatServingSummary(
  label: string | null | undefined,
  servingWeight: number,
  totalWeight: number,
  unit: PortionUnit = 'g',
): string {
  const portionLabel = formatPortionLabel(label, servingWeight, unit);
  if (sameAmount(servingWeight, totalWeight) || includesAmount(portionLabel, totalWeight, unit)) {
    return portionLabel;
  }
  return `${portionLabel} · ${formatAmount(totalWeight, unit)} total`;
}
