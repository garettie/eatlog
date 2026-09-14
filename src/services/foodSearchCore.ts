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

const FOOD_ALIAS_GROUPS: readonly AliasGroup[] = [
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
  { terms: ['talong', 'eggplant'], providerTerm: 'eggplant' },
  { terms: ['kamote', 'sweet potato'], providerTerm: 'sweet potato' },
  { terms: ['sayote', 'chayote'], providerTerm: 'chayote' },
  { terms: ['pechay', 'bok choy'], providerTerm: 'bok choy' },
  { terms: ['kangkong', 'water spinach'], providerTerm: 'water spinach' },
  { terms: ['bangus', 'milkfish'], providerTerm: 'milkfish' },
  { terms: ['galunggong', 'round scad'], providerTerm: 'round scad' },
  { terms: ['calamansi', 'calamondin'], providerTerm: 'calamondin' },
  { terms: ['malunggay', 'moringa'], providerTerm: 'moringa' },
  { terms: ['togue', 'mung bean sprouts'], providerTerm: 'mung bean sprouts' },
  { terms: ['tokwa', 'tofu'], providerTerm: 'tofu' },
  { terms: ['lugaw', 'rice porridge'], providerTerm: 'rice porridge' },
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

function extractPreparation(value: string): string | null {
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

function cleanFoodDisplayName(description: string): string {
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

function isOneEditApart(first: string, second: string): boolean {
  if (first === second) return true;
  if (Math.abs(first.length - second.length) > 1) return false;
  if (first.length === second.length) {
    const differences: number[] = [];
    for (let index = 0; index < first.length; index += 1) {
      if (first[index] !== second[index]) differences.push(index);
      if (differences.length > 2) return false;
    }
    if (differences.length === 1) return true;
    return differences.length === 2
      && differences[1] === differences[0] + 1
      && first[differences[0]] === second[differences[1]]
      && first[differences[1]] === second[differences[0]];
  }
  const shorter = first.length < second.length ? first : second;
  const longer = first.length < second.length ? second : first;
  let shortIndex = 0;
  let longIndex = 0;
  let edits = 0;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
    } else {
      edits += 1;
      longIndex += 1;
      if (edits > 1) return false;
    }
  }
  return true;
}

function matchClass(query: string, item: FoodResult, mode: FoodSearchMode, queryAliases: string[]): number {
  const normalizedQuery = normalizeFoodText(query);
  if (!normalizedQuery) return 1;
  const candidateText = normalizeFoodText(
    mode === 'full' ? (item.searchText ?? `${item.name} ${item.normalizedName}`) : `${item.name} ${item.normalizedName}`,
  );
  const candidateTokens = comparableTokens(candidateText);
  const candidateNames = [item.normalizedName, ...(item.aliases ?? [])].map((name) => comparableTokens(name).join(' '));
  let best = 0;
  for (const alias of queryAliases) {
    const aliasTokens = comparableTokens(alias);
    const normalizedAlias = aliasTokens.join(' ');
    if (!normalizedAlias) continue;
    if (candidateNames.some((name) => name === normalizedAlias)) {
      best = Math.max(best, 4);
      continue;
    }
    if (candidateNames.some((name) => name.startsWith(`${normalizedAlias} `))) {
      best = Math.max(best, 3);
      continue;
    }
    const allPrefixMatches = aliasTokens.every((queryToken) =>
      candidateTokens.some((candidateToken) => candidateToken === queryToken || candidateToken.startsWith(queryToken)),
    );
    if (allPrefixMatches) {
      best = Math.max(best, 2);
      continue;
    }
    const allFuzzyMatches = aliasTokens.every((queryToken) => queryToken.length >= 5
      && candidateTokens.some((candidateToken) => isOneEditApart(queryToken, candidateToken)));
    if (allFuzzyMatches) best = Math.max(best, 1);
  }
  return best;
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
  return item.history != null;
}

function usabilityRank(item: FoodResult): number {
  const macros = [item.caloriesPer100g, item.proteinPer100g, item.carbsPer100g, item.fatPer100g];
  const complete = macros.every((value) => value != null && Number.isFinite(value) && value >= 0);
  const portion = item.portions.some((candidate) => Number.isFinite(candidate.grams) && candidate.grams > 0);
  return (complete ? 0 : 2) + (portion ? 0 : 1);
}

function preparationRank(requested: string | null, candidate: string | null): number {
  if (!requested) return 0;
  if (requested === candidate) return 0;
  if (!candidate) return 1;
  return 2;
}

function makeComparator(items: FoodResult[], query: string, matchClasses: Map<string, number>) {
  const inputOrder = new Map(items.map((item, index) => [item.id, index]));
  const requestedPreparation = extractPreparation(query);
  return (first: FoodResult, second: FoodResult): number => {
    const firstMatch = matchClasses.get(first.id) ?? 0;
    const secondMatch = matchClasses.get(second.id) ?? 0;
    if (firstMatch !== secondMatch) return secondMatch - firstMatch;

    const firstPersonal = isPersonal(first) ? 0 : 1;
    const secondPersonal = isPersonal(second) ? 0 : 1;
    if (firstPersonal !== secondPersonal) return firstPersonal - secondPersonal;

    const firstPinned = first.isPinned ? 0 : 1;
    const secondPinned = second.isPinned ? 0 : 1;
    if (firstPinned !== secondPinned) return firstPinned - secondPinned;

    const firstTimes = first.history?.timesLogged ?? 0;
    const secondTimes = second.history?.timesLogged ?? 0;
    if (firstTimes !== secondTimes) return secondTimes - firstTimes;

    const firstLoggedAt = first.history?.lastLoggedAt ?? '';
    const secondLoggedAt = second.history?.lastLoggedAt ?? '';
    if (firstLoggedAt !== secondLoggedAt) return secondLoggedAt.localeCompare(firstLoggedAt);

    if (!!first.isCommonFood !== !!second.isCommonFood) return first.isCommonFood ? -1 : 1;

    const firstPreparation = preparationRank(requestedPreparation, first.preparation);
    const secondPreparation = preparationRank(requestedPreparation, second.preparation);
    if (firstPreparation !== secondPreparation) return firstPreparation - secondPreparation;

    const firstUsability = usabilityRank(first);
    const secondUsability = usabilityRank(second);
    if (firstUsability !== secondUsability) return firstUsability - secondUsability;

    const firstSource = sourceRank(first.dataType);
    const secondSource = sourceRank(second.dataType);
    if (firstSource !== secondSource) return firstSource - secondSource;

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

function macroPercentageDifferences(first: FoodResult, second: FoodResult): DedupNearMiss['differences'] | null {
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

function hasSameProviderIdentity(first: FoodResult, second: FoodResult): boolean {
  if (!first.sourceFoodId || !second.sourceFoodId) return false;
  if (first.source === second.source && first.sourceFoodId === second.sourceFoodId) return true;
  return first.alternateSourceIds.some((item) => item.source === second.source && item.id === second.sourceFoodId)
    || second.alternateSourceIds.some((item) => item.source === first.source && item.id === first.sourceFoodId);
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
  const queryAliases = expandFoodAliases(query);
  const matchClasses = new Map(items.map((item) => [item.id, matchClass(query, item, mode, queryAliases)]));
  const identityGroups: FoodResult[] = [];
  const priority = (item: FoodResult) => item.history ? 0 : item.isCommonFood ? 1 : 2;
  // Select the canonical provider record before filtering or ranking by query text.
  for (const item of items) {
    const index = identityGroups.findIndex((existing) => hasSameProviderIdentity(existing, item));
    if (index < 0) {
      identityGroups.push({ ...item, alternateSourceIds: [...item.alternateSourceIds] });
      continue;
    }
    const existing = identityGroups[index];
    const survivor = priority(item) < priority(existing)
      ? { ...item, alternateSourceIds: [...item.alternateSourceIds] } : existing;
    const duplicate = survivor === existing ? item : existing;
    appendAlternates(survivor, duplicate);
    // Preserve searchable curated aliases when history takes over a common food.
    if (duplicate.aliases?.length) survivor.aliases = [...new Set([...(survivor.aliases ?? []), ...duplicate.aliases])];
    matchClasses.set(survivor.id, Math.max(matchClasses.get(existing.id) ?? 0, matchClasses.get(item.id) ?? 0));
    identityGroups[index] = survivor;
  }
  const comparator = makeComparator(identityGroups, query, matchClasses);
  const ranked = identityGroups.filter((item) => (matchClasses.get(item.id) ?? 0) > 0).sort(comparator);
  const canonical: FoodResult[] = [];
  const nearMisses: DedupNearMiss[] = [];

  for (const item of ranked) {
    const key = dedupKey(item);
    const candidates = canonical.filter((existing) => hasSameProviderIdentity(existing, item) || dedupKey(existing) === key);
    let merged = false;
    for (const existing of candidates) {
      if (hasSameProviderIdentity(existing, item)) {
        appendAlternates(existing, item);
        merged = true;
        break;
      }
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
  // Keep distinct nutrition variants, but prevent identical-looking rows from filling the list.
  const visibleCounts = new Map<string, number>();
  const visible = canonical.filter((item) => {
    const key = `${normalizeFoodText(item.normalizedName)}|${item.preparation ?? ''}`;
    const count = visibleCounts.get(key) ?? 0;
    visibleCounts.set(key, count + 1);
    return count < 3 || item.history != null;
  });
  return { items: visible.slice(0, 25), nearMisses };
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function buildFoodPortions(
  candidates: Array<{ id: string; label: string; grams: number | null | undefined }>,
): FoodResult['portions'] {
  const portions: FoodResult['portions'] = [];
  for (const candidate of candidates) {
    if (candidate.grams == null || !Number.isFinite(candidate.grams) || candidate.grams <= 0) continue;
    const label = candidate.label.trim() || `${candidate.grams} g`;
    const normalizedLabel = label.toLowerCase().replace(/\s+/g, ' ');
    if (portions.some((portion) =>
      Math.abs(portion.grams - candidate.grams!) < 0.01
      && portion.label.toLowerCase().replace(/\s+/g, ' ') === normalizedLabel
    )) continue;
    const baseId = candidate.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || `portion-${portions.length}`;
    const id = portions.some((portion) => portion.id === baseId) ? `${baseId}-${portions.length}` : baseId;
    portions.push({ id, label, grams: candidate.grams });
  }
  return portions;
}

export async function loadUSDAFoodDetails(
  food: FoodResult,
  loadUSDAFood: ((fdcId: string, signal?: AbortSignal) => Promise<FoodResult | null>) | undefined,
  signal?: AbortSignal,
): Promise<FoodResult> {
  // Common foods already carry curated names and servings, and must open offline.
  if (food.isCommonFood || food.source !== 'usda' || food.history || !loadUSDAFood) return food;
  const detail = await loadUSDAFood(food.sourceFoodId, signal);
  return detail ? { ...food, ...detail, id: food.id, providerOrder: food.providerOrder } : food;
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

function portionsFromUSDA(food: Record<string, any>): FoodResult['portions'] {
  const portions = Array.isArray(food.foodPortions) ? food.foodPortions : [];
  const candidates = portions.map((rawPortion, index) => {
    const gramWeight = finiteNonNegative(rawPortion?.gramWeight);
    return {
      id: `usda-${rawPortion?.id ?? index}`,
      grams: gramWeight,
      label: rawPortion?.portionDescription?.trim()
        || rawPortion?.modifier?.trim()
        || (gramWeight ? `${gramWeight} g` : ''),
    };
  });
  const servingSize = finiteNonNegative(food.servingSize);
  if (servingSize != null && servingSize > 0) {
    candidates.push({
      id: 'usda-serving',
      grams: servingSize,
      label: [food.householdServingFullText, `${servingSize} ${food.servingSizeUnit ?? 'g'}`]
        .find((value) => typeof value === 'string' && value.trim()) as string,
    });
  }
  return buildFoodPortions(candidates);
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
    const portions = portionsFromUSDA(food);
    const defaultServing = portions[0] ?? null;
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
      portions,
      defaultAmount: defaultServing
        ? { kind: 'serving', grams: defaultServing.grams, servingId: defaultServing.id }
        : { kind: 'reference', grams: 100, servingId: null },
      alternateSourceIds: [],
    }];
  });
}

function mergeUSDAFoodPortions(items: FoodResult[], details: unknown): FoodResult[] {
  if (!Array.isArray(details)) return items;
  const portions = new Map<string, FoodResult['portions']>();
  for (const rawDetail of details) {
    if (!rawDetail || typeof rawDetail !== 'object') continue;
    const detail = rawDetail as Record<string, any>;
    if (detail.fdcId == null) continue;
    portions.set(String(detail.fdcId), portionsFromUSDA(detail));
  }
  return items.map((item) => {
    const foodPortions = portions.get(item.sourceFoodId);
    if (!foodPortions?.length) return item;
    const defaultServing = foodPortions[0];
    return {
      ...item,
      portions: foodPortions,
      defaultAmount: { kind: 'serving', grams: defaultServing.grams, servingId: defaultServing.id },
    };
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
    const portions = buildFoodPortions([{
      id: 'off-serving',
      grams: servingSize,
      label: typeof product.serving_size === 'string' && product.serving_size.trim()
        ? product.serving_size.trim()
        : servingSize ? `${servingSize} g` : '',
    }]);
    const defaultServing = portions[0] ?? null;
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
      portions,
      defaultAmount: defaultServing
        ? { kind: 'serving', grams: defaultServing.grams, servingId: defaultServing.id }
        : { kind: 'reference', grams: 100, servingId: null },
      alternateSourceIds: [],
    }];
  });
}

export interface FoodHistoryRecord {
  id: number;
  name: string;
  source: string;
  source_food_id: string | null;
  brand: string | null;
  data_type: string | null;
  preparation: string | null;
  grams_logged: number | null;
  serving_size_g: number | null;
  serving_label: string | null;
  calories_per_100g: number | null;
  protein_g_per_100g: number | null;
  carbs_g_per_100g: number | null;
  fat_g_per_100g: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged_at: string;
  parent_meal_name: string | null;
  parent_photo_uri: string | null;
  legacy_food_key: string;
}

export interface ReusableFoodLog {
  name: string;
  source: string;
  source_food_id: string | null;
  data_type: string | null;
  brand: string | null;
  preparation: string | null;
  grams_logged: number | null;
  serving_size_g: number | null;
  serving_label: string | null;
  calories_per_100g: number | null;
  protein_g_per_100g: number | null;
  carbs_g_per_100g: number | null;
  fat_g_per_100g: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface PreparedHistoryRecord {
  row: FoodHistoryRecord;
  normalizedName: string;
  preparation: string | null;
  macros: Pick<FoodResult, 'caloriesPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'>;
}

function historyMacros(row: FoodHistoryRecord): PreparedHistoryRecord['macros'] | null {
  const stored = [
    row.calories_per_100g,
    row.protein_g_per_100g,
    row.carbs_g_per_100g,
    row.fat_g_per_100g,
  ];
  if (stored.every((value) => value != null && Number.isFinite(value) && value >= 0)) {
    return {
      caloriesPer100g: stored[0],
      proteinPer100g: stored[1],
      carbsPer100g: stored[2],
      fatPer100g: stored[3],
    } as PreparedHistoryRecord['macros'];
  }
  if (row.grams_logged == null || !Number.isFinite(row.grams_logged) || row.grams_logged <= 0) return null;
  const ratio = 100 / row.grams_logged;
  const absolute = [row.calories, row.protein_g, row.carbs_g, row.fat_g];
  if (!absolute.every((value) => Number.isFinite(value) && value >= 0)) return null;
  return {
    caloriesPer100g: absolute[0] * ratio,
    proteinPer100g: absolute[1] * ratio,
    carbsPer100g: absolute[2] * ratio,
    fatPer100g: absolute[3] * ratio,
  };
}

export function historyPinKey(name: string, brand: string | null, preparation: string | null): string {
  return `history:${normalizeFoodText(name)}|${normalizeFoodText(brand ?? '')}|${normalizeFoodText(preparation ?? '')}`;
}

function historyProviderKey(row: FoodHistoryRecord): string | null {
  const providerId = row.source_food_id?.trim();
  return providerId ? `${row.source}:${providerId}` : null;
}

function historySource(value: string): FoodResult['source'] {
  return value === 'usda' || value === 'off' || value === 'scan' || value === 'describe' || value === 'manual'
    ? value
    : 'manual';
}

function historyDataType(row: Pick<FoodHistoryRecord, 'data_type' | 'source'>): DataType {
  const value = row.data_type;
  if (value === 'Survey (FNDDS)' || value === 'Foundation' || value === 'SR Legacy' || value === 'Branded'
    || value === 'off' || value === 'manual' || value === 'scan' || value === 'describe') return value;
  if (row.source === 'usda') return 'Branded';
  if (row.source === 'off') return 'off';
  if (row.source === 'scan') return 'scan';
  if (row.source === 'describe') return 'describe';
  return 'manual';
}

export function foodResultFromLog(log: ReusableFoodLog, id: string): FoodResult {
  const grams = log.grams_logged && log.grams_logged > 0 ? log.grams_logged : 100;
  const ratio = 100 / grams;
  const servingLabel = log.serving_label?.trim();
  const portions = buildFoodPortions(
    log.serving_size_g
      && log.serving_size_g > 0
      && servingLabel
      && servingLabel.toLowerCase() !== 'last logged'
      && servingLabel.toLowerCase() !== 'reviewed amount'
      ? [{ id: 'history-serving', label: servingLabel, grams: log.serving_size_g }]
      : [],
  );
  const serving = portions[0] ?? null;
  return {
    id,
    name: log.name,
    source: historySource(log.source),
    sourceFoodId: log.source_food_id ?? '',
    dataType: historyDataType(log),
    brand: log.brand,
    preparation: log.preparation,
    normalizedName: log.name.toLowerCase(),
    caloriesPer100g: log.calories_per_100g ?? log.calories * ratio,
    proteinPer100g: log.protein_g_per_100g ?? log.protein_g * ratio,
    carbsPer100g: log.carbs_g_per_100g ?? log.carbs_g * ratio,
    fatPer100g: log.fat_g_per_100g ?? log.fat_g * ratio,
    portions,
    defaultAmount: { kind: 'last-logged', grams, servingId: serving?.id ?? null },
    alternateSourceIds: [],
  };
}

function historyNameKey(record: PreparedHistoryRecord): string {
  return [
    record.normalizedName,
    normalizeFoodText(record.row.brand ?? ''),
    normalizeFoodText(record.preparation ?? ''),
  ].join('|');
}

function isEstimatedHistory(row: FoodHistoryRecord): boolean {
  return row.source === 'scan' || row.source === 'describe';
}

function estimatedHistoryName(name: string): string {
  // Amounts identify a past portion, not a different food. Keep nutrition qualifiers
  // such as "2% milk" and preparation words in the matching key.
  const amount = String.raw`\d+(?:[./]\d+)?(?:\s+\d+/\d+)?\s*(?:g|grams?|kg|ml|cups?|servings?|pieces?|slices?|bowls?|tbsp|tsp|oz)\b`;
  return name
    .replace(new RegExp(`^\\s*${amount}\\s+(?:of\\s+)?`, 'i'), '')
    .replace(new RegExp(`\\s*[,(-]?\\s*${amount}\\s*\\)?\\s*$`, 'i'), '')
    .trim();
}

function newestFirst(first: PreparedHistoryRecord, second: PreparedHistoryRecord): number {
  return second.row.logged_at.localeCompare(first.row.logged_at) || second.row.id - first.row.id;
}
export function buildPersonalFoodResults(
  rows: FoodHistoryRecord[],
  pinnedKeys: Iterable<string>,
): FoodResult[] {
  const pinned = new Set(pinnedKeys);
  const prepared = rows.flatMap((row): PreparedHistoryRecord[] => {
    const macros = historyMacros(row);
    if (!macros) return [];
    const normalized = normalizeFoodName(isEstimatedHistory(row) ? estimatedHistoryName(row.name) : row.name, row.brand);
    if (!normalized.normalizedName) return [];
    return [{
      row,
      normalizedName: normalized.normalizedName,
      preparation: row.preparation ?? normalized.preparation,
      macros,
    }];
  }).sort(newestFirst);

  const groups = new Map<string, PreparedHistoryRecord[]>();
  for (const record of prepared) {
    const providerKey = historyProviderKey(record.row);
    const groupKey = isEstimatedHistory(record.row)
      ? `estimate:${historyNameKey(record)}`
      : providerKey ? `provider:${providerKey}` : `name:${historyNameKey(record)}`;
    const group = groups.get(groupKey) ?? [];
    group.push(record);
    groups.set(groupKey, group);
  }

  const clusters: PreparedHistoryRecord[][] = [];
  for (const [groupKey, records] of groups) {
    if (groupKey.startsWith('provider:') || groupKey.startsWith('estimate:')) {
      clusters.push(records);
      continue;
    }
    const groupClusters: PreparedHistoryRecord[][] = [];
    for (const record of records) {
      const cluster = groupClusters.find((candidate) => {
        if (historyNameKey(candidate[0]) !== historyNameKey(record)) return false;
        const differences = macroPercentageDifferences(
          { ...candidate[0].macros } as FoodResult,
          { ...record.macros } as FoodResult,
        );
        return differences != null && Math.max(...Object.values(differences)) <= 0.2;
      });
      if (cluster) cluster.push(record);
      else groupClusters.push([record]);
    }
    clusters.push(...groupClusters);
  }

  return clusters.map((cluster) => {
    cluster.sort(newestFirst);
    const representative = cluster[0];
    const row = representative.row;
    const pinKey = historyPinKey(representative.normalizedName, row.brand, representative.preparation);
    const lastGrams = row.grams_logged && row.grams_logged > 0
      ? row.grams_logged
      : row.serving_size_g && row.serving_size_g > 0 ? row.serving_size_g : 100;
    const servingRecord = cluster.find((record) => {
      const label = record.row.serving_label?.trim();
      return !!(
        record.row.serving_size_g
        && record.row.serving_size_g > 0
        && label
        && label.toLowerCase() !== 'last logged'
        && label.toLowerCase() !== 'reviewed amount'
      );
    });
    const portions = buildFoodPortions(servingRecord ? [{
      id: 'history-serving',
      label: servingRecord.row.serving_label!,
      grams: servingRecord.row.serving_size_g,
    }] : []);
    const serving = portions[0] ?? null;
    const legacyPinKeys = [...new Set(cluster.flatMap((record) => [
      record.row.legacy_food_key,
      historyPinKey(normalizeFoodName(record.row.name, record.row.brand).normalizedName, record.row.brand, record.preparation),
    ]))];
    const isPinned = pinned.has(pinKey) || legacyPinKeys.some((key) => pinned.has(key));
    return {
      id: `history-${row.id}`,
      name: row.name,
      source: historySource(row.source),
      sourceFoodId: row.source_food_id?.trim() ?? '',
      dataType: historyDataType(row),
      brand: row.brand,
      preparation: representative.preparation,
      normalizedName: representative.normalizedName,
      searchText: [row.name, row.brand, row.parent_meal_name].filter(Boolean).join(' '),
      ...representative.macros,
      portions,
      defaultAmount: { kind: 'last-logged', grams: lastGrams, servingId: serving?.id ?? null },
      history: {
        representativeLogId: row.id,
        lastLoggedAt: row.logged_at,
        timesLogged: cluster.length,
        lastGrams,
        pinKey,
        legacyPinKeys,
        parentMealName: row.parent_meal_name,
        parentMealPhotoUri: row.parent_photo_uri,
        calories: row.calories,
        protein: row.protein_g,
        carbs: row.carbs_g,
        fat: row.fat_g,
      },
      isPinned,
      alternateSourceIds: [],
    } satisfies FoodResult;
  });
}

export function createQuickLogInput(
  food: FoodResult,
  logDate: string,
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack',
) {
  if (!food.history) throw new Error('Quick log requires a personal history result');
  const serving = food.defaultAmount.servingId
    ? food.portions.find((candidate) => candidate.id === food.defaultAmount.servingId) ?? null
    : null;
  return {
    log_date: logDate,
    name: food.name,
    source: food.source,
    source_food_id: food.sourceFoodId || null,
    meal,
    meal_id: null,
    brand: food.brand,
    data_type: food.dataType,
    preparation: food.preparation,
    grams_logged: food.defaultAmount.grams,
    serving_size_g: serving?.grams ?? null,
    serving_label: serving?.label ?? null,
    calories_per_100g: food.caloriesPer100g,
    protein_g_per_100g: food.proteinPer100g,
    carbs_g_per_100g: food.carbsPer100g,
    fat_g_per_100g: food.fatPer100g,
    calories: food.history.calories,
    protein_g: food.history.protein,
    carbs_g: food.history.carbs,
    fat_g: food.history.fat,
  };
}
