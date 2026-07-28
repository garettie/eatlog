import type { WeightUnit } from '../db/database';

export type { WeightUnit } from '../db/database';

const KILOGRAMS_PER_POUND = 0.45359237;

export function toKilograms(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KILOGRAMS_PER_POUND;
}

export function fromKilograms(weightKg: number, unit: WeightUnit): number {
  return unit === 'kg' ? weightKg : weightKg / KILOGRAMS_PER_POUND;
}

export function parseWeightInput(text: string): number | null {
  const normalized = text.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function formatWeight(weightKg: number, unit: WeightUnit): string {
  return fromKilograms(weightKg, unit).toFixed(1);
}
