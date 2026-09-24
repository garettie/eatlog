import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng } from './store-artwork-png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => decodePng(readFileSync(join(root, path)));
const canonical = read('assets/icon.png');
const playIconPath = 'release/artwork/export/google-play-icon-512.png';
const playIcon = read(playIconPath);
const feature = read('release/artwork/export/google-play-feature-graphic-1024x500.png');
const appleIcon = read('release/artwork/export/apple-app-store-icon-1024.png');

assert.deepEqual([canonical.width, canonical.height], [1024, 1024]);
assert.deepEqual([playIcon.width, playIcon.height, playIcon.colorType], [512, 512, 6]);
assert.ok(statSync(join(root, playIconPath)).size <= 1024 * 1024, 'Google Play icon exceeds 1024 KB.');
assert.deepEqual([feature.width, feature.height, feature.colorType], [1024, 500, 2]);
assert.deepEqual([appleIcon.width, appleIcon.height, appleIcon.colorType], [1024, 1024, 2]);

for (let index = 3; index < playIcon.rgba.length; index += 4) {
  assert.equal(playIcon.rgba[index], 255, 'Google Play icon contains transparent pixels.');
}
assert.equal(appleIcon.rgba.equals(canonical.rgba), true, 'Apple store icon changed the canonical pixels.');

const background = canonical.rgba.subarray(0, 3);
for (const [x, y] of [[0, 0], [1023, 0], [0, 499], [1023, 499]]) {
  const offset = (y * feature.width + x) * 4;
  assert.equal(feature.rgba.subarray(offset, offset + 3).equals(background), true, 'Feature graphic corner changed the canonical background.');
}
let minX = feature.width;
let minY = feature.height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < feature.height; y += 1) {
  for (let x = 0; x < feature.width; x += 1) {
    const offset = (y * feature.width + x) * 4;
    if (!feature.rgba.subarray(offset, offset + 3).equals(background)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}
assert.ok(minX >= 200 && maxX <= 824, 'Feature graphic focal mark is outside the horizontal safe area.');
assert.ok(minY >= 8 && maxY <= 491, 'Feature graphic focal mark is clipped or lacks vertical padding.');
assert.ok(Math.abs((minX + maxX) / 2 - 512) <= 2, 'Feature graphic focal mark is not centered.');

for (const source of ['play-icon.svg', 'play-feature-graphic.svg']) {
  const text = readFileSync(join(root, 'release/artwork/source', source), 'utf8');
  assert.ok(text.includes('../../../assets/icon.png'), `${source} is not linked to the canonical icon.`);
  assert.equal(/<path\b|<text\b/iu.test(text), false, `${source} redraws or adds to the canonical mark.`);
}

for (const [name, exportName] of [
  ['eatlog', 'eatlog-free-product-icon-1024.png'],
  ['omelette', 'eatlog-omelette-product-icon-1024.png'],
]) {
  const source = readFileSync(join(root, `release/artwork/source/tier-${name}.svg`), 'utf8');
  const site = readFileSync(join(root, `release/site/assets/tier-${name}.svg`), 'utf8');
  const productIcon = read(`release/artwork/export/${exportName}`);
  assert.equal(site, source, `${name} website icon differs from its source.`);
  assert.deepEqual([productIcon.width, productIcon.height, productIcon.colorType], [1024, 1024, 6]);
  assert.ok(source.includes('viewBox="0 0 48 48"'), `${name} source has an unexpected viewBox.`);
  assert.ok(source.includes('fill="#1A1A1A"'), `${name} lost its shared dark background.`);
  const center = (512 * productIcon.width + 512) * 4;
  assert.deepEqual(
    [...productIcon.rgba.subarray(center, center + 4)],
    name === 'eatlog' ? [255, 255, 255, 255] : [214, 138, 52, 255],
    `${name} product icon does not show the expected egg or omelette.`,
  );
}
for (const name of ['pugo', 'manok', 'itik']) {
  assert.equal(existsSync(join(root, `release/artwork/export/eatlog-${name}-product-icon-1024.png`)), false);
  assert.equal(existsSync(join(root, `release/site/assets/tier-${name}.svg`)), false);
}

console.log(JSON.stringify({
  canonical: { width: canonical.width, height: canonical.height, alpha: 'opaque' },
  googlePlayIcon: { width: playIcon.width, height: playIcon.height, colorType: 'RGBA', bytes: statSync(join(root, playIconPath)).size },
  googlePlayFeatureGraphic: { width: feature.width, height: feature.height, colorType: 'RGB', focalBounds: { minX, minY, maxX, maxY } },
  appleAppStoreIcon: { width: appleIcon.width, height: appleIcon.height, colorType: 'RGB', canonicalPixels: true },
}, null, 2));
