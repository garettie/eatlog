import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

import { normalizeFoodText } from '../src/services/foodSearchCore';
import { FoodSearchEngine } from '../src/services/foodSearchEngine';
import { createFoodSearchRemoteProviders } from '../src/services/foodSearchRemote';
import { searchCommonFoods } from '../src/services/commonFoods';
import { buildOpenFoodFactsUserAgent } from '../src/services/publicReleaseConfig';
import { duplicateLimitMet, evaluationCases, evaluationRow, summarizeEvaluation, type EvaluationRow } from './foodSearchEvaluation';
import { readLocalEnv } from './foodSearchScriptConfig';
import app from '../app.json';

async function main(): Promise<void> {
  const workerUrl = readLocalEnv('EXPO_PUBLIC_FOOD_WORKER_URL').replace(/\/$/, '');
  if (!workerUrl) throw new Error('EXPO_PUBLIC_FOOD_WORKER_URL is required for the live food-search evaluation.');
  const userAgent = buildOpenFoodFactsUserAgent(app.expo.version, readLocalEnv('EXPO_PUBLIC_SUPPORT_EMAIL'));
  if (!userAgent) console.warn('Warning: support email is absent; Open Food Facts will not run.');
  const args = process.argv.slice(2);
  const queries = args.filter((arg) => !arg.startsWith('--')).map(normalizeFoodText);
  const cases = queries.length ? evaluationCases.filter((item) => queries.includes(normalizeFoodText(item.query))) : evaluationCases;
  if (!cases.length) throw new Error('No evaluation query matched the provided filter.');
  const providers = createFoodSearchRemoteProviders({ workerUrl, openFoodFactsUserAgent: userAgent,
    getInstallationToken: () => '00000000000000000000000000000000' });
  const failures: string[] = [];
  const engine = new FoodSearchEngine({
    // --remote-only keeps the Phase 2 baseline without bundled common foods.
    searchLocal: async (query) => args.includes('--remote-only') ? [] : searchCommonFoods(query),
    searchUSDA: providers.searchUSDA,
    searchOpenFoodFacts: providers.searchOpenFoodFacts,
    onProviderFailure: (provider, error) => failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`),
  });
  const rows: EvaluationRow[] = [];
  let duplicates = 0;
  for (const [index, item] of cases.entries()) {
    if (index > 0) await delay(2100);
    failures.length = 0;
    const outcome = await engine.search(item.query, item.mode);
    const row = evaluationRow(item.query, item.mode, outcome, failures);
    rows.push(row);
    if (duplicateLimitMet(outcome.items)) duplicates += 1;
    console.log(`\n[${item.mode}] ${item.query} (${row.kind})`);
    row.top.slice(0, 5).forEach((food, index) => console.log(`  ${index + 1}. ${food.name} [${food.dataType}] · ${food.serving}`));
  }
  const summary = summarizeEvaluation(rows, duplicates);
  const metric = (label: string, count: number, total: number, target: string) =>
    console.log(`  ${label}: ${count}/${total} (${total ? (100 * count / total).toFixed(1) : 'n/a'}%; target ${target})`);
  console.log('\nAggregate metrics');
  metric('Common correct in top 1', summary.topOne, summary.common, '>=90%');
  metric('Common correct in top 3', summary.topThree, summary.common, '>=95%');
  metric('Top 1 correct with a real serving', summary.serving, summary.common, '>=80%');
  metric('Explicit brands in top 3', summary.brands, summary.branded, '100%');
  metric('Queries meeting top-10 duplicate limit', duplicates, rows.length, '100%');
  console.log(`  Provider failure queries: ${summary.failures}`);
  console.log(`  Worker failures: ${providers.getMetrics().workerFailures}`);
  if (summary.failures) {
    console.log('\nProvider failures');
    rows.filter((row) => row.failures.length || row.kind === 'unavailable')
      .forEach((row) => console.log(`  ${row.query}: ${row.failures.join('; ') || 'unavailable'}`));
  }
  const output = args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
  if (output) writeFileSync(output, `${JSON.stringify(rows, null, 2)}\n`);
  if (!summary.passed) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
