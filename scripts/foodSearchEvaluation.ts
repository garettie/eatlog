import { normalizeFoodText } from '../src/services/foodSearchCore';
import type { FoodResult, FoodSearchMode, FoodSearchOutcome } from '../src/services/foodSearchTypes';

export interface EvaluationRow {
  query: string;
  mode: FoodSearchMode;
  kind: FoodSearchOutcome['kind'];
  failures: string[];
  top: { name: string; brand: string | null; dataType: string; serving: string }[];
}

export interface EvaluationCase {
  query: string;
  mode: FoodSearchMode;
  accept: RegExp[];
}

// Anchored against displayed names. Include USDA's wording and our curated names.
const common: [string, RegExp][] = [
  ['rice', /^(white rice( cooked)?|rice white cooked( nfs)?|rice cooked)$/],
  ['white rice', /^(white rice( cooked)?|rice white cooked( nfs)?)$/],
  ['brown rice', /^(brown rice( cooked)?|rice brown cooked( nfs)?)$/],
  ['bread', /^(bread|white bread|bread white commercially prepared)$/],
  ['pasta', /^(pasta( cooked)?|pasta cooked nfs|spaghetti( cooked)?)$/],
  ['oatmeal', /^(oatmeal( cooked| nfs)?|oats cooked)$/],
  ['egg', /^(egg|egg raw|egg whole raw fresh)$/],
  ['chicken breast', /^(chicken breast( cooked| roasted| raw)?|chicken breast skinless boneless cooked)$/],
  ['fried chicken', /^(fried chicken( breast)?|chicken breast breaded fried)$/],
  ['ground beef', /^(ground beef( cooked| raw)?|ground beef 85 15( cooked| raw)?|beef ground 85 lean meat 15 fat raw)$/],
  ['pork chop', /^(pork chop( cooked| grilled| raw)?)$/],
  ['tuna', /^(tuna( canned in water| canned| raw)?|canned tuna)$/],
  ['tofu', /^(tofu( firm| raw)?|firm tofu)$/],
  ['banana', /^banana( raw)?$/],
  ['apple', /^(apple( raw)?|apples raw with skin)$/],
  ['potato', /^(potato( raw| boiled)?|potatoes flesh and skin raw)$/],
  ['tomato', /^(tomato( raw)?|tomatoes red ripe raw year round average)$/],
  ['broccoli', /^broccoli( raw)?$/],
  ['avocado', /^(avocado( raw)?|avocados raw all commercial varieties)$/],
  ['milk', /^(milk( whole| 2| reduced fat)?|whole milk|milk whole 3 25 milkfat with added vitamin d)$/],
  ['cheddar cheese', /^(cheddar cheese|cheese cheddar)$/],
  ['yogurt', /^(yogurt( plain| plain whole milk)?|plain yogurt)$/],
  ['butter', /^(butter( salted| unsalted)?|salted butter)$/],
  ['peanut butter', /^(peanut butter( smooth| creamy)?)$/],
  ['hamburger', /^(hamburger( nfs)?|hamburger on bun)$/],
  ['pizza', /^(cheese pizza|pizza cheese|pizza no cheese thick crust|pizza hut 12 cheese pizza pan crust)$/],
  ['pancakes', /^(pancakes?( plain)?|plain pancakes)$/],
  ['sandwich', /^(sandwich( nfs)?|ham and cheese sandwich)$/],
  ['fried rice', /^(fried rice|rice fried (meatless|nfs))$/],
  ['chicken soup', /^(chicken soup|soup chicken( noodle| canned)?)$/],
  ['coffee', /^(coffee( brewed| black)?|black coffee)$/],
  ['orange juice', /^(orange juice( 100 nfs| 100 frozen reconstituted)?)$/],
  ['soda', /^(soda|cola|soft drink cola)$/],
  ['potato chips', /^potato chips( nfs| plain| unsalted)?$/],
  ['granola bar', /^(granola bar|cereal or granola bar( nfs)?)$/],
  ['raw chicken breast', /^(raw chicken breast|chicken breast raw)$/],
  ['grilled chicken breast', /^(grilled chicken breast|chicken breast grilled)$/],
  ['boiled egg', /^(boiled egg|egg whole (boiled or poached|cooked hard boiled))$/],
  ['scrambled egg', /^(scrambled eggs?|egg omelet or scrambled egg (made with (butter|margarine|oil)|no added fat|ns as to fat))$/],
  ['poached egg', /^(poached egg|egg whole (boiled or poached|cooked poached))$/],
  ['toasted bread', /^(toasted (white )?bread|bread (rye|white) toasted)$/],
  ['baked potato', /^(baked potato|potato baked (nfs|peel eaten|peel not eaten))$/],
  ['canned tuna', /^(canned tuna|tuna canned( in water)?)$/],
  ['frozen broccoli', /^(frozen broccoli|broccoli frozen( cooked (with oil|with butter or margarine|no added fat)| chopped unprepared)?)$/],
  ['steamed rice', /^(steamed rice|white rice cooked|rice white steamed chinese restaurant)$/],
];

export const evaluationCases: EvaluationCase[] = [
  ...common.map(([query, accept]) => ({ query, mode: 'common' as const, accept: [accept] })),
  { query: 'Coca Cola', mode: 'full', accept: [/^coca cola( classic| original taste| cola)?$/] },
  { query: 'Oreo cookies', mode: 'full', accept: [/^oreo cookies( original)?$/] },
  { query: 'Nutella hazelnut spread', mode: 'full', accept: [/^nutella hazelnut spread( with cocoa)?$/] },
  { query: 'Cheerios cereal', mode: 'full', accept: [/^cheerios cereal( original)?$/] },
  { query: 'Jif peanut butter', mode: 'full', accept: [/^jif (creamy )?peanut butter( creamy)?$/] },
];

export function evaluationRow(query: string, mode: FoodSearchMode, outcome: FoodSearchOutcome, failures: string[]): EvaluationRow {
  return {
    query, mode, kind: outcome.kind, failures: [...failures],
    top: outcome.items.slice(0, 10).map((item) => ({
      name: item.name, brand: item.brand, dataType: item.dataType,
      serving: item.defaultAmount.kind === 'serving'
        ? item.portions.find((portion) => portion.id === item.defaultAmount.servingId)?.label ?? `${item.defaultAmount.grams} g (reference)`
        : `${item.defaultAmount.grams} g (reference)`,
    })),
  };
}

export function scoreRow(row: EvaluationRow) {
  const evaluation = evaluationCases.find((item) => normalizeFoodText(item.query) === normalizeFoodText(row.query));
  if (!evaluation) throw new Error(`Unknown evaluation query: ${row.query}`);
  const failed = row.kind === 'unavailable' || row.failures.some((failure) => failure.startsWith('usda:'));
  const accepted = (item: EvaluationRow['top'][number]) => evaluation.accept.some((pattern) => pattern.test(normalizeFoodText(item.name)));
  const topOne = !failed && row.top.length > 0 && accepted(row.top[0]);
  return {
    failed,
    topOne,
    topThree: !failed && row.top.slice(0, 3).some(accepted),
    topOneWithServing: topOne && !row.top[0].serving.endsWith('(reference)'),
  };
}

export function duplicateLimitMet(items: FoodResult[]): boolean {
  const counts = new Map<string, number>();
  for (const item of items.slice(0, 10)) {
    const key = `${normalizeFoodText(item.normalizedName)}|${item.preparation ?? ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values()) <= 3;
}

export function summarizeEvaluation(rows: EvaluationRow[], duplicatePasses: number) {
  const commonRows = rows.filter((row) => row.mode === 'common');
  const brandedRows = rows.filter((row) => row.mode === 'full');
  const count = (key: 'topOne' | 'topThree' | 'topOneWithServing') => commonRows.filter((row) => scoreRow(row)[key]).length;
  const topOne = count('topOne');
  const topThree = count('topThree');
  const serving = count('topOneWithServing');
  const brands = brandedRows.filter((row) => scoreRow(row).topThree).length;
  const failures = rows.filter((row) => row.kind === 'unavailable' || row.failures.length > 0).length;
  const rate = (value: number, total: number) => total === 0 ? 1 : value / total;
  return {
    common: commonRows.length, branded: brandedRows.length, topOne, topThree, serving, brands, failures, duplicatePasses,
    passed: rows.length > 0 && rate(topOne, commonRows.length) >= 0.9
      && rate(topThree, commonRows.length) >= 0.95 && rate(serving, commonRows.length) >= 0.8
      && brands === brandedRows.length && failures === 0 && duplicatePasses === rows.length,
  };
}
