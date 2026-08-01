import assert from 'node:assert/strict';
import test from 'node:test';

import { csv, escapeCsv } from './csv';

test('CSV escapes quotes, commas, and line breaks using RFC 4180 rules', () => {
  assert.equal(escapeCsv('rice, beans'), '"rice, beans"');
  assert.equal(escapeCsv('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsv('first\nsecond'), '"first\nsecond"');
});

test('CSV preserves Unicode, emits empty nulls, and uses CRLF rows', () => {
  assert.equal(csv([['name', 'brand'], ['豆腐', null], ['café', undefined]]), 'name,brand\r\n豆腐,\r\ncafé,\r\n');
});
