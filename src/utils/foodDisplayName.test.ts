import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFoodDisplayName, hasFoodAmount, stripFoodAmount } from './foodDisplayName';

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

test('a name that is only an amount survives formatting instead of emptying', () => {
  assert.equal(formatFoodDisplayName('1 cup'), '1 Cup');
  assert.equal(formatFoodDisplayName('3 pcs'), '3 Pcs');
  assert.equal(formatFoodDisplayName('250g'), '250G');
  assert.equal(formatFoodDisplayName('2 slices', 'sentence'), '2 Slices');
  assert.equal(stripFoodAmount('1 serving'), '');
});

test('a numbered brand keeps its number while portion counts are still removed', () => {
  assert.equal(stripFoodAmount('100 Plus'), '100 Plus');
  assert.equal(stripFoodAmount('2 eggs'), 'eggs');
  assert.equal(stripFoodAmount('20 cookies'), 'cookies');
  assert.equal(stripFoodAmount('21 boxes'), '21 boxes');
});

test('a stated amount written as a word is removed only ahead of a real portion unit', () => {
  assert.equal(stripFoodAmount('Two slices of bread'), 'bread');
  assert.equal(stripFoodAmount('Three pieces of fried chicken'), 'fried chicken');
  assert.equal(stripFoodAmount('Half cup of rice'), 'rice');
  // A number word ahead of an ordinary noun belongs to the name.
  assert.equal(stripFoodAmount('Three Bean Salad'), 'Three Bean Salad');
  assert.equal(stripFoodAmount('Three Musketeers'), 'Three Musketeers');
  assert.equal(stripFoodAmount('Seven Up'), 'Seven Up');
  assert.equal(stripFoodAmount('Two-bite brownies'), 'Two-bite brownies');
});

test('an amount anywhere in a title is detected while name numbers are not', () => {
  for (const text of ['3 eggs with 150 grams of rice', 'Chicken adobo with 150 grams of rice', 'Adobo and 2 cups rice',
    'Rice with 2 eggs', '24 Chicken 3 piece yangnyeom', 'Jollibee 2pc chickenjoy', 'Rice with ½ cup beans', 'Milk 250ml']) {
    assert.equal(hasFoodAmount(text), true, text);
  }
  for (const text of ['24 Chicken yangnyeom', '100 Plus', '7-Eleven hotdog', '2% milk', '5-spice chicken', 'Chicken adobo']) {
    assert.equal(hasFoodAmount(text), false, text);
  }
});
