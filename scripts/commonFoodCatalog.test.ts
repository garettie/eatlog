import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommonFood, validateSeeds, type CommonFoodSeed } from './commonFoodCatalog';

const seed: CommonFoodSeed = {
  id: 'rice', fdcId: 1, name: 'Rice', aliases: [],
  portions: [{ id: 'cup', label: '1 cup', usdaPortionId: 10 }], defaultPortionId: 'cup',
};
const detail = {
  fdcId: 1, description: 'Rice', dataType: 'Survey (FNDDS)',
  foodNutrients: [1008, 1003, 1005, 1004].map((nutrientId) => ({ nutrientId, value: 1 })),
  foodPortions: [{ id: 10, gramWeight: 158, portionDescription: '1 cup' }],
};

test('catalog validation binds serving weight to the exact USDA portion and unit', () => {
  assert.equal(buildCommonFood(seed, detail).portions[0].grams, 158);
  assert.throws(() => buildCommonFood({ ...seed, portions: [{ ...seed.portions[0], label: '1 tbsp' }] }, detail), /label mismatch/);
  assert.throws(() => buildCommonFood({ ...seed, portions: [{ ...seed.portions[0], label: '2 cups' }] }, detail), /label mismatch/);
  assert.throws(() => buildCommonFood(seed, { ...detail, foodPortions: [] }), /Missing USDA portion/);
  assert.throws(() => buildCommonFood(seed, { ...detail, fdcId: 2 }), /Wrong USDA record/);
});

test('catalog accepts USDA unit abbreviations and fractional servings', () => {
  const portion = { id: 10, gramWeight: 16, amount: 1, modifier: 'tablespoon' };
  assert.equal(buildCommonFood({ ...seed, portions: [{ ...seed.portions[0], label: '1 tbsp' }] },
    { ...detail, foodPortions: [portion] }).portions[0].grams, 16);
  assert.equal(buildCommonFood({ ...seed, portions: [{ ...seed.portions[0], label: '1/2 cup' }] },
    { ...detail, foodPortions: [{ ...portion, amount: 0.5, modifier: 'cup' }] }).portions[0].grams, 16);
});

test('seed validation rejects duplicate identities and missing default portions', () => {
  validateSeeds([seed]);
  assert.throws(() => validateSeeds([seed, seed]), /duplicate/);
  assert.throws(() => validateSeeds([{ ...seed, defaultPortionId: 'missing' }]), /Invalid aliases or portions/);
});
