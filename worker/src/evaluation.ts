/*
 * Task 8 of the food-estimation plan: a reproducible evaluator.
 *
 * Everything here is pure. It takes a frozen case, a result that was produced for it, and the
 * timing and cost that producing it took, and it says what was wrong. It never calls a provider
 * and never reads the network, so the same scoring runs over recorded fixtures offline and over
 * a paid staging run without one being a different measurement from the other.
 *
 * The scoring deliberately reports unknowns as unknown. A case with no reference calories
 * contributes nothing to calorie error rather than contributing a zero, because a benchmark that
 * quietly counts missing ground truth as agreement is worse than no benchmark.
 */

export type EvaluationSplit = 'development' | 'held-out';

export type EvaluationCategory =
  | 'weighed-simple'
  | 'composite-filipino'
  | 'labeled-product'
  | 'photo'
  | 'redo'
  | 'ambiguous';

export interface ReferenceComponent {
  /** Any of these names counts as this component being present. */
  names: string[];
  /** Cooked, edible grams actually consumed, when they were measured. */
  grams?: number;
  /** True when the component is one a correct answer must not double count, such as cooking oil. */
  singleton?: boolean;
}

export interface EvaluationReference {
  /** Total cooked, edible grams consumed. */
  totalGrams?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  components?: ReferenceComponent[];
  /** Where the reference values came from. Required so a number can be checked, not just trusted. */
  source?: string;
}

export interface EvaluationTolerances {
  /** Fraction, e.g. 0.15 for ±15%. Applied to mass and to each nutrient with a reference value. */
  massFraction?: number;
  nutrientFraction?: number;
  /** Absolute floor, so a reference near zero is not judged by a percentage of almost nothing. */
  nutrientAbsolute?: number;
}

export interface EvaluationCase {
  id: string;
  split: EvaluationSplit;
  category: EvaluationCategory;
  operation: 'scan' | 'describe' | 'clarify-meal' | 'clarify-component';
  /** The description sent, or the meal name for a Redo. */
  text?: string;
  /** A local path to a consented photo. Never inlined into this manifest. */
  imagePath?: string;
  /** Context sent with a Redo case. */
  context?: { mealName?: string; originalDescription?: string; components: Array<{ name: string; estimatedGrams: number }> };
  expectStatus: 'recognized' | 'unrecognized';
  reference?: EvaluationReference;
  tolerances?: EvaluationTolerances;
  /** Component names the answer must not return, such as the parent dish alongside its parts. */
  forbiddenNames?: string[];
  componentRange?: [number, number];
  /** An amount the user stated that the answer has to preserve, in grams. */
  statedGrams?: number;
  notes?: string;
}

export interface EvaluationManifest {
  /** Frozen before any candidate result is looked at. Changing it invalidates a comparison. */
  frozenAt: string;
  cases: EvaluationCase[];
}

export interface ScoredComponent {
  name: string;
  estimatedGrams: number;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
}

export interface EvaluationResult {
  status: 'recognized' | 'unrecognized';
  mealName?: string | null;
  components: ScoredComponent[];
}

export interface AttemptCost {
  /** Milliseconds the whole logical request took, or null when it was not measured. */
  latencyMs: number | null;
  /** USD, or null when a rate or a token count was unknown. Never defaulted to zero. */
  costUsd: number | null;
}

export type FindingKind =
  | 'wrong-status'
  | 'mass-error'
  | 'nutrient-error'
  | 'null-nutrient'
  | 'missing-component'
  | 'double-counted-component'
  | 'forbidden-component'
  | 'component-count'
  | 'stated-amount-lost'
  | 'unknown-latency'
  | 'unknown-cost';

export interface Finding {
  kind: FindingKind;
  detail: string;
}

export interface CaseScore {
  id: string;
  split: EvaluationSplit;
  category: EvaluationCategory;
  passed: boolean;
  findings: Finding[];
  /** Signed relative mass error, or null when the case has no reference mass. */
  massError: number | null;
  calorieError: number | null;
  macroError: number | null;
  latencyMs: number | null;
  costUsd: number | null;
}

const DEFAULT_TOLERANCES: Required<EvaluationTolerances> = {
  massFraction: 0.15,
  nutrientFraction: 0.2,
  nutrientAbsolute: 5,
};

/** Matching key only. Never use this for anything the user reads; it destroys real punctuation. */
function matchKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mentions(name: string, expected: string): boolean {
  return ` ${matchKey(name)} `.includes(` ${matchKey(expected)} `);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Relative error against a reference, with an absolute floor so a reference near zero — a
 * zero-fat food, say — is not judged as infinitely wrong for a rounding difference.
 */
function relativeError(actual: number, reference: number, absoluteFloor: number): number {
  const difference = Math.abs(actual - reference);
  if (difference <= absoluteFloor) return 0;
  if (reference === 0) return difference <= absoluteFloor ? 0 : 1;
  return (actual - reference) / reference;
}

function nutrientTotals(components: ScoredComponent[]): {
  grams: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  nullNutrients: string[];
} {
  let grams = 0;
  let calories: number | null = 0;
  let protein: number | null = 0;
  let carbs: number | null = 0;
  let fat: number | null = 0;
  const nullNutrients: string[] = [];
  for (const component of components) {
    const mass = finiteOrNull(component.estimatedGrams) ?? 0;
    grams += mass;
    const scale = mass / 100;
    const fields: Array<[string, number | null]> = [
      ['calories', component.caloriesPer100g],
      ['protein', component.proteinPer100g],
      ['carbs', component.carbsPer100g],
      ['fat', component.fatPer100g],
    ];
    for (const [field, value] of fields) {
      // A nutrient the service could not determine is unknown, and an unknown one poisons the
      // total rather than being silently added as zero.
      if (value === null) {
        nullNutrients.push(`${component.name}:${field}`);
        if (field === 'calories') calories = null;
        if (field === 'protein') protein = null;
        if (field === 'carbs') carbs = null;
        if (field === 'fat') fat = null;
        continue;
      }
      if (field === 'calories' && calories !== null) calories += value * scale;
      if (field === 'protein' && protein !== null) protein += value * scale;
      if (field === 'carbs' && carbs !== null) carbs += value * scale;
      if (field === 'fat' && fat !== null) fat += value * scale;
    }
  }
  return { grams, calories, protein, carbs, fat, nullNutrients };
}

export function scoreCase(
  evaluationCase: EvaluationCase,
  result: EvaluationResult,
  cost: AttemptCost,
): CaseScore {
  const findings: Finding[] = [];
  const tolerances = { ...DEFAULT_TOLERANCES, ...evaluationCase.tolerances };
  const score: CaseScore = {
    id: evaluationCase.id,
    split: evaluationCase.split,
    category: evaluationCase.category,
    passed: false,
    findings,
    massError: null,
    calorieError: null,
    macroError: null,
    latencyMs: cost.latencyMs,
    costUsd: cost.costUsd,
  };

  if (cost.latencyMs === null) findings.push({ kind: 'unknown-latency', detail: 'No latency was recorded.' });
  if (cost.costUsd === null) findings.push({ kind: 'unknown-cost', detail: 'Cost is unknown; no rate or token count was available.' });

  if (result.status !== evaluationCase.expectStatus) {
    findings.push({
      kind: 'wrong-status',
      detail: `Expected ${evaluationCase.expectStatus}, got ${result.status}.`,
    });
    // A false unrecognized, or a false recognized on deliberate non-food. Nothing else about the
    // answer is worth measuring once it is the wrong kind of answer.
    return score;
  }
  if (result.status === 'unrecognized') {
    score.passed = findings.length === 0;
    return score;
  }

  const totals = nutrientTotals(result.components);
  for (const field of totals.nullNutrients) {
    findings.push({ kind: 'null-nutrient', detail: `${field} was not determined.` });
  }

  const reference = evaluationCase.reference ?? {};
  if (reference.totalGrams !== undefined) {
    score.massError = relativeError(totals.grams, reference.totalGrams, 1);
    if (Math.abs(score.massError) > tolerances.massFraction) {
      findings.push({
        kind: 'mass-error',
        detail: `${Math.round(totals.grams)}g against a reference of ${reference.totalGrams}g.`,
      });
    }
  }

  const nutrients: Array<['calories' | 'protein' | 'carbs' | 'fat', number | undefined, number | null]> = [
    ['calories', reference.calories, totals.calories],
    ['protein', reference.protein, totals.protein],
    ['carbs', reference.carbs, totals.carbs],
    ['fat', reference.fat, totals.fat],
  ];
  const macroErrors: number[] = [];
  for (const [name, referenceValue, actual] of nutrients) {
    if (referenceValue === undefined || actual === null) continue;
    const error = relativeError(actual, referenceValue, tolerances.nutrientAbsolute);
    if (name === 'calories') score.calorieError = error;
    else macroErrors.push(Math.abs(error));
    if (Math.abs(error) > tolerances.nutrientFraction) {
      findings.push({
        kind: 'nutrient-error',
        detail: `${name} ${Math.round(actual)} against a reference of ${referenceValue}.`,
      });
    }
  }
  if (macroErrors.length > 0) {
    score.macroError = macroErrors.reduce((total, value) => total + value, 0) / macroErrors.length;
  }

  for (const expected of reference.components ?? []) {
    const matches = result.components.filter((component) => (
      expected.names.some((name) => mentions(component.name, name))
    ));
    if (matches.length === 0) {
      findings.push({ kind: 'missing-component', detail: `No component matched ${expected.names.join('|')}.` });
      continue;
    }
    // Cooking oil counted once as oil and again inside a sauce is the classic double count.
    if (expected.singleton && matches.length > 1) {
      findings.push({
        kind: 'double-counted-component',
        detail: `${expected.names[0]} appeared ${matches.length} times.`,
      });
    }
    if (expected.grams !== undefined) {
      const grams = matches.reduce((total, component) => total + (finiteOrNull(component.estimatedGrams) ?? 0), 0);
      if (Math.abs(relativeError(grams, expected.grams, 1)) > tolerances.massFraction) {
        findings.push({
          kind: 'mass-error',
          detail: `${expected.names[0]} came to ${Math.round(grams)}g against ${expected.grams}g.`,
        });
      }
    }
  }

  for (const forbidden of evaluationCase.forbiddenNames ?? []) {
    if (result.components.some((component) => matchKey(component.name) === matchKey(forbidden))) {
      findings.push({ kind: 'forbidden-component', detail: `Returned ${forbidden} instead of its parts.` });
    }
  }

  if (evaluationCase.componentRange) {
    const [minimum, maximum] = evaluationCase.componentRange;
    if (result.components.length < minimum || result.components.length > maximum) {
      findings.push({
        kind: 'component-count',
        detail: `${result.components.length} components; expected ${minimum}-${maximum}.`,
      });
    }
  }

  if (evaluationCase.statedGrams !== undefined) {
    // A weighed amount the user typed is an instruction. A label conversion that multiplies it,
    // or a portion guess that overrides it, is the defect this check exists for.
    if (Math.abs(relativeError(totals.grams, evaluationCase.statedGrams, 1)) > 0.02) {
      findings.push({
        kind: 'stated-amount-lost',
        detail: `The user stated ${evaluationCase.statedGrams}g; the answer totals ${Math.round(totals.grams)}g.`,
      });
    }
  }

  score.passed = findings.length === 0;
  return score;
}

export interface EvaluationSummary {
  cases: number;
  passed: number;
  /** Answers that were usable: the right kind of answer, whatever its numeric error. */
  usable: number;
  falseUnrecognized: number;
  falseRecognized: number;
  meanAbsoluteMassError: number | null;
  meanAbsoluteCalorieError: number | null;
  meanAbsoluteMacroError: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  /** Total measured cost divided by usable results, or null when any cost was unknown. */
  costPerUsableResultUsd: number | null;
  /** How many cases contributed no cost, so a total is never mistaken for the whole bill. */
  unknownCostCases: number;
  findingCounts: Record<string, number>;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

export function summarize(scores: CaseScore[]): EvaluationSummary {
  const findingCounts: Record<string, number> = {};
  let falseUnrecognized = 0;
  let falseRecognized = 0;
  let usable = 0;
  for (const score of scores) {
    for (const finding of score.findings) {
      findingCounts[finding.kind] = (findingCounts[finding.kind] ?? 0) + 1;
    }
    const wrongStatus = score.findings.some((finding) => finding.kind === 'wrong-status');
    if (!wrongStatus) usable += 1;
    else if (score.category === 'ambiguous') falseRecognized += 1;
    else falseUnrecognized += 1;
  }
  const costs = scores.map((score) => score.costUsd);
  const unknownCostCases = costs.filter((cost) => cost === null).length;
  const totalCost = costs.reduce<number>((total, cost) => total + (cost ?? 0), 0);
  const latencies = scores.map((score) => score.latencyMs).filter((value): value is number => value !== null);
  return {
    cases: scores.length,
    passed: scores.filter((score) => score.passed).length,
    usable,
    falseUnrecognized,
    falseRecognized,
    meanAbsoluteMassError: mean(scores.map((score) => score.massError).filter((value): value is number => value !== null).map(Math.abs)),
    meanAbsoluteCalorieError: mean(scores.map((score) => score.calorieError).filter((value): value is number => value !== null).map(Math.abs)),
    meanAbsoluteMacroError: mean(scores.map((score) => score.macroError).filter((value): value is number => value !== null)),
    medianLatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    // One unknown cost makes the total a lower bound, and a lower bound is not a cost per result.
    costPerUsableResultUsd: unknownCostCases > 0 || usable === 0 ? null : totalCost / usable,
    unknownCostCases,
    findingCounts,
  };
}

/**
 * Structural validation of a frozen manifest. It runs with no provider access at all, so a
 * dataset can be prepared and checked before anyone is asked to approve a paid run.
 */
export function validateManifest(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['Manifest must be an object.'];
  const manifest = raw as Partial<EvaluationManifest>;
  if (typeof manifest.frozenAt !== 'string' || Number.isNaN(Date.parse(manifest.frozenAt))) {
    errors.push('frozenAt must be an ISO date recording when the dataset was frozen.');
  }
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) return [...errors, 'cases must be a non-empty array.'];

  const seen = new Set<string>();
  for (const [index, entry] of manifest.cases.entries()) {
    const where = `case ${index}`;
    if (!entry || typeof entry !== 'object') { errors.push(`${where}: must be an object.`); continue; }
    if (typeof entry.id !== 'string' || !entry.id.trim()) errors.push(`${where}: id is required.`);
    else if (seen.has(entry.id)) errors.push(`${where}: duplicate id ${entry.id}.`);
    else seen.add(entry.id);
    if (entry.split !== 'development' && entry.split !== 'held-out') {
      errors.push(`${entry.id ?? where}: split must be development or held-out.`);
    }
    if (entry.expectStatus !== 'recognized' && entry.expectStatus !== 'unrecognized') {
      errors.push(`${entry.id ?? where}: expectStatus must be recognized or unrecognized.`);
    }
    if (!entry.text && !entry.imagePath) {
      errors.push(`${entry.id ?? where}: a case needs text or an imagePath.`);
    }
    // A number no one can trace is not a reference value.
    if (entry.expectStatus === 'recognized' && entry.reference && !entry.reference.source) {
      errors.push(`${entry.id ?? where}: reference values need a source.`);
    }
    // Photos live outside the manifest and outside the repository. Inlining one would commit a
    // person's meal photo to version control.
    if (entry.imagePath && /^data:/i.test(entry.imagePath)) {
      errors.push(`${entry.id ?? where}: imagePath must be a local path, not inline image data.`);
    }
  }
  return errors;
}

/**
 * Whether the frozen set is large and balanced enough for the comparison the plan asks for.
 * Reported rather than enforced: a smaller set is still worth running, it just cannot support
 * the same claim, and saying so beats a runner that silently pretends otherwise.
 */
export function describeCoverage(cases: EvaluationCase[]): { category: EvaluationCategory; development: number; heldOut: number }[] {
  const categories: EvaluationCategory[] = [
    'weighed-simple', 'composite-filipino', 'labeled-product', 'photo', 'redo', 'ambiguous',
  ];
  return categories.map((category) => ({
    category,
    development: cases.filter((entry) => entry.category === category && entry.split === 'development').length,
    heldOut: cases.filter((entry) => entry.category === category && entry.split === 'held-out').length,
  }));
}
