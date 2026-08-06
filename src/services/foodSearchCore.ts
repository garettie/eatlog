import type {
  DataType,
  DedupNearMiss,
  FoodResult,
  FoodSearchMode,
} from './foodSearchTypes';

const PREPARATIONS = [
  'raw', 'cooked', 'grilled', 'baked', 'fried', 'roasted', 'steamed',
  'boiled', 'scrambled', 'poached', 'toasted', 'dried', 'smoked',
  'canned', 'frozen',
] as const;

const PREPARATION_PATTERN = new RegExp(`\\b(${PREPARATIONS.join('|')})\\b`, 'i');

const NOISE_TOKENS = [
  'grade aa', 'grade a', 'grade', 'extra large', 'large', 'medium', 'small',
  'or fryers', 'fryers', 'broilers', 'roasters', 'breeder',
];

interface AliasGroup {
  terms: string[];
  providerTerm: string;
}

export const FOOD_ALIAS_GROUPS: readonly AliasGroup[] = [
  { terms: ['aubergine', 'eggplant'], providerTerm: 'eggplant' },
  { terms: ['garbanzo', 'chickpea'], providerTerm: 'chickpea' },
  { terms: ['minced beef', 'ground beef'], providerTerm: 'ground beef' },
  { terms: ['minced pork', 'ground pork'], providerTerm: 'ground pork' },
  { terms: ['capsicum', 'bell pepper'], providerTerm: 'bell pepper' },
  { terms: ['courgette', 'zucchini'], providerTerm: 'zucchini' },
  { terms: ['coriander', 'cilantro'], providerTerm: 'cilantro' },
  { terms: ['rocket', 'arugula'], providerTerm: 'arugula' },
  { terms: ['prawn', 'shrimp'], providerTerm: 'shrimp' },
  { terms: ['scallion', 'spring onion', 'green onion'], providerTerm: 'green onion' },
  { terms: ['maize', 'corn'], providerTerm: 'corn' },
  { terms: ['icing sugar', 'powdered sugar'], providerTerm: 'powdered sugar' },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacePhrase(value: string, from: string, to: string): string {
  return value.replace(new RegExp(`\\b${escapeRegex(from)}\\b`, 'g'), to);
}

export function normalizeFoodText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPreparation(value: string): string | null {
  return normalizeFoodText(value).match(PREPARATION_PATTERN)?.[0] ?? null;
}

export function normalizeFoodName(
  name: string,
  brand: string | null,
): { normalizedName: string; preparation: string | null } {
  let result = normalizeFoodText(name);
  const preparation = extractPreparation(result);
  if (brand) {
    result = replacePhrase(result, normalizeFoodText(brand), ' ');
  }
  for (const token of NOISE_TOKENS) {
    result = replacePhrase(result, token, ' ');
  }
  return { normalizedName: result.replace(/\s+/g, ' ').trim(), preparation };
}

export function cleanFoodDisplayName(description: string): string {
  let result = normalizeFoodText(description.replace(/\([^)]*\)/g, ' '));
  for (const token of NOISE_TOKENS) {
    result = replacePhrase(result, token, ' ');
  }
  return result
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s-])\S/g, (character) => character.toUpperCase());
}

export function expandFoodAliases(query: string): string[] {
  const normalized = normalizeFoodText(query);
  const expanded = new Set([normalized]);
  for (const group of FOOD_ALIAS_GROUPS) {
    for (const term of group.terms) {
      if (!new RegExp(`\\b${escapeRegex(term)}\\b`).test(normalized)) continue;
      for (const alternative of group.terms) {
        expanded.add(replacePhrase(normalized, term, alternative).replace(/\s+/g, ' ').trim());
      }
    }
  }
  return [...expanded];
}

export function rewriteFoodProviderQuery(query: string): string {
  let rewritten = normalizeFoodText(query);
  for (const group of FOOD_ALIAS_GROUPS) {
    for (const term of group.terms) {
      if (new RegExp(`\\b${escapeRegex(term)}\\b`).test(rewritten)) {
        rewritten = replacePhrase(rewritten, term, group.providerTerm);
        break;
      }
    }
  }
  return rewritten.replace(/\s+/g, ' ').trim();
}

function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('oes')) return token.slice(0, -2);
  if (/(ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function comparableTokens(value: string): string[] {
  return normalizeFoodText(value).split(' ').filter(Boolean).map(singularize);
}

function includesPhrase(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

function matchClass(query: string, item: FoodResult, mode: FoodSearchMode): number {
  const candidateText = normalizeFoodText(
    mode === 'full' ? (item.searchText ?? `${item.name} ${item.normalizedName}`) : `${item.name} ${item.normalizedName}`,
  );
  const candidateTokens = comparableTokens(candidateText);
  let best = 0;
  for (const alias of expandFoodAliases(query)) {
    const aliasTokens = comparableTokens(alias);
    const normalizedCandidateName = comparableTokens(item.normalizedName).join(' ');
    const normalizedAlias = aliasTokens.join(' ');
    if (!normalizedAlias) continue;
    if (normalizedCandidateName === normalizedAlias) best = Math.max(best, 4);
    else if (normalizedCandidateName.startsWith(`${normalizedAlias} `)) best = Math.max(best, 3);
    else if (aliasTokens.every((token) => candidateTokens.includes(token))) best = Math.max(best, 2);
    else if (aliasTokens.some((token) => candidateTokens.includes(token))) best = Math.max(best, 1);
    else if (includesPhrase(candidateText, alias)) best = Math.max(best, 2);
  }
  return best;
}

function explicitProductMatch(query: string, item: FoodResult, mode: FoodSearchMode): boolean {
  if (mode !== 'full' || !item.brand || (item.dataType !== 'Branded' && item.dataType !== 'off')) return false;
  const queryTokens = comparableTokens(query);
  const brandTokens = comparableTokens(item.brand);
  const productTokens = comparableTokens(item.normalizedName);
  const fullName = comparableTokens(`${item.brand} ${item.name}`).join(' ');
  const normalizedQuery = queryTokens.join(' ');
  return normalizedQuery === fullName
    || (brandTokens.length > 0
      && brandTokens.every((token) => queryTokens.includes(token))
      && productTokens.some((token) => queryTokens.includes(token) && !brandTokens.includes(token)));
}

function sourceRank(dataType: DataType): number {
  switch (dataType) {
    case 'Survey (FNDDS)': return 0;
    case 'SR Legacy': return 1;
    case 'Foundation': return 2;
    case 'Branded': return 3;
    case 'off': return 4;
    default: return 5;
  }
}

function isPersonal(item: FoodResult): boolean {
  return item.source === 'scan' || item.source === 'describe';
}

function usabilityRank(item: FoodResult): number {
  const macros = [item.caloriesPer100g, item.proteinPer100g, item.carbsPer100g, item.fatPer100g];
  const complete = macros.every((value) => value != null && Number.isFinite(value) && value >= 0);
  const portion = item.servingSizeGrams != null && Number.isFinite(item.servingSizeGrams) && item.servingSizeGrams > 0;
  return (complete ? 0 : 2) + (portion ? 0 : 1);
}

function preparationRank(requested: string | null, candidate: string | null): number {
  if (!requested) return 0;
  if (requested === candidate) return 0;
  if (!candidate) return 1;
  return 2;
}

function makeComparator(items: FoodResult[], query: string, mode: FoodSearchMode) {
  const inputOrder = new Map(items.map((item, index) => [item.id, index]));
  const requestedPreparation = extractPreparation(query);
  const matchClasses = new Map(items.map((item) => [item.id, matchClass(query, item, mode)]));
  return (first: FoodResult, second: FoodResult): number => {
    const firstMatch = matchClasses.get(first.id) ?? 0;
    const secondMatch = matchClasses.get(second.id) ?? 0;
    if (firstMatch !== secondMatch) return secondMatch - firstMatch;

    const firstProduct = explicitProductMatch(query, first, mode) ? 0 : 1;
    const secondProduct = explicitProductMatch(query, second, mode) ? 0 : 1;
    if (firstProduct !== secondProduct) return firstProduct - secondProduct;

    const firstPersonal = isPersonal(first) && firstMatch >= 2 ? 0 : 1;
    const secondPersonal = isPersonal(second) && secondMatch >= 2 ? 0 : 1;
    if (firstPersonal !== secondPersonal) return firstPersonal - secondPersonal;

    const firstSource = sourceRank(first.dataType);
    const secondSource = sourceRank(second.dataType);
    if (firstSource !== secondSource) return firstSource - secondSource;

    const firstPreparation = preparationRank(requestedPreparation, first.preparation);
    const secondPreparation = preparationRank(requestedPreparation, second.preparation);
    if (firstPreparation !== secondPreparation) return firstPreparation - secondPreparation;

    const firstUsability = usabilityRank(first);
    const secondUsability = usabilityRank(second);
    if (firstUsability !== secondUsability) return firstUsability - secondUsability;

    const firstProviderOrder = first.providerOrder ?? inputOrder.get(first.id) ?? 0;
    const secondProviderOrder = second.providerOrder ?? inputOrder.get(second.id) ?? 0;
    if (firstProviderOrder !== secondProviderOrder) return firstProviderOrder - secondProviderOrder;
    return first.sourceFoodId.localeCompare(second.sourceFoodId, undefined, { numeric: true });
  };
}

const MACRO_KEYS = [
  ['calories', 'caloriesPer100g'],
  ['protein', 'proteinPer100g'],
  ['carbs', 'carbsPer100g'],
  ['fat', 'fatPer100g'],
] as const;

export function macroPercentageDifferences(first: FoodResult, second: FoodResult): DedupNearMiss['differences'] | null {
  const differences = {} as DedupNearMiss['differences'];
  for (const [label, key] of MACRO_KEYS) {
    const firstValue = first[key];
    const secondValue = second[key];
    if (firstValue == null || secondValue == null) return null;
    const maximum = Math.max(firstValue, secondValue);
    differences[label] = maximum === 0 ? 0 : Math.abs(firstValue - secondValue) / maximum;
  }
  return differences;
}

function dedupKey(item: FoodResult): string {
  return [
    normalizeFoodText(item.normalizedName),
    normalizeFoodText(item.preparation ?? ''),
    normalizeFoodText(item.brand ?? ''),
  ].join('|');
}

function appendAlternates(canonical: FoodResult, duplicate: FoodResult): void {
  const additions = [
    { source: duplicate.source, id: duplicate.sourceFoodId },
    ...duplicate.alternateSourceIds,
  ];
  for (const alternate of additions) {
    if (alternate.source === canonical.source && alternate.id === canonical.sourceFoodId) continue;
    if (canonical.alternateSourceIds.some((item) => item.source === alternate.source && item.id === alternate.id)) continue;
    canonical.alternateSourceIds.push(alternate);
  }
}

export function rankAndDeduplicateFoodResults(
  items: FoodResult[],
  query: string,
  mode: FoodSearchMode = 'common',
): { items: FoodResult[]; nearMisses: DedupNearMiss[] } {
  const comparator = makeComparator(items, query, mode);
  const ranked = [...items].filter((item) => matchClass(query, item, mode) > 0).sort(comparator);
  const canonical: FoodResult[] = [];
  const nearMisses: DedupNearMiss[] = [];

  for (const item of ranked) {
    const key = dedupKey(item);
    const candidates = canonical.filter((existing) => dedupKey(existing) === key);
    let merged = false;
    for (const existing of candidates) {
      const differences = macroPercentageDifferences(existing, item);
      if (!differences) continue;
      const largest = Math.max(...Object.values(differences));
      if (largest >= 0.15 && largest <= 0.25) {
        nearMisses.push({
          first: { id: existing.id, name: existing.name, sourceFoodId: existing.sourceFoodId },
          second: { id: item.id, name: item.name, sourceFoodId: item.sourceFoodId },
          differences,
          merged: largest <= 0.2,
        });
      }
      if (largest <= 0.2) {
        appendAlternates(existing, item);
        merged = true;
        break;
      }
    }
    if (!merged) canonical.push({ ...item, alternateSourceIds: [...item.alternateSourceIds] });
  }

  canonical.sort(comparator);
  return { items: canonical.slice(0, 25), nearMisses };
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseRequiredMacros(values: {
  calories: unknown;
  protein: unknown;
  carbs: unknown;
  fat: unknown;
}): Pick<FoodResult, 'caloriesPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'> | null {
  const calories = finiteNonNegative(values.calories);
  const protein = finiteNonNegative(values.protein);
  const carbs = finiteNonNegative(values.carbs);
  const fat = finiteNonNegative(values.fat);
  if (calories == null || protein == null || carbs == null || fat == null) return null;
  return {
    caloriesPer100g: calories,
    proteinPer100g: protein,
    carbsPer100g: carbs,
    fatPer100g: fat,
  };
}

function usdaDataType(value: unknown): Extract<DataType, 'Survey (FNDDS)' | 'Foundation' | 'SR Legacy' | 'Branded'> | null {
  return value === 'Survey (FNDDS)' || value === 'Foundation' || value === 'SR Legacy' || value === 'Branded'
    ? value
    : null;
}

function parseUSDAMacros(foodNutrients: unknown): ReturnType<typeof parseRequiredMacros> {
  if (!Array.isArray(foodNutrients)) return null;
  const values = new Map<number, unknown>();
  for (const entry of foodNutrients) {
    if (!entry || typeof entry !== 'object') continue;
    const nutrient = entry as Record<string, any>;
    const id = Number(nutrient.nutrientId ?? nutrient.nutrient_id ?? nutrient.nutrient?.id);
    values.set(id, nutrient.value ?? nutrient.amount);
  }
  return parseRequiredMacros({
    calories: values.get(1008),
    protein: values.get(1003),
    carbs: values.get(1005),
    fat: values.get(1004),
  });
}

function portionFromUSDA(food: Record<string, any>): { servingSizeGrams: number | null; servingLabel: string | null } {
  const portions = Array.isArray(food.foodPortions) ? food.foodPortions : [];
  for (const rawPortion of portions) {
    const gramWeight = finiteNonNegative(rawPortion?.gramWeight);
    if (gramWeight == null || gramWeight <= 0) continue;
    return {
      servingSizeGrams: gramWeight,
      servingLabel: rawPortion.portionDescription?.trim()
        || rawPortion.modifier?.trim()
        || `${gramWeight}g`,
    };
  }
  const servingSize = finiteNonNegative(food.servingSize);
  return servingSize != null && servingSize > 0
    ? { servingSizeGrams: servingSize, servingLabel: `${servingSize}g` }
    : { servingSizeGrams: null, servingLabel: null };
}

export function parseUSDAFoods(foods: unknown): FoodResult[] {
  if (!Array.isArray(foods)) return [];
  return foods.flatMap((rawFood, providerOrder): FoodResult[] => {
    if (!rawFood || typeof rawFood !== 'object') return [];
    const food = rawFood as Record<string, any>;
    const dataType = usdaDataType(food.dataType);
    const macros = parseUSDAMacros(food.foodNutrients);
    const fdcId = food.fdcId;
    if (!dataType || !macros || fdcId == null || typeof food.description !== 'string' || !food.description.trim()) return [];
    const brand = dataType === 'Branded'
      ? String(food.brandOwner ?? food.brandName ?? '').trim() || null
      : null;
    const { normalizedName, preparation } = normalizeFoodName(food.description, brand);
    const portion = portionFromUSDA(food);
    return [{
      id: `usda-${fdcId}`,
      name: cleanFoodDisplayName(food.description),
      source: 'usda',
      sourceFoodId: String(fdcId),
      dataType,
      brand,
      preparation,
      normalizedName,
      searchText: [food.description, food.additionalDescriptions, brand].filter(Boolean).join(' '),
      providerOrder,
      ...macros,
      ...portion,
      alternateSourceIds: [],
    }];
  });
}

export function mergeUSDAFoodPortions(items: FoodResult[], details: unknown): FoodResult[] {
  if (!Array.isArray(details)) return items;
  const portions = new Map<string, ReturnType<typeof portionFromUSDA>>();
  for (const rawDetail of details) {
    if (!rawDetail || typeof rawDetail !== 'object') continue;
    const detail = rawDetail as Record<string, any>;
    if (detail.fdcId == null) continue;
    portions.set(String(detail.fdcId), portionFromUSDA(detail));
  }
  return items.map((item) => {
    const portion = portions.get(item.sourceFoodId);
    if (!portion?.servingSizeGrams) return item;
    return { ...item, ...portion };
  });
}

export function parseOpenFoodFactsProducts(products: unknown): FoodResult[] {
  if (!Array.isArray(products)) return [];
  return products.flatMap((rawProduct, providerOrder): FoodResult[] => {
    if (!rawProduct || typeof rawProduct !== 'object') return [];
    const product = rawProduct as Record<string, any>;
    const nutrients = product.nutriments;
    if (!nutrients || typeof nutrients !== 'object') return [];
    const calories = nutrients['energy-kcal_100g'] != null
      ? finiteNonNegative(nutrients['energy-kcal_100g'])
      : (() => {
        const kilojoules = finiteNonNegative(nutrients.energy_100g);
        return kilojoules == null ? null : kilojoules / 4.184;
      })();
    const macros = parseRequiredMacros({
      calories,
      protein: nutrients.proteins_100g,
      carbs: nutrients.carbohydrates_100g,
      fat: nutrients.fat_100g,
    });
    const productName = typeof product.product_name === 'string' ? product.product_name.trim() : '';
    if (!macros || !productName || product.code == null) return [];
    const brand = typeof product.brands === 'string'
      ? product.brands.split(',')[0].trim() || null
      : null;
    const { normalizedName, preparation } = normalizeFoodName(productName, brand);
    const servingSize = finiteNonNegative(product.serving_quantity);
    return [{
      id: `off-${product.code}`,
      name: cleanFoodDisplayName(productName),
      source: 'off',
      sourceFoodId: String(product.code),
      dataType: 'off',
      brand,
      preparation,
      normalizedName,
      searchText: [productName, brand].filter(Boolean).join(' '),
      providerOrder,
      ...macros,
      servingSizeGrams: servingSize != null && servingSize > 0 ? servingSize : null,
      servingLabel: servingSize != null && servingSize > 0 ? `${Math.round(servingSize)}g` : null,
      alternateSourceIds: [],
    }];
  });
}
