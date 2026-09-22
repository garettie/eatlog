const FOOD_ACRONYMS = new Set(['BBQ', 'BLT', 'KFC']);
const AMOUNT = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾])`;
const PORTION_UNIT = String.raw`(?:mg|g|grams?|kg|ml|l|cups?|tbsp|tablespoons?|tsp|teaspoons?|servings?|pieces?|pcs?|slices?|bowls?|plates?|scoops?|packets?|sachets?)`;
// Gemini writes stated counts as words as often as digits ("Two slices of bread"). Only the
// explicit-unit form takes word amounts: a bare word before a plural noun is far more likely
// to be a name ("Three Bean Salad") than a portion.
const WORD_AMOUNT = String.raw`(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half)`;
const LEADING_PORTION = new RegExp(`^\\s*(?:${AMOUNT}|${WORD_AMOUNT})\\s*${PORTION_UNIT}\\s*(?:of\\s+)?`, 'iu');
const LEADING_COUNT = new RegExp(`^\\s*(${AMOUNT})\\s+(?=\\p{L}[\\p{L}\\p{M}'’\\-]*s(?:\\s|$))`, 'iu');
const TRAILING_PORTION = new RegExp(`\\s*[,–—-]?\\s*${AMOUNT}\\s*${PORTION_UNIT}\\s*$`, 'iu');
const PARENTHETICAL_PORTION = new RegExp(`\\s*\\(\\s*${AMOUNT}\\s*${PORTION_UNIT}\\s*\\)\\s*$`, 'iu');
const UNIT_AMOUNT_ANYWHERE = new RegExp(`(?<![\\p{L}\\p{N}\\-])(?:${AMOUNT}|${WORD_AMOUNT})\\s*${PORTION_UNIT}(?!\\p{L})`, 'iu');
// A number glued to a word or symbol ("7-Eleven", "2% milk", "5-spice") is part of the name.
const BARE_NUMBER = /(?<![\p{L}\p{N}.\-\/%])(\d+(?:\.\d+)?)(?![\p{L}\p{N}.%\-\/])/gu;

/**
 * A bare number ahead of a plural word is a portion count ("2 eggs") only while it reads as a
 * portion. Past that it belongs to the name itself, as in the drink "100 Plus". Fractions are
 * always portions.
 */
const MAX_LEADING_COUNT = 20;

function isPortionCount(amount: string): boolean {
  if (!/^\d+(?:\.\d+)?$/.test(amount)) return true;
  return Number(amount) <= MAX_LEADING_COUNT;
}

export function stripFoodAmount(name: string): string {
  return name
    .replace(PARENTHETICAL_PORTION, '')
    .replace(LEADING_PORTION, '')
    .replace(LEADING_COUNT, (match, amount: string) => (isPortionCount(amount) ? '' : match))
    .replace(TRAILING_PORTION, '')
    .trim();
}

/**
 * Whether text states an amount anywhere, not just where `stripFoodAmount` can cut it: a number
 * with a unit ("150 grams", "3 piece") or a bare count small enough to be a portion ("with 2 eggs").
 */
export function hasFoodAmount(text: string): boolean {
  if (UNIT_AMOUNT_ANYWHERE.test(text)) return true;
  return Array.from(text.matchAll(BARE_NUMBER), (match) => match[1]).some(isPortionCount);
}

/** Format display text without losing accents, brand punctuation, or nutrition qualifiers. */
export function formatFoodDisplayName(name: string, style: 'title' | 'sentence' = 'title'): string {
  const text = name.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim();
  // A name that is nothing but an amount ("1 cup", "3 pcs") strips to nothing. Formatting is
  // cosmetic, so it keeps the original rather than handing callers an empty name to reject.
  const clean = stripFoodAmount(text) || text;
  const hasLowercase = /\p{Ll}/u.test(clean);
  let first = true;
  return clean.replace(/[\p{L}][\p{L}\p{M}'’\-]*(?:[&/+][\p{L}\p{M}]+)*/gu, (word) => {
    const startsSentence = first;
    first = false;
    if (FOOD_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
    const shouted = word === word.toUpperCase();
    if (shouted && hasLowercase && word.length > 1) return word;
    if (!shouted && /\p{Lu}/u.test(word.slice(1))) return word;
    const normalized = shouted ? word.toLowerCase() : word;
    return style === 'title' || startsSentence
      ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
      : normalized;
  });
}
