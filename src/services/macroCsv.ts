import type { FoodLogInput, MealType } from '../db/database';
import { validateWeightKg } from '../utils/nutritionSafety';
import { parseSqliteUtcTimestamp } from '../utils/sqliteTimestamp';
import { MACRO_CSV_COLUMNS, type MacroCsvRow, type ParsedMacroCsv } from './macroCsv.types';

export const MAX_MACRO_CSV_BYTES = 20 * 1024 * 1024;
export const MAX_MACRO_CSV_CHARACTERS = MAX_MACRO_CSV_BYTES;
const MAX_ROWS = 100_000;
const MAX_CELL = 1024 * 1024;
const nutrients = ['calories', 'protein', 'carbs', 'fats'] as const;
type Nutrients = Record<typeof nutrients[number], number>;
type Detail = { name: string; quantity: number; unit: string; perServing: Nutrients;
  id?: string; compatibleUnits?: string[] };

export function getDefaultCsvTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Strict RFC 4180 reader. Record numbers include the header, including multiline records. */
function readCsv(text: string): string[][] {
  if (text.length > MAX_MACRO_CSV_CHARACTERS) throw new Error('CSV exceeds the 20 MB text limit.');
  // Hermes does not provide TextEncoder. Count UTF-8 bytes without allocating a second file buffer.
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > MAX_MACRO_CSV_BYTES) throw new Error('CSV exceeds the 20 MB text limit.');
  }
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const fail = () => { throw new Error(`Row ${rows.length + 1}: invalid CSV quoting.`); };
  const pushCell = () => { row.push(cell); cell = ''; closed = false; };
  const pushRow = () => {
    pushCell();
    if (row.length !== 1 || row[0] !== '') rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS) throw new Error('CSV has too many records.');
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += ch;
    } else if (ch === ',') pushCell();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      pushRow();
    } else if (ch === '"') {
      if (cell || closed) fail();
      quoted = true;
    } else {
      if (closed) fail();
      cell += ch;
    }
    if (cell.length > MAX_CELL || row.length > MACRO_CSV_COLUMNS.length) {
      throw new Error(`Row ${rows.length + 1}: CSV record is too large.`);
    }
  }
  if (quoted) fail();
  if (cell || row.length || closed) pushRow();
  return rows;
}

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function json(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
function number(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && (!value.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(parseSqliteUtcTimestamp(`${value}T00:00:00Z`).getTime());
}
export function macroCsvDateParts(timestamp: Date, timezone: string): { date: string; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(timestamp);
  const part = (key: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === key)!.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')),
    minute: Number(part('minute')), second: Number(part('second')) };
}
function mealType(hour: number): MealType {
  return hour >= 5 && hour < 11 ? 'breakfast' : hour >= 11 && hour < 16 ? 'lunch'
    : hour >= 16 && hour < 22 ? 'dinner' : 'snack';
}
function detailsFrom(row: MacroCsvRow): Detail[] | null {
  const payload = object(json(row.payload_json));
  const details = payload?.ingredientsDetailed;
  if (!Array.isArray(details) || !details.length || details.length > 1000) return null;
  const result: Detail[] = [];
  for (const candidate of details) {
    const item = object(candidate), per = object(item?.perServing);
    if (!item || !per || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 2000
      || typeof item.unit !== 'string' || !item.unit.trim() || item.unit.length > 50) return null;
    const quantity = number(item.quantity);
    if (quantity == null || quantity <= 0) return null;
    const values = nutrients.map(key => number(per[key]));
    if (values.some(value => value == null)) return null;
    const perServing = Object.fromEntries(nutrients.map((key, i) => [key, values[i]!])) as Nutrients;
    if (nutrients.some(key => !Number.isFinite(perServing[key] * quantity))) return null;
    const detail: Detail = { name: item.name.trim(), quantity, unit: item.unit.trim(), perServing };
    if (typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 256) detail.id = item.id;
    if (Array.isArray(item.compatibleUnits) && item.compatibleUnits.length <= 50
      && item.compatibleUnits.every(unit => typeof unit === 'string' && unit.trim().length > 0
        && unit.length <= 50 && !/[\u0000-\u001f]/.test(unit))) {
      detail.compatibleUnits = item.compatibleUnits;
    }
    result.push(detail);
  }
  return result;
}

function sanitizedPayload(row: MacroCsvRow, details: Detail[] | null): string {
  const result: Record<string, unknown> = details ? { ingredientsDetailed: details } : {};
  const barcode = object(object(json(row.payload_json))?.barcodeMeta);
  const per = object(barcode?.perServing);
  if (barcode && per && nutrients.every(key => number(per[key]) != null)) {
    const clean: Record<string, unknown> = {
      perServing: Object.fromEntries(nutrients.map(key => [key, number(per[key])])),
    };
    for (const key of ['source', 'servingUnit', 'servingReference'] as const) {
      if (typeof barcode[key] === 'string' && barcode[key].length <= 100) clean[key] = barcode[key];
    }
    for (const key of ['servingAmount', 'servingsPerPackage'] as const) {
      if (number(barcode[key]) != null) clean[key] = number(barcode[key]);
    }
    result.barcodeMeta = clean;
  }
  return JSON.stringify(result);
}

export function parseMacroCsv(text: string, timezone: string): ParsedMacroCsv {
  try { macroCsvDateParts(new Date(0), timezone); } catch { throw new Error('Choose a valid IANA timezone.'); }
  const records = readCsv(text);
  if (!records.length || records[0].join(',') !== MACRO_CSV_COLUMNS.join(',')) {
    throw new Error('CSV must use the Macro 16-column header.');
  }
  const rows = records.slice(1).map((values, index) => {
    if (values.length !== MACRO_CSV_COLUMNS.length) throw new Error(`Row ${index + 2}: expected 16 columns.`);
    return Object.fromEntries(MACRO_CSV_COLUMNS.map((key, i) => [key, values[i]])) as MacroCsvRow;
  });
  let unitSystem: string | null = null;
  for (const [index, row] of rows.entries()) {
    if (row.record_type === 'meta') {
      const user = object(object(json(row.payload_json))?.user);
      const units = user?.unitSystem;
      if (units !== 'metric' && units !== 'imperial') throw new Error(`Row ${index + 2}: metadata needs metric or imperial unitSystem.`);
      if (unitSystem && unitSystem !== units) throw new Error(`Row ${index + 2}: conflicting weight units.`);
      unitSystem = units;
    }
  }
  const parsed: ParsedMacroCsv = { meals: [], weights: [], timezone, dateStart: null, dateEnd: null, detailFallbacks: 0 };
  const seen = new Set<string>(), dates: string[] = [];
  for (const [index, row] of rows.entries()) {
    const error = (message: string): never => { throw new Error(`Row ${index + 2}: ${message}`); };
    if (row.record_type === 'meta') continue;
    if (row.record_type !== 'meal' && row.record_type !== 'weight') error('unknown record type.');
    if (!row.id.trim() || row.id.length > 256) error('a source ID is required and must be at most 256 characters.');
    const identity = `${row.record_type}:${row.id}`;
    if (seen.has(identity)) error('duplicate source ID.');
    seen.add(identity);
    if (row.record_type === 'weight') {
      if (!unitSystem) error('weight unit metadata is missing.');
      if (!validDate(row.date)) error('invalid weight date.');
      const value = number(row.weight);
      if (value == null) error('invalid weight.');
      const kilograms = value! * (unitSystem === 'imperial' ? 0.45359237 : 1);
      const issue = validateWeightKg(kilograms);
      if (issue) error(issue);
      parsed.weights.push({ sourceId: row.id, logDate: row.date, kilograms });
      dates.push(row.date);
      continue;
    }
    if (!row.name.trim() || row.name.length > 2000) error('a meal name is required and must be at most 2000 characters.');
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(row.created_at)) error('meal timestamp must include a timezone offset.');
    const timestamp = parseSqliteUtcTimestamp(row.created_at);
    if (!Number.isFinite(timestamp.getTime())) error('invalid meal timestamp.');
    const { date, hour } = macroCsvDateParts(timestamp, timezone);
    const meal = mealType(hour);
    const values = nutrients.map(key => number(row[key]));
    if (values.some(value => value == null)) error('calories and macros must be finite, non-negative numbers.');
    const totals = Object.fromEntries(nutrients.map((key, i) => [key, values[i]!])) as Nutrients;
    const details = detailsFrom(row);
    const reliable = details != null && nutrients.every(key => {
      const sum = details.reduce((total, detail) => total + detail.quantity * detail.perServing[key], 0);
      // Macro stores whole-number meal totals while detail nutrition retains fractions.
      // Require the actual rounding result, rather than widening the mismatch allowance.
      return Number.isInteger(totals[key]) ? Math.round(sum) === totals[key]
        : Math.abs(sum - totals[key]) <= (key === 'calories' ? 1 : 0.1) + 1e-9;
    });
    const base = { log_date: date, meal, source: 'manual' as const };
    let components: FoodLogInput[];
    if (reliable) {
      const corrected = details.map(detail => ({ ...detail.perServing,
        calories: detail.quantity * detail.perServing.calories,
        protein: detail.quantity * detail.perServing.protein,
        carbs: detail.quantity * detail.perServing.carbs,
        fats: detail.quantity * detail.perServing.fats,
      }));
      for (const key of nutrients) {
        const sum = corrected.reduce((total, item) => total + item[key], 0);
        // Proportional correction keeps every component non-negative, including zero totals.
        corrected.forEach(item => { item[key] = sum === 0 ? 0 : item[key] * totals[key] / sum; });
        const largest = corrected.reduce((best, item, i) => item[key] > corrected[best][key] ? i : best, 0);
        corrected[largest][key] += totals[key] - corrected.reduce((total, item) => total + item[key], 0);
      }
      components = details.map((detail, i) => {
        const knownGrams = detail.unit.toLowerCase() === 'g' ? detail.quantity : null;
        const item = corrected[i];
        const grams = knownGrams != null && Object.values(item).every(value => Number.isFinite(value / knownGrams * 100))
          ? knownGrams : null;
        return { ...base, name: detail.name, calories: item.calories, protein_g: item.protein,
          carbs_g: item.carbs, fat_g: item.fats, grams_logged: grams,
          ...(grams == null ? { portion_quantity: detail.quantity, portion_unit: detail.unit } : {}),
          serving_label: grams == null ? detail.unit : null, serving_size_g: null,
          ...(grams == null ? {} : { calories_per_100g: item.calories / grams * 100,
            protein_g_per_100g: item.protein / grams * 100, carbs_g_per_100g: item.carbs / grams * 100,
            fat_g_per_100g: item.fats / grams * 100 }),
        };
      });
    } else {
      components = [{ ...base, name: row.name.trim(), calories: totals.calories,
        protein_g: totals.protein, carbs_g: totals.carbs, fat_g: totals.fats,
        portion_quantity: 1, portion_unit: 'serving' }];
      parsed.detailFallbacks++;
    }
    const ingredientNames = json(row.ingredients_json);
    const originalRow: MacroCsvRow = { ...row, image_uri: '',
      ingredients_json: Array.isArray(ingredientNames) && ingredientNames.length <= 1000
        && ingredientNames.every(value => typeof value === 'string' && value.length <= 2000)
        ? JSON.stringify(ingredientNames) : details ? JSON.stringify(details.map(detail => detail.name)) : '[]',
      payload_json: sanitizedPayload(row, details),
      ai_needs_clarification: /^(true|false|0|1)$/.test(row.ai_needs_clarification) ? row.ai_needs_clarification : '',
      ai_clarification_question: '',
      ai_clarification_used: /^(true|false|0|1)$/.test(row.ai_clarification_used) ? row.ai_clarification_used : '',
    };
    parsed.meals.push({ sourceId: row.id, name: row.name.trim(), createdAt: timestamp.toISOString(),
      logDate: date, mealType: meal, components, originalRow, detailFallback: !reliable });
    dates.push(date);
  }
  if (dates.length) { dates.sort(); parsed.dateStart = dates[0]; parsed.dateEnd = dates[dates.length - 1]; }
  return parsed;
}
