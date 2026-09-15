const FOOD_ACRONYMS = new Set(['BBQ', 'BLT', 'KFC']);
const AMOUNT = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾])`;
const PORTION_UNIT = String.raw`(?:mg|g|grams?|kg|ml|l|cups?|tbsp|tablespoons?|tsp|teaspoons?|servings?|pieces?|pcs?|slices?|bowls?|plates?|scoops?|packets?|sachets?)`;
const LEADING_PORTION = new RegExp(`^\\s*${AMOUNT}\\s*${PORTION_UNIT}\\s*(?:of\\s+)?`, 'iu');
const LEADING_COUNT = new RegExp(`^\\s*${AMOUNT}\\s+(?=\\p{L}[\\p{L}\\p{M}'’\\-]*s(?:\\s|$))`, 'iu');
const TRAILING_PORTION = new RegExp(`\\s*[,–—-]?\\s*${AMOUNT}\\s*${PORTION_UNIT}\\s*$`, 'iu');
const PARENTHETICAL_PORTION = new RegExp(`\\s*\\(\\s*${AMOUNT}\\s*${PORTION_UNIT}\\s*\\)\\s*$`, 'iu');

export function stripFoodAmount(name: string): string {
  return name
    .replace(PARENTHETICAL_PORTION, '')
    .replace(LEADING_PORTION, '')
    .replace(LEADING_COUNT, '')
    .replace(TRAILING_PORTION, '')
    .trim();
}

/** Format display text without losing accents, brand punctuation, or nutrition qualifiers. */
export function formatFoodDisplayName(name: string, style: 'title' | 'sentence' = 'title'): string {
  const clean = stripFoodAmount(name.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim());
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
