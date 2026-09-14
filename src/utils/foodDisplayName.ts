const FOOD_ACRONYMS = new Set(['BBQ', 'BLT', 'KFC']);

/** Format display text without losing accents, brand punctuation, or nutrition qualifiers. */
export function formatFoodDisplayName(name: string, style: 'title' | 'sentence' = 'title'): string {
  const clean = name.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim();
  let first = true;
  return clean.replace(/[\p{L}][\p{L}\p{M}'’\-]*/gu, (word) => {
    const startsSentence = first;
    first = false;
    if (FOOD_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
    const shouted = word === word.toUpperCase();
    if (!shouted && /\p{Lu}/u.test(word.slice(1))) return word;
    const normalized = shouted ? word.toLowerCase() : word;
    return style === 'title' || startsSentence
      ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
      : normalized;
  });
}
