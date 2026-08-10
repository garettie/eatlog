import assert from 'node:assert/strict';

import { storeMetadata as metadata } from '../release/store/metadata.mjs';

const characters = (value) => [...value].length;
const bytes = (value) => Buffer.byteLength(value, 'utf8');
const withinCharacters = (label, value, limit) => {
  assert.ok(characters(value) <= limit, `${label} exceeds ${limit} characters.`);
};

withinCharacters('Google title', metadata.google.title, 30);
withinCharacters('Google short description', metadata.google.shortDescription, 80);
withinCharacters('Google full description', metadata.google.fullDescription, 4_000);
withinCharacters('Google release notes', metadata.google.releaseNotes, 500);
withinCharacters('Apple title', metadata.apple.title, 30);
withinCharacters('Apple subtitle', metadata.apple.subtitle, 30);
withinCharacters('Apple description', metadata.apple.description, 4_000);
withinCharacters('Apple promotional text', metadata.apple.promotionalText, 170);
withinCharacters('Apple release notes', metadata.apple.releaseNotes, 4_000);
assert.ok(bytes(metadata.apple.keywords) <= 100, 'Apple keywords exceed 100 UTF-8 bytes.');
assert.ok(metadata.apple.keywords.split(',').every((keyword) => characters(keyword.trim()) > 2), 'Apple keywords must each exceed two characters.');
assert.ok(bytes(metadata.reviewerNotes.apple) <= 4_000, 'Apple reviewer notes exceed 4000 UTF-8 bytes.');

assert.equal(metadata.product.name, 'Eatlog');
assert.equal(metadata.google.title, 'Eatlog');
assert.equal(metadata.apple.title, 'Eatlog');
assert.deepEqual(metadata.product.commercial.philippinesPrice, { currency: 'PHP', amount: 299 });
assert.equal(metadata.product.commercial.purchaseType, 'one-time upfront store purchase');
assert.equal(metadata.product.commercial.subscriptions, false);
assert.equal(metadata.product.commercial.inAppPurchases, false);
assert.equal(metadata.product.accountRequired, false);
assert.equal(metadata.product.localFirst, true);
assert.ok(metadata.google.fullDescription.includes(metadata.google.requiredHealthDisclaimer));
assert.ok(metadata.google.fullDescription.includes('Consult a qualified healthcare professional'));

const publicCopy = [
  metadata.google.title,
  metadata.google.shortDescription,
  metadata.google.fullDescription,
  metadata.google.releaseNotes,
  metadata.apple.title,
  metadata.apple.subtitle,
  metadata.apple.keywords,
  metadata.apple.description,
  metadata.apple.promotionalText,
  metadata.apple.releaseNotes,
].join('\n');
for (const forbidden of [
  /\b(best|top-rated|number one|guaranteed|clinically proven)\b/iu,
  /\b(million users|thousands of users|testimonial)\b/iu,
  /\b(?:can|will|helps? to)\s+diagnos(?:e|es)\b/iu,
  /\bdiagnos(?:e|es)\s+(?:conditions?|diseases?)\b/iu,
  /\bfully offline\b/iu,
  /\bfree download\b/iu,
  /example\.com|\bTBD\b|OWNER INPUT/iu,
]) {
  assert.equal(forbidden.test(publicCopy), false, `Public store copy contains a forbidden or placeholder claim: ${forbidden}`);
}
assert.equal(/Apple Health|HealthKit/iu.test(metadata.apple.description), false, 'Apple public description must not claim Apple Health or HealthKit support.');

console.log(JSON.stringify({
  google: {
    title: characters(metadata.google.title),
    shortDescription: characters(metadata.google.shortDescription),
    fullDescription: characters(metadata.google.fullDescription),
    releaseNotes: characters(metadata.google.releaseNotes),
  },
  apple: {
    title: characters(metadata.apple.title),
    subtitle: characters(metadata.apple.subtitle),
    keywordsBytes: bytes(metadata.apple.keywords),
    description: characters(metadata.apple.description),
    promotionalText: characters(metadata.apple.promotionalText),
    releaseNotes: characters(metadata.apple.releaseNotes),
    reviewerNotesBytes: bytes(metadata.reviewerNotes.apple),
  },
}, null, 2));
