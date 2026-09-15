import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFoodDisplayName, stripFoodAmount } from './foodDisplayName';

test('food names retain accents, qualifiers, and brand spelling', () => {
  assert.equal(formatFoodDisplayName("  **McDonald's**   stir-fried rice "), "McDonald's Stir-fried Rice");
  assert.equal(formatFoodDisplayName('CAFÉ AU LAIT'), 'Café Au Lait');
  assert.equal(formatFoodDisplayName('2% milk (low-fat)'), '2% Milk (Low-fat)');
  assert.equal(formatFoodDisplayName('KFC BBQ chicken'), 'KFC BBQ Chicken');
  assert.equal(formatFoodDisplayName('PB&J sandwich'), 'PB&J Sandwich');
  assert.equal(formatFoodDisplayName('OATLY oat drink'), 'OATLY Oat Drink');
});

test('meal titles use readable sentence casing without changing proper names', () => {
  assert.equal(formatFoodDisplayName(' **CHICKEN ADOBO WITH RICE** ', 'sentence'), 'Chicken adobo with rice');
  assert.equal(formatFoodDisplayName('  chicken adobo\nwith rice ', 'sentence'), 'Chicken adobo with rice');
  assert.equal(formatFoodDisplayName("McDonald's Big Mac with rice", 'sentence'), "McDonald's Big Mac with rice");
});

test('food amounts are removed without damaging nutrition qualifiers or numbered dishes', () => {
  assert.equal(stripFoodAmount('2 eggs'), 'eggs');
  assert.equal(stripFoodAmount('200g chicken breast'), 'chicken breast');
  assert.equal(stripFoodAmount('1/2 cup of white rice'), 'white rice');
  assert.equal(stripFoodAmount('White rice (2 cups)'), 'White rice');
  assert.equal(stripFoodAmount('Cookies, 30 g'), 'Cookies');
  assert.equal(stripFoodAmount('2% milk'), '2% milk');
  assert.equal(stripFoodAmount('5-spice chicken'), '5-spice chicken');
  assert.equal(stripFoodAmount('7-layer dip'), '7-layer dip');
});
