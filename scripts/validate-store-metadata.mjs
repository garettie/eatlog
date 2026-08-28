import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { storeMetadata as metadata } from '../release/store/metadata.mjs';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const shareContract = JSON.parse(readFileSync(
  new URL('../src/utils/shareContract.json', import.meta.url),
  'utf8',
));
const shareDocumentPaths = [
  '../release/store/REVIEW_MATERIAL.md',
  '../release/privacy/DATA_INVENTORY.md',
  '../release/site/privacy.md',
  '../release/store/POLICY_WORKSHEETS.md',
  '../release/qa/UI_SMOKE_SCRIPT.md',
  '../release/qa/DEVICE_MATRIX.md',
  '../release/OWNER_RELEASE_CHECKLIST.md',
  '../release/config/NATIVE_CONFIGURATION.md',
];
const shareDocuments = shareDocumentPaths.map((path) => ({
  path,
  text: readFileSync(new URL(path, import.meta.url), 'utf8'),
}));

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
assert.equal(metadata.product.commercial.acquisitionPrice, 'free');
assert.deepEqual(metadata.product.commercial.manok, { currency: 'PHP', amount: 79, period: 'monthly' });
assert.deepEqual(metadata.product.commercial.itik, { currency: 'PHP', amount: 799, purchaseType: 'one-time lifetime entitlement' });
assert.equal(metadata.product.commercial.subscriptions, true);
assert.equal(metadata.product.commercial.inAppPurchases, true);
assert.equal(metadata.product.accountRequired, false);
assert.equal(metadata.product.localFirst, true);
assert.ok(metadata.google.fullDescription.includes(metadata.google.requiredHealthDisclaimer));
assert.ok(metadata.google.fullDescription.includes('Consult a qualified healthcare professional'));
const publicListingCopy = `${metadata.google.shortDescription} ${metadata.google.fullDescription} ${metadata.apple.subtitle} ${metadata.apple.description} ${metadata.apple.promotionalText}`;
assert.doesNotMatch(publicListingCopy, /\btrial\b|introductory offer|free month/iu, 'Public store copy must not advertise a trial.');
assert.ok(readme.includes(metadata.product.valueProposition), 'README must include the canonical product value proposition.');
assert.ok(metadata.google.fullDescription.includes(metadata.product.valueProposition), 'Google description must include the canonical product value proposition.');
assert.ok(metadata.apple.description.includes(metadata.product.valueProposition), 'Apple description must include the canonical product value proposition.');

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
  /example\.com|\bTBD\b|OWNER INPUT/iu,
]) {
  assert.equal(forbidden.test(publicCopy), false, `Public store copy contains a forbidden or placeholder claim: ${forbidden}`);
}
assert.equal(/Apple Health|HealthKit/iu.test(metadata.apple.description), false, 'Apple public description must not claim Apple Health or HealthKit support.');
const internalProviderName = /\b(?:USDA|Open Food Facts|Cloudflare|Gemini|RevenueCat)\b/iu;
assert.equal(internalProviderName.test(publicCopy), false, 'Public store copy must describe the product, not internal providers.');
assert.equal(internalProviderName.test(readme), false, 'README must describe the product, not internal providers.');

assert.deepEqual(shareContract.contentKinds, ['meal']);
assert.deepEqual(shareContract.mealStyles, ['photo', 'framed', 'nutrition']);
assert.deepEqual(shareContract.image, {
  width: 1080,
  height: 1920,
  format: 'png',
  mimeType: 'image/png',
  extension: 'png',
});

for (const { path, text } of shareDocuments) {
  for (const legacyPattern of [
    /1080\s+(?:by|x|×)\s+1350/iu,
    /Summary, Macros, (?:and|or) Components/iu,
    /MealShareComposer|mealSharing/iu,
    /\bgenerated JPEGs?\b/iu,
    /\bmeal JPEGs?\b/iu,
    /\b4:5\b/iu,
    /\bCard options\b/u,
    /Meal, Day, or Logging consistency/u,
    /meal, day, or logging-consistency/u,
    /Share Today’s Day card/u,
    /Meal Photo, Framed, Nutrition, Day/u,
  ]) {
    assert.equal(legacyPattern.test(text), false, `${path} contains legacy share copy: ${legacyPattern}`);
  }
}

const reviewMaterial = shareDocuments.find(({ path }) => path.endsWith('/REVIEW_MATERIAL.md'))?.text ?? '';
const dataInventory = shareDocuments.find(({ path }) => path.endsWith('/DATA_INVENTORY.md'))?.text ?? '';
const expectedImageDescription = `${shareContract.image.width} by ${shareContract.image.height} ${shareContract.image.format.toUpperCase()}`;
assert.ok(reviewMaterial.includes(expectedImageDescription), 'Reviewer material must state the current share image contract.');
assert.ok(dataInventory.includes(expectedImageDescription), 'Data inventory must state the current share image contract.');
assert.ok(reviewMaterial.includes('Photo, Framed, and Nutrition'), 'Reviewer material must state the current meal styles.');
assert.ok(reviewMaterial.includes('without vertical scrolling'), 'Reviewer material must state the current share-sheet behavior.');

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
