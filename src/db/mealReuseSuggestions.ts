export const MAX_MEAL_REUSE_SUGGESTIONS = 3;

export const MEAL_REUSE_SUGGESTIONS_SQL = `WITH meal_totals AS (
  SELECT m.id AS meal_id, m.name AS meal_name, m.meal_type, m.photo_uri, m.log_date,
         COUNT(f.id) AS component_count,
         SUM(f.calories) AS total_calories,
         SUM(f.protein_g) AS total_protein,
         SUM(f.carbs_g) AS total_carbs,
         SUM(f.fat_g) AS total_fat,
         MAX(f.logged_at) AS last_logged_at,
         lower(m.name) AS normalized_name,
         'meal:' || lower(m.name) AS food_key,
         ROW_NUMBER() OVER (
           PARTITION BY lower(m.name)
           ORDER BY m.log_date DESC, MAX(f.logged_at) DESC, m.id DESC
         ) AS recency_rank
  FROM meals m
  JOIN food_logs f ON f.meal_id = m.id
  GROUP BY m.id
), matched_meals AS (
  SELECT meal_totals.*,
         CASE WHEN pinned_foods.food_key IS NULL THEN 0 ELSE 1 END AS is_pinned,
         CASE
           WHEN ? = '' THEN 0
           WHEN normalized_name = ? THEN 0
           WHEN substr(normalized_name, 1, length(?)) = ? THEN 1
           ELSE 2
         END AS match_rank
  FROM meal_totals
  LEFT JOIN pinned_foods ON pinned_foods.food_key = meal_totals.food_key
  WHERE recency_rank = 1
    AND (? = '' OR instr(normalized_name, ?) > 0)
)
SELECT meal_id, meal_name, meal_type, photo_uri, log_date, component_count,
       total_calories, total_protein, total_carbs, total_fat, last_logged_at,
       food_key, is_pinned
FROM matched_meals
ORDER BY match_rank, is_pinned DESC, log_date DESC, last_logged_at DESC, meal_id DESC
LIMIT ?`;

export const HAS_REUSABLE_MEALS_SQL = `SELECT EXISTS(
  SELECT 1
  FROM meals m
  JOIN food_logs f ON f.meal_id = m.id
  LIMIT 1
) AS has_reusable_meals`;

export function buildMealReuseSuggestionQuery(query: string, limit = MAX_MEAL_REUSE_SUGGESTIONS): {
  sql: string;
  params: [string, string, string, string, string, string, number];
} {
  const normalizedQuery = query.trim().toLowerCase();
  const finiteLimit = Number.isFinite(limit) ? Math.trunc(limit) : MAX_MEAL_REUSE_SUGGESTIONS;
  const boundedLimit = Math.max(0, Math.min(MAX_MEAL_REUSE_SUGGESTIONS, finiteLimit));
  return {
    sql: MEAL_REUSE_SUGGESTIONS_SQL,
    params: [
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      boundedLimit,
    ],
  };
}
