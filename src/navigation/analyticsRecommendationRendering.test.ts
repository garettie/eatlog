import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../screens/AnalyticsScreen.tsx'), 'utf8');
// Execute the screen's actual JSX branches without importing native modules.
const start = source.indexOf('  const confirmationDay =');
const end = source.indexOf('  const requestedCalorieMonthLabel', start);
assert.ok(start >= 0 && end > start);
const code = ts.transpileModule(`${source.slice(start, end)}\nglobalThis.card = recommendationCard;`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const pauseStart = source.indexOf('const ADAPTIVE_PAUSE_COPY:');
const pauseEnd = source.indexOf('const RANGE_OPTIONS', pauseStart);
const pauseCode = ts.transpileModule(source.slice(pauseStart, pauseEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

interface Node {
  type: unknown;
  props: Record<string, any>;
}

function render(recommendation: unknown, overrides: Record<string, unknown> = {}) {
  const context = {
    React, View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
    EvidenceTile: 'EvidenceTile', MaterialIcons: 'MaterialIcons', M3: {},
    recommendation, recommendationError: false, recommendationLoading: false,
    displayDate: (value: string) => value, target: { target_calories: 2000 },
    confirmingIntakeDate: null, onOpenWeight: () => {}, navigation: { navigate: () => {} },
    card: null,
    ...overrides,
  };
  runInNewContext(pauseCode + code, context);
  const nodes: Node[] = [];
  const visit = (node: any) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object' && node.props) {
      nodes.push(node);
      visit(node.props.children);
    }
  };
  visit(context.card);
  return nodes;
}

const holding = {
  kind: 'holding', reason: 'insufficient_evidence', confirmationDays: [],
  eligibility: {
    intakeDayCount: 3, requiredIntakeDayCount: 10,
    weightLogCount: 2, requiredWeightLogCount: 4,
    endpointSpanDays: 10, requiredEndpointSpanDays: 14,
    hasRecentWeight: false, daysSinceLastWeight: 20, maximumDaysSinceLastWeight: 7,
  },
};

test('completed insufficient evidence shows evidence and a working weigh-in action instead of loading', () => {
  let opened = false;
  const nodes = render(holding, { onOpenWeight: () => { opened = true; } });
  assert.equal(nodes.some(node => node.type === 'ActivityIndicator'), false);
  assert.deepEqual(nodes.filter(node => node.type === 'EvidenceTile').map(node => [node.props.label, node.props.value, node.props.total]), [
    ['Food days', 3, 10], ['Weigh-ins', 2, 4], ['Days covered', 10, 14],
  ]);
  const action = nodes.find(node => node.props.accessibilityLabel === 'Add weigh-in for plan update');
  assert.ok(action);
  action.props.onPress();
  assert.equal(opened, true);
});

for (const reason of ['tdee_floor_conflict', 'macro_target_infeasible', 'target_out_of_policy']) {
  test(`completed paused review (${reason}) shows a working settings action instead of loading`, () => {
    let destination: unknown[] = [];
    const nodes = render({ kind: 'paused', reason }, { navigation: { navigate: (...args: unknown[]) => { destination = args; } } });
    assert.equal(nodes.some(node => node.type === 'ActivityIndicator'), false);
    const action = nodes.find(node => node.props.accessibilityLabel === 'Review plan settings');
    assert.ok(action);
    action.props.onPress();
    assert.equal(destination[0], 'Profile');
  });
}

test('scheduled reviews and intake confirmations still render their completed states', () => {
  for (const recommendation of [
    { kind: 'next-review', nextReviewDate: '2026-09-12' },
    { ...holding, reason: 'intake_confirmation_required', confirmationDays: [{ date: '2026-09-04', calories: 800 }] },
  ]) {
    assert.equal(render(recommendation).some(node => node.type === 'ActivityIndicator'), false);
  }
});

test('an unresolved review still shows loading, and no plan check stands in front of it', () => {
  assert.equal(render(null).some(node => node.type === 'ActivityIndicator'), true);
  assert.equal(render(holding).some(node => node.type === 'Text' && /Checking your plan/.test(String(node.props.children))), false);
});
