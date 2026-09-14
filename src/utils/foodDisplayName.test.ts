import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFoodDisplayName } from './foodDisplayName';

test('food names retain accents, qualifiers, and brand spelling', () => {
  assert.equal(formatFoodDisplayName("  **McDonald's**   stir-fried rice "), "McDonald's Stir-fried Rice");
  assert.equal(formatFoodDisplayName('CAFÉ AU LAIT'), 'Café Au Lait');
  assert.equal(formatFoodDisplayName('2% milk (low-fat)'), '2% Milk (Low-fat)');
  assert.equal(formatFoodDisplayName('KFC BBQ chicken'), 'KFC BBQ Chicken');
});

test('meal titles use readable sentence casing without changing proper names', () => {
  assert.equal(formatFoodDisplayName(' **CHICKEN ADOBO WITH RICE** ', 'sentence'), 'Chicken adobo with rice');
  assert.equal(formatFoodDisplayName('  chicken adobo\nwith rice ', 'sentence'), 'Chicken adobo with rice');
  assert.equal(formatFoodDisplayName("McDonald's Big Mac with rice", 'sentence'), "McDonald's Big Mac with rice");
});
