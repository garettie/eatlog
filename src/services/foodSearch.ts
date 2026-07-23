import { USDA_API_KEY } from '../config/api';

export interface FoodResult {
  id: string;
  name: string;
  source: 'usda' | 'off';
  sourceFoodId: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSizeGrams: number | null;
  servingLabel: string | null;
}

interface SearchResult {
  usda: FoodResult[];
  off: FoodResult[];
}

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

// ── USDA FoodData Central ────────────────────────────────────────────────

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

async function searchUSDA(query: string): Promise<FoodResult[]> {
  if (!USDA_API_KEY) return [];

  try {
    const body = await fetchJSON(
      `${USDA_BASE}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=15&dataType=Foundation,SR%20Legacy,Branded`,
      8000
    );
    if (!body || !body.foods || !Array.isArray(body.foods)) return [];

    return body.foods
      .map((f: any): FoodResult | null => {
        const nutrients = parseUSDANutrients(f.foodNutrients);
        if (!nutrients) return null;

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
          name: f.description || 'Unknown',
          source: 'usda',
          sourceFoodId: String(f.fdcId),
          ...nutrients,
          servingSizeGrams,
          servingLabel,
        };
      })
      .filter((r: FoodResult | null): r is FoodResult => r !== null);
  } catch {
    return [];
  }
}

const USDA_NUTRIENT_IDS: Record<string, number> = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
};

function parseUSDANutrients(nutrients: any[]): {
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
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
    caloriesPer100g: map.calories ?? 0,
    proteinPer100g: map.protein ?? 0,
    carbsPer100g: map.carbs ?? 0,
    fatPer100g: map.fat ?? 0,
  };

  if (!result.caloriesPer100g && !result.proteinPer100g && !result.carbsPer100g && !result.fatPer100g) {
    return null;
  }
  return result;
}

// ── Open Food Facts ───────────────────────────────────────────────────────

const OFF_BASE = 'https://world.openfoodfacts.org';

async function searchOFF(query: string): Promise<FoodResult[]> {
  try {
    const body = await fetchJSON(
      `${OFF_BASE}/api/v2/search?search_terms=${encodeURIComponent(query)}&page_size=15&fields=product_name,code,nutriments,serving_quantity`,
      8000
    );
    if (!body || !body.products || !Array.isArray(body.products)) {
      return [];
    }

    return body.products
      .map((p: any): FoodResult | null => {
        const n = p.nutriments;
        if (!n) return null;

        const calories = parseFloat(n['energy-kcal_100g']) || parseFloat(n['energy_100g']) / 4.184 || 0;
        const protein = parseFloat(n.proteins_100g) || 0;
        const carbs = parseFloat(n.carbohydrates_100g) || 0;
        const fat = parseFloat(n.fat_100g) || 0;

        if (!calories && !protein && !carbs && !fat) return null;

        let servingSizeGrams: number | null = null;
        let servingLabel: string | null = null;
        const sq = p.serving_quantity;
        if (sq && !isNaN(parseFloat(sq)) && parseFloat(sq) > 0) {
          servingSizeGrams = parseFloat(sq);
          servingLabel = `${parseFloat(sq).toFixed(0)}g`;
        }
        if (!servingSizeGrams && p.product_name) {
          const match = p.product_name.match(/\((\d+)\s*g\)/i);
          if (match) {
            servingSizeGrams = parseInt(match[1]);
            servingLabel = `${match[1]}g`;
          }
        }

        return {
          id: `off-${p.code}`,
          name: p.product_name || 'Unknown',
          source: 'off',
          sourceFoodId: String(p.code),
          caloriesPer100g: calories,
          proteinPer100g: protein,
          carbsPer100g: carbs,
          fatPer100g: fat,
          servingSizeGrams,
          servingLabel,
        };
      })
      .filter((r: FoodResult | null): r is FoodResult => r !== null);
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function searchFood(query: string): Promise<SearchResult> {
  if (!query.trim()) return { usda: [], off: [] };

  const [usda, off] = await Promise.allSettled([
    searchUSDA(query.trim()),
    searchOFF(query.trim()),
  ]);

  return {
    usda: usda.status === 'fulfilled' ? usda.value : [],
    off: off.status === 'fulfilled' ? off.value : [],
  };
}
