import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { decodePng, encodePng } from './store-artwork-png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'release/artwork/export');
const siteAssetsDirectory = join(root, 'release/site/assets');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'eatlog-store-artwork-'));
const canonicalDataUrl = `data:image/png;base64,${readFileSync(join(root, 'assets/icon.png')).toString('base64')}`;

function render(source, output, width, height) {
  const hydratedSource = join(temporaryDirectory, `source-${width}x${height}.svg`);
  const sourceText = readFileSync(source, 'utf8');
  if (!sourceText.includes('../../../assets/icon.png')) throw new Error('Store artwork source is not linked to the canonical icon.');
  writeFileSync(hydratedSource, sourceText.replaceAll('../../../assets/icon.png', canonicalDataUrl));
  const result = spawnSync('rsvg-convert', [
    '--format=png', `--width=${width}`, `--height=${height}`,
    `--output=${output}`, hydratedSource,
  ], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('rsvg-convert could not render the store artwork source.');
}

function renderTier(source, output) {
  const result = spawnSync('rsvg-convert', [
    '--format=png', '--width=1024', '--height=1024',
    `--output=${output}`, source,
  ], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`rsvg-convert could not render ${source}.`);
}

try {
  mkdirSync(outputDirectory, { recursive: true });
  mkdirSync(siteAssetsDirectory, { recursive: true });
  const renderedIcon = join(temporaryDirectory, 'play-icon.png');
  const renderedFeature = join(temporaryDirectory, 'play-feature.png');
  render(join(root, 'release/artwork/source/play-icon.svg'), renderedIcon, 512, 512);
  render(join(root, 'release/artwork/source/play-feature-graphic.svg'), renderedFeature, 1024, 500);

  writeFileSync(
    join(outputDirectory, 'google-play-icon-512.png'),
    encodePng(decodePng(readFileSync(renderedIcon)), 6),
  );
  writeFileSync(
    join(outputDirectory, 'google-play-feature-graphic-1024x500.png'),
    encodePng(decodePng(readFileSync(renderedFeature)), 2),
  );
  writeFileSync(
    join(outputDirectory, 'apple-app-store-icon-1024.png'),
    encodePng(decodePng(readFileSync(join(root, 'assets/icon.png'))), 2),
  );
  for (const [name, exportName] of [
    ['eatlog', 'eatlog-free-product-icon-1024.png'],
    ['omelette', 'eatlog-omelette-product-icon-1024.png'],
  ]) {
    const source = join(root, `release/artwork/source/tier-${name}.svg`);
    const rendered = join(temporaryDirectory, `tier-${name}.png`);
    renderTier(source, rendered);
    writeFileSync(join(outputDirectory, exportName), encodePng(decodePng(readFileSync(rendered)), 6));
    // Store promo images must be square and opaque, so the round backdrop fills the canvas.
    const square = join(temporaryDirectory, `tier-${name}-square.svg`);
    const renderedSquare = join(temporaryDirectory, `tier-${name}-square.png`);
    writeFileSync(square, readFileSync(source, 'utf8').replace('<circle cx="24" cy="24" r="24" fill="#1A1A1A"/>', '<rect width="48" height="48" fill="#1A1A1A"/>'));
    renderTier(square, renderedSquare);
    writeFileSync(join(outputDirectory, exportName.replace('-1024.png', '-square-1024.png')), encodePng(decodePng(readFileSync(renderedSquare)), 2));
    copyFileSync(source, join(siteAssetsDirectory, `tier-${name}.svg`));
  }
  for (const name of ['pugo', 'manok', 'itik']) {
    rmSync(join(outputDirectory, `eatlog-${name}-product-icon-1024.png`), { force: true });
    rmSync(join(siteAssetsDirectory, `tier-${name}.svg`), { force: true });
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
