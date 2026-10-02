import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { MealType } from '../db/database';

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../components/sheet-states/ReviewState.tsx'), 'utf8');
const ast = ts.createSourceFile('ReviewState.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const review = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'ReviewState');
assert.ok(review?.body);
const statements = review.body.statements;
function declaration(name: string) {
  const statement = statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item =>
    ts.isIdentifier(item.name) ? item.name.text === name : ts.isArrayBindingPattern(item.name) && item.name.elements.some(element =>
      ts.isBindingElement(element) && ts.isIdentifier(element.name) && element.name.text === name)));
  assert.ok(statement, `Missing declaration: ${name}`);
  return statement.getText(ast);
}
const reset = statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
  && node.expression.expression.getText(ast) === 'useEffect' && node.getText(ast).includes('previousResultRef.current'));
assert.ok(reset);

// Run the component's actual selection initialization, result reset, and Save
// callback with persistent hook slots. Native rendering is outside this test.
const code = ts.transpileModule(`function render(result, initialMeal) {
  ${declaration('meal')}
  ${declaration('previousResultRef')}
  ${reset.getText(ast)}
  ${declaration('handleLogMeal')}
  return { meal, setMeal, save: handleLogMeal };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function mountedReview() {
  const slots: any[] = [];
  let cursor = 0, changed = false;
  let effects: (() => void)[] = [];
  const writes: { meal_type: MealType; components: { meal: MealType }[] }[] = [];
  const noop = () => {};
  const context: Record<string, any> = {
    defaultMealForNow: () => 'snack',
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next: any) => {
        const value = typeof next === 'function' ? next(slots[index]) : next;
        if (!Object.is(value, slots[index])) { slots[index] = value; changed = true; }
      }];
    },
    useRef: (initial: any) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect: (callback: () => void, dependencies: unknown[]) => {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => !Object.is(value, slots[index][i]))) effects.push(callback);
      slots[index] = dependencies;
    },
    useCallback: (callback: unknown) => callback,
    originalMealNameRef: { current: '' }, dirtyRef: { current: false }, loggedRef: { current: false },
    setMealName: noop, setComponents: noop, setDivision: noop, setEatenPortions: noop,
    clearEditorDrafts: noop, setEditorOpen: noop, setAddOpen: noop, jumpToView: noop,
    setNutritionExpanded: noop, setUndoAction: noop, toEditable: (value: unknown) => value,
    components: [{ portionValid: true, food: { name: 'Synthetic food', source: 'manual' }, selection: {}, per100g: {} }],
    componentNameChanged: () => false, mealName: 'Synthetic meal', editMealId: 42,
    effectiveLogDate: '2026-10-01', selectedPhotoUri: null, totalMacros: { calories: 100 },
    setLogError: noop, setLogging: noop, onLogComplete: noop, console,
    recordedPortionValues: () => ({ calories: 100, protein_g: 5, carbs_g: 15, fat_g: 2 }),
    saveMealWithComponents: async (value: any) => { writes.push(value); return { mealId: 42, logIds: [1] }; },
  };
  runInNewContext(code, context);
  return {
    writes,
    render(result: object | null, initialMeal?: MealType) {
      for (let pass = 0; pass < 10; pass++) {
        cursor = 0; changed = false; effects = [];
        const output = context.render(result, initialMeal) as { meal: MealType; setMeal: (meal: MealType) => void; save: () => Promise<void> };
        effects.forEach(effect => effect());
        if (!changed) return output;
      }
      throw new Error('Review state did not settle');
    },
  };
}

const result = () => ({ mealName: 'Synthetic meal', components: [] });

test('opening an imported lunch after a snack selects and saves lunch', async () => {
  const review = mountedReview();
  assert.equal(review.render(result(), 'snack').meal, 'snack');
  const lunch = review.render(result(), 'lunch');
  assert.equal(lunch.meal, 'lunch');
  await lunch.save();
  assert.equal(review.writes[0].meal_type, 'lunch');
  assert.ok(review.writes[0].components.every(food => food.meal === 'lunch'));
});

test('reopening the same saved section discards the previous unsaved section choice', () => {
  const review = mountedReview();
  const first = result();
  review.render(first, 'lunch').setMeal('snack');
  assert.equal(review.render(first, 'lunch').meal, 'snack');
  assert.equal(review.render(result(), 'lunch').meal, 'lunch');
});

test('loading a saved meal into a mounted empty review uses its saved section', () => {
  const review = mountedReview();
  assert.equal(review.render(null).meal, 'snack');
  assert.equal(review.render(result(), 'lunch').meal, 'lunch');
});

test('ordinary rerenders preserve an intentional section edit until saved', async () => {
  const review = mountedReview();
  const meal = result();
  review.render(meal, 'lunch').setMeal('dinner');
  const edited = review.render(meal, 'lunch');
  assert.equal(edited.meal, 'dinner');
  await edited.save();
  assert.equal(review.writes[0].meal_type, 'dinner');
});

test('all saved sections load in sequence and a new unscheduled meal resets to the current default', () => {
  const review = mountedReview();
  for (const section of ['snack', 'lunch', 'breakfast', 'dinner'] as const) {
    assert.equal(review.render(result(), section).meal, section);
  }
  assert.equal(review.render(result()).meal, 'snack');
});
