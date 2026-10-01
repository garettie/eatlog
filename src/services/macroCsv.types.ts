import type { FoodLogInput, MealType } from '../db/database';

export const MACRO_CSV_COLUMNS = [
  'record_type', 'id', 'name', 'calories', 'protein', 'carbs', 'fats', 'created_at',
  'image_uri', 'ingredients_json', 'ai_needs_clarification', 'ai_clarification_question',
  'ai_clarification_used', 'date', 'weight', 'payload_json',
] as const;

export type MacroCsvRow = Record<typeof MACRO_CSV_COLUMNS[number], string>;
export type CsvImportMode = 'merge' | 'replace';
export type CsvTimestampFormat = 'macro-wall-clock' | 'eatlog-utc';
export const EATLOG_CSV_FORMAT = { version: 1, timestampFormat: 'macro-wall-clock' } as const;

export interface CsvMeal {
  sourceId: string;
  name: string;
  createdAt: string;
  logDate: string;
  mealType: MealType;
  components: FoodLogInput[];
  originalRow: MacroCsvRow;
  detailFallback: boolean;
}

export interface CsvWeight {
  sourceId: string;
  logDate: string;
  kilograms: number;
}

export interface ParsedMacroCsv {
  meals: CsvMeal[];
  weights: CsvWeight[];
  timezone: string;
  timestampFormat: CsvTimestampFormat;
  timestampFormatSource: 'metadata' | 'selected' | 'unconfirmed';
  dateStart: string | null;
  dateEnd: string | null;
  detailFallbacks: number;
}

export interface CsvImportPreview {
  fileName: string;
  text: string;
  parsed: ParsedMacroCsv;
  duplicateMeals: number;
  changedSourceMeals: number;
  conflictingWeights: number;
  existingMeals: number;
  existingFoodLogs: number;
  existingWeights: number;
  localDataFingerprint: string;
}
