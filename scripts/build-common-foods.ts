import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { buildCommonFood, validateSeeds, type CommonFoodSeed } from './commonFoodCatalog';
import { readLocalEnv } from './foodSearchScriptConfig';

async function main() {
  const seeds: CommonFoodSeed[] = JSON.parse(readFileSync('scripts/common-foods.seed.json', 'utf8'));
  validateSeeds(seeds);
  const workerUrl = readLocalEnv('EXPO_PUBLIC_FOOD_WORKER_URL').replace(/\/$/, '');
  if (!workerUrl) throw new Error('EXPO_PUBLIC_FOOD_WORKER_URL is required.');
  const foods: ReturnType<typeof buildCommonFood>[] = [];
  const report = ['# Common foods catalog review', '', '| Food | USDA record | Default portion | kcal |', '|---|---|---|---:|'];
  for (const [index, seed] of seeds.entries()) {
    if (index) await delay(2100);
    const response = await fetch(`${workerUrl}/v1/usda/foods/${seed.fdcId}`, {
      headers: { Accept: 'application/json', 'X-Eatlog-Install-ID': '00000000000000000000000000000000' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`USDA detail ${seed.fdcId}: HTTP ${response.status}`);
    const body = await response.json() as { food: Record<string, unknown> };
    const food = buildCommonFood(seed, body.food);
    foods.push(food);
    const portion = food.portions.find((item) => item.id === food.defaultPortionId)!;
    report.push(`| ${food.name} | ${seed.fdcId}: ${body.food.description} (${food.dataType}) | ${portion.label}, ${portion.grams} g | ${(food.caloriesPer100g * portion.grams / 100).toFixed(0)} |`);
    console.log(`${index + 1}/${seeds.length} ${food.name}: ${portion.label}, ${portion.grams} g`);
  }
  const output = `${JSON.stringify(foods)}\n`;
  if (Buffer.byteLength(output) >= 200_000) throw new Error('Common foods catalog exceeds 200 KB.');
  mkdirSync('src/data', { recursive: true });
  writeFileSync('src/data/commonFoods.json.tmp', output);
  renameSync('src/data/commonFoods.json.tmp', 'src/data/commonFoods.json');
  writeFileSync('docs/research/common-foods-catalog-review.md', `${report.join('\n')}\n`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
