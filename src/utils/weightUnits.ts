import type { WeightUnit } from '../db/database';

export type { WeightUnit } from '../db/database';

const KILOGRAMS_PER_POUND = 0.45359237;
const CENTIMETERS_PER_INCH = 2.54;

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

export function cmToFeetInches(heightCm: number): { feet: number; inches: number } {
  const totalInches = Math.round(heightCm / CENTIMETERS_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CENTIMETERS_PER_INCH;
}

export function formatHeight(heightCm: number, unit: WeightUnit): string {
  if (unit === 'kg') return `${heightCm.toFixed(1)} cm`;
  const { feet, inches } = cmToFeetInches(heightCm);
  return `${feet} ft ${inches} in`;
}
