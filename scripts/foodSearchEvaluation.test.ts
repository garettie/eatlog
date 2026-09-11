import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/food-search-benchmark-2026-09-11.json';
import { scoreRow, summarizeEvaluation, type EvaluationRow } from './foodSearchEvaluation';

const misses = new Set(['rice', 'white rice', 'brown rice', 'bread', 'egg', 'fried chicken', 'tuna', 'tofu', 'pancakes', 'soda']);
const rows = fixture as EvaluationRow[];

test('frozen common benchmark reproduces every top-three grade', () => {
  const common = rows.filter((row) => row.mode === 'common');
  assert.equal(common.length, 45);
  assert.equal(common.filter((row) => scoreRow(row).failed).length, 15);
  for (const row of common) {
    assert.equal(scoreRow(row).topThree, row.kind === 'success' && !misses.has(row.query), row.query);
    assert.equal(scoreRow(row).topOneWithServing, false, row.query);
  }
  assert.equal(common.filter((row) => scoreRow(row).topThree).length, 20);
  // Oatmeal, banana, pizza, and sandwich hit only below the first row.
  assert.equal(common.filter((row) => scoreRow(row).topOne).length, 16);
});

test('scoring rejects mixed dishes and requires correctness and serving on the same first row', () => {
  const row = rows.find((item) => item.query === 'banana')!;
  assert.equal(scoreRow(row).topOne, false);
  assert.equal(scoreRow({ ...row, top: row.top.map((item) => ({ ...item, serving: '1 medium' })) }).topOneWithServing, false);
  assert.equal(scoreRow({ ...row, top: [{ ...row.top[1], serving: '1 medium' }] }).topOneWithServing, true);
  assert.equal(scoreRow(rows.find((item) => item.query === 'white rice')!).topThree, false);
});

test('provider failures cannot pass on local or partial results', () => {
  const row = rows.find((item) => item.query === 'banana')!;
  const failed = { ...row, kind: 'partial' as const, failures: ['usda: 502'] };
  assert.equal(scoreRow(failed).topThree, false);
  assert.equal(summarizeEvaluation([failed], 1).passed, false);
  assert.equal(summarizeEvaluation([], 0).passed, false);
});
