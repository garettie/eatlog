import assert from 'node:assert/strict';
import test from 'node:test';

import { LEGAL_ATTRIBUTIONS } from './legalAttributions';

test('in-app legal notices cover every required provider, font, software, and app license', () => {
  const notice = LEGAL_ATTRIBUTIONS.map(({ title, detail }) => `${title} ${detail}`).join('\n');
  for (const required of [
    'Open Food Facts',
    'ODbL',
    'Database Contents License',
    'USDA FoodData Central',
    'Google Gemini',
    'Cloudflare',
    'Onest',
    'SIL Open Font License 1.1',
    'Open-source software',
    '0BSD',
  ]) {
    assert.match(notice, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
