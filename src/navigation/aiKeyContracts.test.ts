import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(directory, path), 'utf8');
const appJson = JSON.parse(read('../../app.json')) as { expo: { plugins: unknown[] } };
const keyStore = read('../services/userApiKey.ts');
const keySetup = read('../components/ai/KeySetupContent.tsx');
const aiSetup = read('../context/AiSetupContext.tsx');
const foodScan = read('../services/foodScan.ts');
const dataReset = read('../services/dataReset.ts');
const onboarding = read('../screens/OnboardingScreen.tsx');
const aiEstimates = read('../screens/AiEstimatesScreen.tsx');

test('the key lives only in the platform credential store, loaded lazily', () => {
  assert.ok(appJson.expo.plugins.includes('expo-secure-store'));
  // A lazy import: a binary without the module reports it unavailable instead of crashing.
  assert.match(keyStore, /import\('expo-secure-store'\)/);
  assert.doesNotMatch(keyStore, /^import .*expo-secure-store/m);
  assert.match(keyStore, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  // The consent record beside it holds no secret.
  const record = keyStore.slice(keyStore.indexOf('interface ManokKeyRecord'), keyStore.indexOf('export interface SecureKeyStorage'));
  assert.doesNotMatch(record, /key:|apiKey|hint/i);
});

test('the key never reaches SQLite, backups, exports, logs, or the Worker', () => {
  for (const path of ['../db/database.ts', '../services/dataBackup.ts', '../services/dataExport.ts']) {
    assert.doesNotMatch(read(path), /userApiKey|SecureStore|googleAiStudioKey|manok-key/);
  }
  for (const source of [keyStore, keySetup, aiSetup]) assert.doesNotMatch(source, /console\./);
  const hosted = foodScan.slice(foodScan.indexOf('async function requestWithEatlogAi'), foodScan.indexOf('function deliver('));
  assert.doesNotMatch(hosted, /loadUserApiKey|getKey|x-goog-api-key/);
  // Shown only as a hint; the screen never renders or copies the key itself.
  assert.doesNotMatch(aiEstimates, /getKey|Clipboard/);
});

test('removing the key discards estimates still running on it', () => {
  const remove = aiSetup.slice(aiSetup.indexOf('const removeKey'), aiSetup.indexOf('const value = useMemo'));
  assert.ok(remove.indexOf('userApiKeyStore.remove()') < remove.indexOf('clearFoodEstimateActions()'));
});

test('Delete all data erases the key last, and a refusal keeps the rest deleted', () => {
  assert.ok(dataReset.indexOf('await initDatabase()') < dataReset.indexOf('await userApiKeyStore.remove()'));
  assert.match(dataReset, /throw new KeyRemovalError\(\)/);
});

test('onboarding offers the AI choice instead of hosted consent', () => {
  assert.match(onboarding, /<AiChoiceContent/);
  assert.doesNotMatch(onboarding, /useRemoteEstimateConsent|RemoteEstimateConsentContent/);
});

test('adding a key checks it with Google before saving, and only a rejection stops the save', () => {
  const save = keySetup.slice(keySetup.indexOf('const save = useCallback'), keySetup.indexOf('return ('));
  assert.ok(save.indexOf('normalizeApiKeyInput') < save.indexOf('checkUserApiKey'));
  assert.match(save, /=== 'rejected'/);
  assert.ok(save.indexOf('checkUserApiKey') < save.indexOf('userApiKeyStore.save'));
  assert.match(keySetup, /Agree and save key/);
});
