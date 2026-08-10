import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const lockPath = `${rootDirectory}package-lock.json`;
const packagePath = `${rootDirectory}package.json`;
const outputPath = `${rootDirectory}release/legal/THIRD_PARTY_SOFTWARE.md`;
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const directDependencies = new Set(Object.keys(packageJson.dependencies ?? {}));
const legacyLicenseFields = new Map([
  ['qrcode-terminal@0.11.0', 'Apache-2.0'],
  ['requireg@0.2.2', 'MIT'],
]);

function packageName(lockPathKey) {
  return lockPathKey.split('node_modules/').at(-1);
}

const packageMap = new Map();
for (const [lockPathKey, metadata] of Object.entries(lock.packages ?? {})) {
  if (!lockPathKey || metadata.dev === true) continue;
  const name = packageName(lockPathKey);
  const version = metadata.version;
  if (!name || !version) throw new Error(`Production package metadata is incomplete at ${lockPathKey}`);
  const key = `${name}@${version}`;
  const license = metadata.license ?? legacyLicenseFields.get(key);
  if (!license) throw new Error(`Production package ${key} has no reviewed license identifier`);
  const existing = packageMap.get(key);
  if (existing && existing.license !== license) {
    throw new Error(`Production package ${key} has inconsistent license identifiers`);
  }
  packageMap.set(key, {
    name,
    version,
    license,
    direct: directDependencies.has(name) || existing?.direct === true,
  });
}

const packages = [...packageMap.values()];
packages.sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

const lines = [
  '# Eatlog third-party software inventory',
  '',
  'Generated from `package-lock.json` by `scripts/generate-third-party-notices.mjs`. Run `npm run notices` after any dependency change and `npm run notices:check` in release verification.',
  '',
  'This inventory identifies production packages and their declared SPDX-style license expressions. Package copyright and license files remain authoritative. The bundled Onest font notice is preserved separately in `release/legal/ONEST-OFL-1.1.txt`.',
  '',
  `Production package records: ${packages.length}`,
  '',
  '| Package | Version | Direct | License |',
  '| --- | --- | --- | --- |',
  ...packages.map(({ name, version, direct, license }) => `| ${name.replaceAll('|', '\\|')} | ${version} | ${direct ? 'yes' : 'no'} | ${String(license).replaceAll('|', '\\|')} |`),
  '',
];
const next = lines.join('\n');

if (process.argv.includes('--check')) {
  const current = readFileSync(outputPath, 'utf8');
  if (current !== next) throw new Error('Third-party software inventory is stale. Run npm run notices.');
} else {
  writeFileSync(outputPath, next);
}
