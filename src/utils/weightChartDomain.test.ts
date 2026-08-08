import assert from 'node:assert/strict';
import test from 'node:test';

import { getWeightChartDomain } from './weightChartDomain';

function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} !== ${expected}`);
}

test('gives narrow weight data a stable minimum span', () => {
  const domain = getWeightChartDomain([79.6, 80.4], null);

  assertClose(domain.min, 77.6);
  assertClose(domain.max, 82.4);
  assert.deepEqual(domain.ticks, [domain.max, 80, domain.min]);
});

test('includes a cut goal with padding below it', () => {
  const domain = getWeightChartDomain([79.6, 80.4], 70);

  assertClose(domain.min, 68.96);
  assertClose(domain.max, 81.44);
  assert.ok((70 - domain.min) / (domain.max - domain.min) >= 0.08);
});

test('includes a bulk goal with padding above it', () => {
  const domain = getWeightChartDomain([79.6, 80.4], 90);

  assertClose(domain.min, 78.56);
  assertClose(domain.max, 91.04);
  assert.ok((domain.max - 90) / (domain.max - domain.min) >= 0.08);
});

test('centers constant data within the minimum span', () => {
  const domain = getWeightChartDomain([80, 80], null);

  assertClose(domain.min, 77.6);
  assertClose(domain.max, 82.4);
  assert.equal(domain.ticks[1], 80);
});

test('retains a safe fallback without data or a goal', () => {
  assert.deepEqual(getWeightChartDomain([], null), {
    min: 0,
    max: 1,
    ticks: [1, 0.5, 0],
  });
});
