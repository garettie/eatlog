import { existsSync, readFileSync } from 'node:fs';

import { normalizeFoodText } from '../src/services/foodSearchCore';
import { FoodSearchEngine } from '../src/services/foodSearchEngine';
import { createFoodSearchRemoteProviders } from '../src/services/foodSearchRemote';
import type { DedupNearMiss, FoodResult, FoodSearchMode } from '../src/services/foodSearchTypes';

interface EvaluationCase {
  query: string;
  mode: FoodSearchMode;
  expected: string[];
  brand?: string;
}

const cases: EvaluationCase[] = [
  { query: 'rice', mode: 'common', expected: ['rice'] },
  { query: 'white rice', mode: 'common', expected: ['white rice'] },
  { query: 'brown rice', mode: 'common', expected: ['brown rice'] },
  { query: 'bread', mode: 'common', expected: ['bread'] },
  { query: 'pasta', mode: 'common', expected: ['pasta'] },
  { query: 'oatmeal', mode: 'common', expected: ['oatmeal', 'oats'] },
  { query: 'egg', mode: 'common', expected: ['egg'] },
  { query: 'chicken breast', mode: 'common', expected: ['chicken breast'] },
  { query: 'fried chicken', mode: 'common', expected: ['fried chicken', 'chicken fried'] },
  { query: 'ground beef', mode: 'common', expected: ['ground beef', 'beef ground'] },
  { query: 'pork chop', mode: 'common', expected: ['pork chop'] },
  { query: 'tuna', mode: 'common', expected: ['tuna'] },
  { query: 'tofu', mode: 'common', expected: ['tofu'] },
  { query: 'banana', mode: 'common', expected: ['banana'] },
  { query: 'apple', mode: 'common', expected: ['apple'] },
  { query: 'potato', mode: 'common', expected: ['potato'] },
  { query: 'tomato', mode: 'common', expected: ['tomato'] },
  { query: 'broccoli', mode: 'common', expected: ['broccoli'] },
  { query: 'avocado', mode: 'common', expected: ['avocado'] },
  { query: 'milk', mode: 'common', expected: ['milk'] },
  { query: 'cheddar cheese', mode: 'common', expected: ['cheddar cheese', 'cheese cheddar'] },
  { query: 'yogurt', mode: 'common', expected: ['yogurt'] },
  { query: 'butter', mode: 'common', expected: ['butter'] },
  { query: 'peanut butter', mode: 'common', expected: ['peanut butter'] },
  { query: 'hamburger', mode: 'common', expected: ['hamburger', 'burger'] },
  { query: 'pizza', mode: 'common', expected: ['pizza'] },
  { query: 'pancakes', mode: 'common', expected: ['pancake'] },
  { query: 'sandwich', mode: 'common', expected: ['sandwich'] },
  { query: 'fried rice', mode: 'common', expected: ['fried rice', 'rice fried'] },
  { query: 'chicken soup', mode: 'common', expected: ['chicken soup', 'soup chicken'] },
  { query: 'coffee', mode: 'common', expected: ['coffee'] },
  { query: 'orange juice', mode: 'common', expected: ['orange juice'] },
  { query: 'soda', mode: 'common', expected: ['soda', 'soft drink', 'cola'] },
  { query: 'potato chips', mode: 'common', expected: ['potato chip', 'chips potato'] },
  { query: 'granola bar', mode: 'common', expected: ['granola bar'] },
  { query: 'raw chicken breast', mode: 'common', expected: ['chicken breast raw', 'raw chicken breast'] },
  { query: 'grilled chicken breast', mode: 'common', expected: ['chicken breast grilled', 'grilled chicken breast'] },
  { query: 'boiled egg', mode: 'common', expected: ['egg boiled', 'boiled egg'] },
  { query: 'scrambled egg', mode: 'common', expected: ['egg scrambled', 'scrambled egg'] },
  { query: 'poached egg', mode: 'common', expected: ['egg poached', 'poached egg'] },
  { query: 'toasted bread', mode: 'common', expected: ['bread toasted', 'toasted bread', 'toast'] },
  { query: 'baked potato', mode: 'common', expected: ['potato baked', 'baked potato'] },
  { query: 'canned tuna', mode: 'common', expected: ['tuna canned', 'canned tuna'] },
  { query: 'frozen broccoli', mode: 'common', expected: ['broccoli frozen', 'frozen broccoli'] },
  { query: 'steamed rice', mode: 'common', expected: ['rice steamed', 'steamed rice'] },
  { query: 'Coca Cola', mode: 'full', expected: ['coca cola'], brand: 'coca cola' },
  { query: 'Oreo cookies', mode: 'full', expected: ['oreo cookie'], brand: 'oreo' },
  { query: 'Nutella hazelnut spread', mode: 'full', expected: ['nutella hazelnut spread'], brand: 'nutella' },
  { query: 'Cheerios cereal', mode: 'full', expected: ['cheerios cereal'], brand: 'cheerios' },
  { query: 'Jif peanut butter', mode: 'full', expected: ['jif peanut butter'], brand: 'jif' },
];

function containsExpected(item: FoodResult, expected: string[]): boolean {
  const text = normalizeFoodText(`${item.brand ?? ''} ${item.name} ${item.preparation ?? ''}`);
  return expected.some((phrase) => normalizeFoodText(phrase).split(' ').every((token) => text.includes(token)));
}

function duplicateLimitMet(items: FoodResult[]): boolean {
  const counts = new Map<string, number>();
  for (const item of items.slice(0, 10)) {
    const key = `${normalizeFoodText(item.normalizedName)}|${item.preparation ?? ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values()) <= 3;
}

function printNearMiss(query: string, nearMiss: DedupNearMiss): void {
  const percentages = Object.entries(nearMiss.differences)
    .map(([macro, difference]) => `${macro}=${(difference * 100).toFixed(1)}%`)
    .join(', ');
  console.log(`  near-miss [${query}] ${nearMiss.first.name} (${nearMiss.first.sourceFoodId}) <> ${nearMiss.second.name} (${nearMiss.second.sourceFoodId}): ${percentages}; merged=${nearMiss.merged}`);
}

async function main(): Promise<void> {
  let usdaApiKey = process.env.EXPO_PUBLIC_USDA_API_KEY?.trim() ?? '';
  if (!usdaApiKey && existsSync('.env.local')) {
    const line = readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith('EXPO_PUBLIC_USDA_API_KEY='));
    usdaApiKey = line
      ?.slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2')
      ?? '';
  }
  if (!usdaApiKey) throw new Error('EXPO_PUBLIC_USDA_API_KEY is required for the live food-search evaluation.');
  const requestedQueries = process.argv.slice(2).map((query) => normalizeFoodText(query));
  const evaluationCases = requestedQueries.length === 0
    ? cases
    : cases.filter((evaluation) => requestedQueries.includes(normalizeFoodText(evaluation.query)));
  if (evaluationCases.length === 0) throw new Error('No evaluation query matched the provided filter.');
  const providers = createFoodSearchRemoteProviders({ usdaApiKey });
  let nearMisses: DedupNearMiss[] = [];
  let providerFailures: string[] = [];
  const engine = new FoodSearchEngine({
    searchLocal: async () => [],
    searchCommon: providers.searchCommon,
    searchBranded: providers.searchBranded,
    searchOpenFoodFacts: providers.searchOpenFoodFacts,
    onNearMisses: (current) => { nearMisses = current; },
    onProviderFailure: (provider, error) => {
      const message = error instanceof Error ? error.message : String(error);
      providerFailures.push(`${provider}: ${message}`);
    },
  });

  let commonTopThreeHits = 0;
  let commonQueries = 0;
  let commonPortioned = 0;
  let commonFirstFive = 0;
  let duplicatePasses = 0;
  let brandTopThreeHits = 0;
  let brandQueries = 0;

  for (const evaluation of evaluationCases) {
    providerFailures = [];
    const outcome = await engine.search(evaluation.query, evaluation.mode);
    const topFive = outcome.items.slice(0, 5);
    console.log(`\n[${evaluation.mode}] ${evaluation.query} (${outcome.kind})`);
    topFive.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name}${item.brand ? ` — ${item.brand}` : ''} [${item.dataType}]${item.servingLabel ? ` · ${item.servingLabel}` : ''}`);
    });
    nearMisses.forEach((nearMiss) => printNearMiss(evaluation.query, nearMiss));
    providerFailures.forEach((failure) => console.log(`  provider failure: ${failure}`));
    if (duplicateLimitMet(outcome.items)) duplicatePasses += 1;

    if (evaluation.mode === 'common') {
      commonQueries += 1;
      if (outcome.items.slice(0, 3).some((item) => containsExpected(item, evaluation.expected))) commonTopThreeHits += 1;
      commonFirstFive += topFive.length;
      commonPortioned += topFive.filter((item) => item.servingSizeGrams != null && item.servingSizeGrams > 0).length;
    } else {
      brandQueries += 1;
      if (outcome.items.slice(0, 3).some((item) => containsExpected(item, evaluation.expected))) {
        brandTopThreeHits += 1;
      }
    }
  }

  const remoteMetrics = providers.getMetrics();
  const cacheMetrics = engine.getCacheMetrics();
  const commonHitRate = commonQueries === 0 ? 0 : commonTopThreeHits / commonQueries;
  const portionRate = commonFirstFive === 0 ? 0 : commonPortioned / commonFirstFive;
  const duplicateRate = duplicatePasses / evaluationCases.length;
  const brandHitRate = brandQueries === 0 ? 1 : brandTopThreeHits / brandQueries;
  console.log('\nAggregate metrics');
  console.log(`  Common intended result in top 3: ${commonTopThreeHits}/${commonQueries} (${(commonHitRate * 100).toFixed(1)}%; target >=85%)`);
  console.log(`  Queries meeting top-10 duplicate limit: ${duplicatePasses}/${evaluationCases.length} (${(duplicateRate * 100).toFixed(1)}%; target 100%)`);
  console.log(`  First-five common results with portions: ${commonPortioned}/${commonFirstFive} (${(portionRate * 100).toFixed(1)}%; target >=80%)`);
  console.log(`  Explicit brands in top 3: ${brandTopThreeHits}/${brandQueries} (${(brandHitRate * 100).toFixed(1)}%; target 100%)`);
  console.log(`  USDA requests: ${remoteMetrics.usdaRequests} (${(remoteMetrics.usdaRequests / evaluationCases.length).toFixed(2)} per evaluated query)`);
  console.log(`  Remote cache: ${cacheMetrics.hits} hits, ${cacheMetrics.misses} misses`);
  console.log(`  USDA X-RateLimit-Remaining: first=${remoteMetrics.firstRateLimitRemaining ?? 'unavailable'}, last=${remoteMetrics.lastRateLimitRemaining ?? 'unavailable'}`);

  if (commonHitRate < 0.85 || duplicateRate < 1 || portionRate < 0.8 || brandHitRate < 1) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
