import assert from 'node:assert/strict';
import test from 'node:test';

import { getWeightChartDomain } from './weightChartDomain';
import { fromKilograms } from './weightUnits';

function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} !== ${expected}`);
}

test('gives narrow weight data a stable minimum span', () => {
  const domain = getWeightChartDomain([79.6, 80.4], null);

  assertClose(domain.min, 77);
  assertClose(domain.max, 83);
  assert.deepEqual(domain.ticks, [83, 80, 77]);
});

test('includes a cut goal with padding below it', () => {
  const domain = getWeightChartDomain([79.6, 80.4], 70);

  assertClose(domain.min, 68);
  assertClose(domain.max, 82);
  assert.ok((70 - domain.min) / (domain.max - domain.min) >= 0.08);
});

test('includes a bulk goal with padding above it', () => {
  const domain = getWeightChartDomain([79.6, 80.4], 90);

  assertClose(domain.min, 78);
  assertClose(domain.max, 92);
  assert.ok((domain.max - 90) / (domain.max - domain.min) >= 0.08);
});

test('centers constant data within the minimum span', () => {
  const domain = getWeightChartDomain([80, 80], null);

  assertClose(domain.min, 77);
  assertClose(domain.max, 83);
  assert.equal(domain.ticks[1], 80);
});

test('retains a safe fallback without data or a goal', () => {
  assert.deepEqual(getWeightChartDomain([], null), {
    min: 0,
    max: 1,
    ticks: [1, 0.5, 0],
  });
});

test('lands every gridline on a whole number in the display unit', () => {
  const domain = getWeightChartDomain([74.9, 75.6, 72.1], 70, 'lb');

  for (const tick of domain.ticks) {
    const pounds = fromKilograms(tick, 'lb');
    assertClose(pounds, Math.round(pounds));
  }
});

test('keeps padded content inside the snapped domain', () => {
  for (const [low, high] of [[69.5, 75.6], [80.2, 80.3], [55.4, 91.7], [100.49, 100.51]]) {
    for (const unit of ['kg', 'lb'] as const) {
      const domain = getWeightChartDomain([low, high], null, unit);
      const padding = Math.max(4, high - low) * 0.1;
      assert.ok(domain.min <= low - padding + 1e-9, `${unit} ${low}-${high} min ${domain.min}`);
      assert.ok(domain.max >= high + padding - 1e-9, `${unit} ${low}-${high} max ${domain.max}`);
    }
  }
});
