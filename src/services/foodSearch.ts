import { USDA_API_KEY } from '../config/api';
import { searchFoodCache, CachedFood } from '../db/database';

export interface FoodResult {
  id: string;
  name: string;
  source: 'usda' | 'off' | 'scan' | 'describe' | 'manual';
  sourceFoodId: string;
  dataType: 'Foundation' | 'SR Legacy' | 'Branded' | 'off' | 'manual' | 'scan' | 'describe';
  brand: string | null;
  preparation: string | null;
  normalizedName: string;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  servingSizeGrams: number | null;
  servingLabel: string | null;
  alternateSourceIds: { source: 'usda' | 'off' | 'scan' | 'describe' | 'manual'; id: string }[];
}

export type DataType = FoodResult['dataType'];

// ── Helpers ──────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJSON(url: string, timeoutMs: number): Promise<any | null> {
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) return null;

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;

  try {
    return await res.json();
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Display name cleaning ────────────────────────────────────────────────

const NOISE_TOKENS = [
  'grade a', 'grade aa', 'grade',
  'extra large', 'large', 'medium', 'small',
  'or fryers', 'fryers', 'or', 'broilers', 'roasters', 'breeder',
  'fresh',
];

function cleanDisplayName(description: string): string {
  let result = description.toLowerCase();
  result = result.replace(/\([^)]*\)/g, ' ');
  for (const tok of NOISE_TOKENS) {
    result = result.replace(new RegExp(`\\b${escapeRegex(tok)}\\b`, 'g'), ' ');
  }
  result = result.replace(/,/g, ' ');
  result = result.replace(/\s+/g, ' ').trim();
  return result.replace(/(^|[\s-])\S/g, (m) => m.toUpperCase());
}

// ── Normalization ────────────────────────────────────────────────────────

const PREP_PATTERN = /\b(raw|cooked|grilled|baked|fried|roasted|steamed|boiled|dried|smoked|canned|frozen)\b/gi;

function normalizeFoodName(
  name: string,
  brand: string | null
): { normalizedName: string; preparation: string | null } {
  let result = name.toLowerCase();

  result = result.replace(/\([^)]*\)/g, ' ');

  if (brand) {
    const brandLower = brand.toLowerCase();
    if (result.startsWith(brandLower)) {
      result = result.slice(brandLower.length);
    }
    result = result.replace(new RegExp(`\\b${escapeRegex(brandLower)}\\b`, 'g'), ' ');
  }

  result = result.replace(/[,.]/g, ' ');
  result = result.replace(/[^a-z0-9\s]/g, ' ');

  const prepMatch = result.match(PREP_PATTERN);
  const preparation = prepMatch && prepMatch.length > 0 ? prepMatch[0].toLowerCase() : null;
  result = result.replace(PREP_PATTERN, ' ');

  for (const tok of NOISE_TOKENS) {
    result = result.replace(new RegExp(`\\b${escapeRegex(tok)}\\b`, 'g'), ' ');
  }

  result = result.replace(/\s+/g, ' ').trim();

  return { normalizedName: result, preparation };
}

function extractBrandUSDA(f: any): string | null {
  const dt: string = f.dataType;
  if (dt === 'Branded') {
    return (f.brandOwner as string) || (f.brandName as string) || null;
  }
  return null;
}

function extractBrandOFF(p: any): string | null {
  if (!p.brands || typeof p.brands !== 'string') return null;
  const first = p.brands.split(',')[0].trim();
  return first || null;
}

function dataTypeFromUSDA(f: any): DataType {
  const dt: string = f.dataType || '';
  if (dt === 'Foundation' || dt === 'SR Legacy' || dt === 'Branded') return dt;
  return 'Branded';
}

function isGeneric(dt: DataType): boolean {
  return dt === 'Foundation' || dt === 'SR Legacy' || dt === 'manual';
}

// ── Source rank ──────────────────────────────────────────────────────────

function sourceRank(dt: DataType): number {
  switch (dt) {
    case 'Foundation': return 1;
    case 'SR Legacy': return 2;
    case 'Branded': return 3;
    case 'off': return 4;
    default: return 5;
  }
}

// ── Query relevance ──────────────────────────────────────────────────────

function wordMatches(queryWord: string, nameWord: string): boolean {
  const q = queryWord.toLowerCase();
  const n = nameWord.toLowerCase();
  if (q === n) return true;
  if (q + 's' === n || q + 'es' === n) return true;
  if (n + 's' === q || n + 'es' === q) return true;
  return false;
}

function queryRelevance(query: string, normalizedName: string): number {
  const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const nWords = normalizedName.split(/\s+/);

  if (qWords.length === 0 || nWords.length === 0) return 0;

  const allMatch = qWords.every(qw =>
    nWords.some(nw => wordMatches(qw, nw))
  );

  if (!allMatch) {
    const matchCount = qWords.filter(qw =>
      nWords.some(nw => wordMatches(qw, nw))
    ).length;
    if (matchCount === 0) return 0;
    return Math.round((matchCount / qWords.length) * 30);
  }

  let firstMatchCount = 0;
  for (let i = 0; i < Math.min(qWords.length, nWords.length); i++) {
    if (qWords.some(qw => wordMatches(qw, nWords[i]))) {
      firstMatchCount++;
    } else {
      break;
    }
  }

  return firstMatchCount >= qWords.length ? 100 : 70;
}

// ── Nutrition similarity ─────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.2;

function nutritionSimilar(a: FoodResult, b: FoodResult): boolean {
  const keys = ['caloriesPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g'] as const;
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (av == null && bv == null) continue;
    if (av == null || bv == null) return false;
    if (av === 0 && bv === 0) continue;
    const maxV = Math.max(av, bv);
    const minV = Math.min(av, bv);
    if (maxV === 0) continue;
    if ((maxV - minV) / maxV > SIMILARITY_THRESHOLD) return false;
  }
  return true;
}

// ── Comparator ───────────────────────────────────────────────────────────

function makeComparator(relevanceMap: Map<string, number>) {
  return (a: FoodResult, b: FoodResult): number => {
    const ra = relevanceMap.get(a.id) ?? 0;
    const rb = relevanceMap.get(b.id) ?? 0;
    if (ra !== rb) return rb - ra;

    const sa = sourceRank(a.dataType);
    const sb = sourceRank(b.dataType);
    if (sa !== sb) return sa - sb;

    const aRaw = a.preparation === 'raw' ? 1 : 0;
    const bRaw = b.preparation === 'raw' ? 1 : 0;
    if (aRaw !== bRaw) return bRaw - aRaw;

    const aComplete = (
      a.caloriesPer100g != null && a.caloriesPer100g > 0 &&
      a.proteinPer100g != null && a.proteinPer100g > 0 &&
      a.carbsPer100g != null && a.carbsPer100g > 0 &&
      a.fatPer100g != null && a.fatPer100g > 0
    ) ? 1 : 0;
    const bComplete = (
      b.caloriesPer100g != null && b.caloriesPer100g > 0 &&
      b.proteinPer100g != null && b.proteinPer100g > 0 &&
      b.carbsPer100g != null && b.carbsPer100g > 0 &&
      b.fatPer100g != null && b.fatPer100g > 0
    ) ? 1 : 0;
    if (aComplete !== bComplete) return bComplete - aComplete;

    if (a.caloriesPer100g != null && b.caloriesPer100g != null && a.caloriesPer100g !== b.caloriesPer100g) {
      return a.caloriesPer100g - b.caloriesPer100g;
    }

    return a.sourceFoodId.localeCompare(b.sourceFoodId);
  };
}

// ── Dedup key ────────────────────────────────────────────────────────────

function dedupKey(item: FoodResult): string {
  const name = item.normalizedName;
  const prep = item.preparation ?? '';

  if (isGeneric(item.dataType)) {
    return `usda-gen|${name}||${prep}`;
  }
  if (item.dataType === 'off') {
    return `off|${name}|${item.brand ?? ''}|${prep}`;
  }
  return `usda-bra|${name}|${item.brand ?? ''}|${prep}`;
}

// ── Deduplication ────────────────────────────────────────────────────────

function deduplicateAndRank(items: FoodResult[], query: string): FoodResult[] {
  const relevanceMap = new Map<string, number>();
  for (const item of items) {
    relevanceMap.set(item.id, queryRelevance(query, item.normalizedName));
  }

  const cmp = makeComparator(relevanceMap);

  const groups = new Map<string, FoodResult[]>();
  for (const item of items) {
    const key = dedupKey(item);
    const arr = groups.get(key);
    if (arr) {
      arr.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const result: FoodResult[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    group.sort(cmp);

    const allSimilar = group.every((item, _, arr) =>
      arr.every((other) => other === item || nutritionSimilar(item, other))
    );

    if (allSimilar) {
      const canonical = { ...group[0], alternateSourceIds: [...group[0].alternateSourceIds] };
      for (let i = 1; i < group.length; i++) {
        canonical.alternateSourceIds.push({
          source: group[i].source,
          id: group[i].sourceFoodId,
        });
      }
      result.push(canonical);
    } else {
      for (const item of group) {
        result.push(item);
      }
    }
  }

  const filtered = result.filter(item => (relevanceMap.get(item.id) ?? 0) > 0);
  filtered.sort(cmp);
  return filtered.slice(0, 25);
}

// ── USDA FoodData Central ────────────────────────────────────────────────

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

async function searchUSDAGeneric(query: string): Promise<FoodResult[]> {
  if (!USDA_API_KEY) return [];

  try {
    const body = await fetchJSON(
      `${USDA_BASE}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=20&dataType=Foundation,SR%20Legacy`,
      8000
    );
    if (!body || !body.foods || !Array.isArray(body.foods)) return [];

    const results = parseUSDAFoods(body.foods);

    const top5 = results.slice(0, 5);
    const details = await Promise.allSettled(
      top5.map(r => getUSDAFoodDetail(Number(r.sourceFoodId)))
    );
    for (let i = 0; i < top5.length; i++) {
      const detail = details[i];
      if (detail.status === 'fulfilled' && detail.value) {
        top5[i].servingSizeGrams = detail.value.servingSizeGrams;
        top5[i].servingLabel = detail.value.servingLabel;
      }
    }

    return results;
  } catch {
    return [];
  }
}

async function searchUSDABranded(query: string): Promise<FoodResult[]> {
  if (!USDA_API_KEY) return [];

  try {
    const body = await fetchJSON(
      `${USDA_BASE}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=8&dataType=Branded`,
      8000
    );
    if (!body || !body.foods || !Array.isArray(body.foods)) return [];

    return parseUSDAFoods(body.foods);
  } catch {
    return [];
  }
}

function parseUSDAFoods(foods: any[]): FoodResult[] {
  return foods
    .map((f: any): FoodResult | null => {
      const nutrients = parseUSDANutrients(f.foodNutrients);
      if (!nutrients) return null;

      const rawName = f.description || 'Unknown';
      const dataType = dataTypeFromUSDA(f);
      const brand = extractBrandUSDA(f);
      const { normalizedName, preparation } = normalizeFoodName(rawName, brand);

      let servingSizeGrams: number | null = null;
      let servingLabel: string | null = null;
      if (f.foodPortions && f.foodPortions.length > 0) {
        const p = f.foodPortions[0];
        const gw = parseFloat(p.gramWeight);
        if (!isNaN(gw) && gw > 0) {
          servingSizeGrams = gw;
          servingLabel = p.modifier || `${gw}g`;
        }
      }
      if (!servingSizeGrams && f.servingSize && f.servingSize > 0) {
        servingSizeGrams = f.servingSize;
        servingLabel = `${f.servingSize}g`;
      }

      return {
        id: `usda-${f.fdcId}`,
        name: cleanDisplayName(rawName),
        source: 'usda',
        sourceFoodId: String(f.fdcId),
        dataType,
        brand,
        preparation,
        normalizedName,
        ...nutrients,
        servingSizeGrams,
        servingLabel,
        alternateSourceIds: [],
      };
    })
    .filter((r: FoodResult | null): r is FoodResult => r !== null);
}

const USDA_NUTRIENT_IDS: Record<string, number> = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
};

function parseUSDANutrients(nutrients: any[]): {
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
} | null {
  if (!nutrients || !Array.isArray(nutrients)) return null;

  const map: Record<string, number> = {};
  for (const n of nutrients) {
    for (const [key, id] of Object.entries(USDA_NUTRIENT_IDS)) {
      if (n.nutrientId === id || n.nutrient_id === id) {
        map[key] = n.value ?? n.amount ?? 0;
      }
    }
  }

  const result = {
    caloriesPer100g: 'calories' in map ? map.calories : null,
    proteinPer100g: 'protein' in map ? map.protein : null,
    carbsPer100g: 'carbs' in map ? map.carbs : null,
    fatPer100g: 'fat' in map ? map.fat : null,
  };

  if (result.caloriesPer100g == null || result.proteinPer100g == null || result.carbsPer100g == null || result.fatPer100g == null) {
    return null;
  }
  return result;
}

async function getUSDAFoodDetail(fdcId: number): Promise<{ servingSizeGrams: number; servingLabel: string } | null> {
  if (!USDA_API_KEY) return null;

  try {
    const res = await fetchJSON(
      `${USDA_BASE}/food/${fdcId}?api_key=${USDA_API_KEY}`,
      5000
    );
    if (!res || !res.foodPortions || !Array.isArray(res.foodPortions) || res.foodPortions.length === 0) {
      return null;
    }

    const p = res.foodPortions[0];
    const gw = parseFloat(p.gramWeight);
    if (isNaN(gw) || gw <= 0) return null;

    return {
      servingSizeGrams: gw,
      servingLabel: p.modifier || `${gw}g`,
    };
  } catch {
    return null;
  }
}

// ── Open Food Facts ───────────────────────────────────────────────────────

const OFF_BASE = 'https://world.openfoodfacts.org';

async function searchOFF(query: string): Promise<FoodResult[]> {
  try {
    const body = await fetchJSON(
      `${OFF_BASE}/api/v2/search?search_terms=${encodeURIComponent(query)}&page_size=15&fields=product_name,code,brands,nutriments,serving_quantity`,
      8000
    );
    if (!body || !body.products || !Array.isArray(body.products)) {
      return [];
    }

    return body.products
      .map((p: any): FoodResult | null => {
        const n = p.nutriments;
        if (!n) return null;

        const calRaw = n['energy-kcal_100g'];
        const kjRaw = n['energy_100g'];
        let calories: number | null = null;
        if (calRaw != null) {
          calories = parseFloat(calRaw);
          if (isNaN(calories)) calories = null;
        } else if (kjRaw != null) {
          calories = parseFloat(kjRaw) / 4.184;
          if (isNaN(calories)) calories = null;
        }

        const proteinRaw = n.proteins_100g;
        const carbsRaw = n.carbohydrates_100g;
        const fatRaw = n.fat_100g;

        let protein: number | null = null;
        if (proteinRaw != null) {
          protein = parseFloat(proteinRaw);
          if (isNaN(protein)) protein = null;
        }
        let carbs: number | null = null;
        if (carbsRaw != null) {
          carbs = parseFloat(carbsRaw);
          if (isNaN(carbs)) carbs = null;
        }
        let fat: number | null = null;
        if (fatRaw != null) {
          fat = parseFloat(fatRaw);
          if (isNaN(fat)) fat = null;
        }

        if (calories == null || protein == null || carbs == null || fat == null) return null;

        const rawName = p.product_name || 'Unknown';
        const brand = extractBrandOFF(p);
        const { normalizedName, preparation } = normalizeFoodName(rawName, brand);

        let servingSizeGrams: number | null = null;
        let servingLabel: string | null = null;
        const sq = p.serving_quantity;
        if (sq && !isNaN(parseFloat(sq)) && parseFloat(sq) > 0) {
          servingSizeGrams = parseFloat(sq);
          servingLabel = `${parseFloat(sq).toFixed(0)}g`;
        }

        return {
          id: `off-${p.code}`,
          name: cleanDisplayName(rawName),
          source: 'off',
          sourceFoodId: String(p.code),
          dataType: 'off',
          brand,
          preparation,
          normalizedName,
          caloriesPer100g: calories as number,
          proteinPer100g: protein as number,
          carbsPer100g: carbs as number,
          fatPer100g: fat as number,
          servingSizeGrams,
          servingLabel,
          alternateSourceIds: [],
        };
      })
      .filter((r: FoodResult | null): r is FoodResult => r !== null);
  } catch {
    return [];
  }
}

// ── Local Cache ──────────────────────────────────────────────────────────

async function searchLocalCache(query: string): Promise<FoodResult[]> {
  try {
    const rows = await searchFoodCache(query);
    return rows.map((row) => ({
      id: `cache-${row.id}`,
      name: row.name,
      source: row.source as 'scan' | 'describe',
      sourceFoodId: String(row.id),
      dataType: row.source as 'scan' | 'describe',
      brand: row.brand,
      preparation: row.preparation,
      normalizedName: row.normalizedName,
      caloriesPer100g: row.calories_per_100g,
      proteinPer100g: row.protein_g_per_100g,
      carbsPer100g: row.carbs_g_per_100g,
      fatPer100g: row.fat_g_per_100g,
      servingSizeGrams: row.serving_size_g,
      servingLabel: row.serving_label,
      alternateSourceIds: [],
    }));
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function searchFood(query: string): Promise<FoodResult[]> {
  const q = query.trim();
  if (!q) return [];

  const [local, generic, branded, off] = await Promise.allSettled([
    searchLocalCache(q),
    searchUSDAGeneric(q),
    searchUSDABranded(q),
    searchOFF(q),
  ]);

  const all: FoodResult[] = [
    ...(local.status === 'fulfilled' ? local.value : []),
    ...(generic.status === 'fulfilled' ? generic.value : []),
    ...(branded.status === 'fulfilled' ? branded.value : []),
    ...(off.status === 'fulfilled' ? off.value : []),
  ];

  return deduplicateAndRank(all, q);
}
