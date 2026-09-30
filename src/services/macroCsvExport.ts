import type { DailyTarget, ExportMeal, FoodLog, Profile, WeightLog } from '../db/database';
import { csv } from '../utils/csv';
import { parseSqliteUtcTimestamp } from '../utils/sqliteTimestamp';
import { MACRO_CSV_COLUMNS, type MacroCsvRow } from './macroCsv.types';
import { parseMacroCsv } from './macroCsv';
import { fingerprintFood, fingerprintMeal, fingerprintWeight, type CsvRecordLink } from './csvRecordIdentity';

export interface MacroExportSnapshot {
  profile: Profile | null;
  meals: ExportMeal[];
  foods: FoodLog[];
  weights: WeightLog[];
  currentTarget: DailyTarget | null;
  links: CsvRecordLink[];
}

function row(fields: Partial<MacroCsvRow>): MacroCsvRow {
  return Object.assign(Object.fromEntries(MACRO_CSV_COLUMNS.map((column) => [column, ''])), fields) as MacroCsvRow;
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function clockParts(date: Date, timezone: string): Record<string, string> {
  let formatter = clockFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    clockFormatters.set(timezone, formatter);
  }
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

/** Preserve diary dates even for entries backdated after their creation. */
export function exportMealTimestamp(logDate: string, createdAt: string, timezone: string): string {
  const original = parseSqliteUtcTimestamp(createdAt);
  if (Number.isFinite(original.getTime())) {
    const p = clockParts(original, timezone);
    if (`${p.year}-${p.month}-${p.day}` === logDate) return original.toISOString();
  }
  const desired = Date.parse(`${logDate}T12:00:00Z`);
  let instant = desired;
  for (let pass = 0; pass < 3; pass++) {
    const p = clockParts(new Date(instant), timezone);
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    instant += desired - local;
  }
  return new Date(instant).toISOString();
}

export function buildMacroCsv(snapshot: MacroExportSnapshot, options: { timezone: string; createId: () => string; today?: string }): { text: string; newLinks: CsvRecordLink[] } {
  const rows: MacroCsvRow[] = [];
  const newLinks: CsvRecordLink[] = [];
  const groupedFoods = new Map<number, FoodLog[]>();
  const standaloneFoods: FoodLog[] = [];
  for (const food of snapshot.foods) {
    if (food.meal_id == null) standaloneFoods.push(food);
    else {
      let group = groupedFoods.get(food.meal_id);
      if (!group) { group = []; groupedFoods.set(food.meal_id, group); }
      group.push(food);
    }
  }
  const mealLinks = new Map<number, CsvRecordLink>();
  const foodLinks = new Map<number, CsvRecordLink>();
  const weightLinks = new Map<number, CsvRecordLink>();
  for (const link of snapshot.links) {
    if (link.record_type === 'weight' && link.weight_log_id != null) weightLinks.set(link.weight_log_id, link);
    if (link.record_type === 'meal') {
      if (link.meal_id != null) mealLinks.set(link.meal_id, link);
      if (link.food_log_id != null) foodLinks.set(link.food_log_id, link);
    }
  }
  const profile = snapshot.profile;
  const target = snapshot.currentTarget;
  const today = options.today ?? (() => { const p = clockParts(new Date(), options.timezone); return `${p.year}-${p.month}-${p.day}`; })();
  const latestWeight = snapshot.weights.filter((weight) => weight.log_date <= today).sort((a, b) => b.log_date.localeCompare(a.log_date))[0];
  const firstDate = [...snapshot.foods.map((food) => food.log_date), ...snapshot.weights.map((weight) => weight.log_date)].sort()[0];
  const profileDate = profile ? parseSqliteUtcTimestamp(profile.created_at) : null;
  const profileParts = profileDate && Number.isFinite(profileDate.getTime()) ? clockParts(profileDate, options.timezone) : null;
  const appStartDate = firstDate ?? (profileParts ? `${profileParts.year}-${profileParts.month}-${profileParts.day}` : today);
  const user: Record<string, unknown> = { unitSystem: 'metric', adaptiveEnabled: true, macroPreset: 'default', burnOffsetPercent: 100, calorieSurplusVisibility: 'shown', dailyTargetsManuallyEdited: true };
  if (profile) Object.assign(user, {
    gender: profile.sex, activityLevel: profile.activity_level,
    goal: { cut: 'lose', maintain: 'maintain', bulk: 'gain' }[profile.goal_type],
    height: profile.height_cm, birthday: profile.birth_date, goalPace: profile.goal_rate_kg_per_week,
    ...(profile.target_weight_kg == null ? {} : { dreamWeight: profile.target_weight_kg }),
  });
  if (latestWeight) user.weight = latestWeight.scale_weight_kg;
  if (target) Object.assign(user, { dailyCalories: target.target_calories, protein: target.target_protein_g, carbs: target.target_carbs_g, fats: target.target_fat_g });
  rows.push(row({ record_type: 'meta', payload_json: JSON.stringify({ user, appStartDate, onboardingCompleted: !!profile, progressBannerDismissed: false, communityBannerDismissed: false, mealsAccuracyTipBannerDismissed: true, firstMealReviewPrompted: true }) }));

  const emitMeal = (meal: ExportMeal, foods: FoodLog[], standaloneId: number | null) => {
    if (foods.length === 0) return;
    const fingerprint = standaloneId == null ? fingerprintMeal(meal, foods) : fingerprintFood(foods[0]);
    const existing = standaloneId == null ? mealLinks.get(meal.id) : foodLinks.get(standaloneId);
    const id = existing?.source_id ?? options.createId();
    const ingredients = foods.map((food, index) => {
      const grams = food.grams_logged;
      const knownMass = grams != null && grams > 0;
      const quantity = knownMass ? grams : food.portion_quantity != null && food.portion_quantity > 0 ? food.portion_quantity : 1;
      const unit = knownMass ? 'g' : food.portion_unit?.trim() || 'serving';
      return { name: food.name, quantity, unit, perServing: { calories: food.calories / quantity, protein: food.protein_g / quantity, carbs: food.carbs_g / quantity, fats: food.fat_g / quantity }, id: `${id}-${index}`, compatibleUnits: knownMass ? ['g', 'oz'] : [unit] };
    });
    let original: MacroCsvRow | null = null;
    if (existing?.native_fingerprint === fingerprint && existing.original_row_json) {
      try {
        const stored: unknown = JSON.parse(existing.original_row_json);
        if (stored && typeof stored === 'object' && MACRO_CSV_COLUMNS.every((column) => typeof (stored as MacroCsvRow)[column] === 'string')) {
          // Restored archives can contain old or malformed links. Revalidate and sanitize
          // allowed detail instead of trusting persisted JSON as CSV cells.
          const originalText = csv([[...MACRO_CSV_COLUMNS], MACRO_CSV_COLUMNS.map((column) => (stored as MacroCsvRow)[column])]);
          const validated = parseMacroCsv(originalText, options.timezone).meals[0];
          if (validated?.sourceId === id) original = validated.originalRow;
        }
      } catch { /* Generate current detail if old local metadata is invalid. */ }
    }
    const result = row({ record_type: 'meal', id, name: meal.name,
      calories: String(foods.reduce((sum, food) => sum + food.calories, 0)),
      protein: String(foods.reduce((sum, food) => sum + food.protein_g, 0)),
      carbs: String(foods.reduce((sum, food) => sum + food.carbs_g, 0)),
      fats: String(foods.reduce((sum, food) => sum + food.fat_g, 0)),
      created_at: exportMealTimestamp(meal.log_date, meal.created_at, options.timezone),
      ingredients_json: original?.ingredients_json ?? JSON.stringify(ingredients.map((item) => `${item.quantity} ${item.unit} ${item.name}`)),
      ai_needs_clarification: 'false', ai_clarification_used: 'false',
      payload_json: original?.payload_json ?? JSON.stringify({ ingredientsDetailed: ingredients }),
    });
    rows.push(result);
    if (!existing) newLinks.push({ record_type: 'meal', source_id: id, meal_id: standaloneId == null ? meal.id : null, food_log_id: standaloneId, weight_log_id: null, original_row_json: JSON.stringify(result), native_fingerprint: fingerprint });
  };
  for (const meal of snapshot.meals) emitMeal(meal, groupedFoods.get(meal.id) ?? [], null);
  for (const food of standaloneFoods) emitMeal({ id: food.id, name: food.name, log_date: food.log_date, meal_type: food.meal, created_at: food.logged_at }, [food], food.id);
  for (const weight of snapshot.weights) {
    const existing = weightLinks.get(weight.id);
    const id = existing?.source_id ?? options.createId();
    const result = row({ record_type: 'weight', id, date: weight.log_date, weight: String(weight.scale_weight_kg) });
    rows.push(result);
    if (!existing) newLinks.push({ record_type: 'weight', source_id: id, meal_id: null, food_log_id: null, weight_log_id: weight.id, original_row_json: JSON.stringify(result), native_fingerprint: fingerprintWeight(weight) });
  }
  return { text: csv([ [...MACRO_CSV_COLUMNS], ...rows.map((item) => MACRO_CSV_COLUMNS.map((column) => item[column])) ]), newLinks };
}
