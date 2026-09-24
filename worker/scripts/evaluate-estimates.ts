/*
 * The estimate evaluator. Two modes, and they are not the same command with a flag:
 *
 *   --offline           Scores recorded fixtures. No network, no provider, no cost. This is the
 *                       default, and the only mode that runs without an explicit approval flag.
 *   --staging           Sends real requests to a staging Worker and spends real money. It refuses
 *                       to start without --allow-paid-run, a request ceiling, a budget ceiling,
 *                       and per-model rates it can reserve the worst case against.
 *
 * Grants, tokens, installation identifiers, and food text never reach the printed output.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  describeCoverage,
  scoreCase,
  summarize,
  validateManifest,
  type AttemptCost,
  type CaseScore,
  type EvaluationCase,
  type EvaluationManifest,
  type EvaluationResult,
} from '../src/evaluation.js';

interface Options {
  mode: 'offline' | 'staging' | 'validate';
  manifest: string;
  fixtures: string;
  out: string | null;
  allowPaidRun: boolean;
  maxRequests: number;
  budgetUsd: number;
  /** Worst-case tokens one request can consume, used to reserve budget before sending it. */
  worstCaseInputTokens: number;
  worstCaseOutputTokens: number;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  split: 'development' | 'held-out' | 'all';
}

function parseOptions(argv: string[]): Options {
  const flag = (name: string): string | null => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? null : argv[index + 1] ?? null;
  };
  const number = (name: string, fallback: number | null): number | null => {
    const raw = flag(name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number.`);
    return value;
  };
  const here = new URL('.', import.meta.url).pathname;
  const evaluationDir = join(here, '..', 'evaluation');
  const split = flag('split') ?? 'all';
  if (split !== 'development' && split !== 'held-out' && split !== 'all') {
    throw new Error('--split must be development, held-out, or all.');
  }
  return {
    mode: argv.includes('--staging') ? 'staging' : argv.includes('--validate') ? 'validate' : 'offline',
    manifest: flag('manifest') ?? join(evaluationDir, 'cases.json'),
    fixtures: flag('fixtures') ?? join(evaluationDir, 'fixtures'),
    out: flag('out'),
    allowPaidRun: argv.includes('--allow-paid-run'),
    maxRequests: number('max-requests', 0)!,
    budgetUsd: number('budget-usd', 0)!,
    worstCaseInputTokens: number('worst-case-input-tokens', 8_000)!,
    worstCaseOutputTokens: number('worst-case-output-tokens', 4_096)!,
    inputUsdPerMillion: number('input-usd-per-million', null),
    outputUsdPerMillion: number('output-usd-per-million', null),
    split,
  };
}

function loadManifest(path: string): EvaluationManifest {
  if (!existsSync(path)) throw new Error(`No manifest at ${path}.`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const errors = validateManifest(raw);
  if (errors.length > 0) throw new Error(`Manifest is not valid:\n  ${errors.join('\n  ')}`);
  return raw as EvaluationManifest;
}

/** A recorded response, so an offline run scores exactly what a real one produced. */
interface Fixture {
  result: EvaluationResult;
  latencyMs?: number | null;
  costUsd?: number | null;
}

function loadFixture(dir: string, id: string): Fixture | null {
  const path = join(dir, `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as Fixture;
}

async function runStaging(cases: EvaluationCase[], options: Options): Promise<Array<[EvaluationCase, EvaluationResult, AttemptCost]>> {
  if (!options.allowPaidRun) {
    throw new Error('A staging run spends money. Pass --allow-paid-run once the run is approved.');
  }
  if (options.maxRequests <= 0 || options.budgetUsd <= 0) {
    throw new Error('A staging run needs --max-requests and --budget-usd ceilings.');
  }
  if (options.inputUsdPerMillion === null || options.outputUsdPerMillion === null) {
    // Without rates the worst case cannot be reserved, and a budget that cannot be reserved
    // against is a budget that is only checked after the money is gone.
    throw new Error('A staging run needs --input-usd-per-million and --output-usd-per-million to reserve its budget.');
  }
  const workerUrl = process.env.EATLOG_WORKER_URL;
  if (!workerUrl) throw new Error('Set EATLOG_WORKER_URL to the staging origin.');
  const base = new URL(workerUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('EATLOG_WORKER_URL must be a public HTTPS origin without credentials, query, or fragment.');
  }
  const installId = process.env.EATLOG_EVALUATION_INSTALL_ID;
  if (!installId || !/^[a-f0-9]{16,64}$/i.test(installId)) {
    throw new Error('Set EATLOG_EVALUATION_INSTALL_ID to the authorized staging identity.');
  }

  /**
   * Worst case for one logical request: both models attempted, and the regional relay retrying
   * one of them. Reserved before the request is sent, so the run stops before the spend rather
   * than after it.
   */
  const worstCasePerRequest = 3 * (
    (options.worstCaseInputTokens * options.inputUsdPerMillion)
    + (options.worstCaseOutputTokens * options.outputUsdPerMillion)
  ) / 1_000_000;
  const affordable = Math.floor(options.budgetUsd / worstCasePerRequest);
  const ceiling = Math.min(options.maxRequests, affordable, cases.length);
  console.log(`Reserving $${worstCasePerRequest.toFixed(6)} per request; the $${options.budgetUsd} ceiling funds ${affordable}.`);
  if (ceiling <= 0) throw new Error('The budget cannot fund even one request at its worst case.');
  if (ceiling < cases.length) console.log(`Running ${ceiling} of ${cases.length} cases to stay inside the ceilings.`);

  const collected: Array<[EvaluationCase, EvaluationResult, AttemptCost]> = [];
  let reserved = 0;
  for (const entry of cases.slice(0, ceiling)) {
    if (reserved + worstCasePerRequest > options.budgetUsd) break;
    reserved += worstCasePerRequest;
    const body: Record<string, unknown> = { operation: entry.operation };
    if (entry.text) body.text = entry.text;
    if (entry.imagePath) body.imageBase64 = readFileSync(entry.imagePath, 'base64');
    if (entry.context) body.context = entry.context;
    const startedAt = Date.now();
    const response = await fetch(new URL('/v1/estimate', base), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Eatlog-Install-ID': installId,
        'X-Eatlog-Request-ID': `evaluation-${entry.id}-${Date.now().toString(16)}`,
        'X-Eatlog-Request-Version': '2',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35_000),
    });
    const latencyMs = Date.now() - startedAt;
    if (response.status === 429) {
      // A limit is a stop, not something to work around by retrying or by changing identity.
      console.log(`Stopped at ${entry.id}: the service reported a limit.`);
      break;
    }
    if (response.status === 402) {
      // Hosted estimates are Itik-only, so every later case would fail the same way and be
      // scored as unrecognized. Grant the evaluation install complimentary access instead.
      console.log(`Stopped at ${entry.id}: EATLOG_EVALUATION_INSTALL_ID has no Itik entitlement.`);
      break;
    }
    if (!response.ok) {
      console.log(`${entry.id}: HTTP ${response.status}`);
      collected.push([entry, { status: 'unrecognized', components: [] }, { latencyMs, costUsd: null }]);
      continue;
    }
    const result = await response.json() as EvaluationResult;
    // The Worker does not report per-request cost in its response, and this runner does not
    // invent one. Cost comes from the deployment's own logs, reconciled against billing.
    collected.push([entry, result, { latencyMs, costUsd: null }]);
  }
  return collected;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const manifest = loadManifest(options.manifest);
  const selected = manifest.cases.filter((entry) => options.split === 'all' || entry.split === options.split);

  console.log(`Manifest frozen ${manifest.frozenAt}: ${manifest.cases.length} cases, ${selected.length} selected.`);
  for (const row of describeCoverage(manifest.cases)) {
    console.log(`  ${row.category}: ${row.development} development, ${row.heldOut} held out`);
  }
  if (options.mode === 'validate') return;

  const collected: Array<[EvaluationCase, EvaluationResult, AttemptCost]> = options.mode === 'staging'
    ? await runStaging(selected, options)
    : selected.flatMap((entry) => {
      const fixture = loadFixture(options.fixtures, entry.id);
      if (!fixture) {
        console.log(`SKIP ${entry.id}: no recorded fixture.`);
        return [];
      }
      return [[entry, fixture.result, {
        latencyMs: fixture.latencyMs ?? null,
        costUsd: fixture.costUsd ?? null,
      }] as [EvaluationCase, EvaluationResult, AttemptCost]];
    });

  const scores: CaseScore[] = collected.map(([entry, result, cost]) => scoreCase(entry, result, cost));
  for (const score of scores) {
    console.log(`${score.passed ? 'PASS' : 'FAIL'} ${score.id}`);
    for (const finding of score.findings) console.log(`  ${finding.kind}: ${finding.detail}`);
  }

  const summary = summarize(scores);
  console.log('\nSummary');
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'findingCounts') continue;
    console.log(`  ${key}: ${value === null ? 'unknown' : value}`);
  }
  for (const [kind, count] of Object.entries(summary.findingCounts)) console.log(`  ${kind}: ${count}`);
  if (summary.unknownCostCases > 0) {
    console.log(`  note: ${summary.unknownCostCases} cases had unknown cost, so no total is reported.`);
  }

  if (options.out) {
    writeFileSync(options.out, `${JSON.stringify({ frozenAt: manifest.frozenAt, summary, scores }, null, 2)}\n`);
    console.log(`\nWrote ${options.out}.`);
  }
  if (summary.passed < scores.length) process.exitCode = 1;
}

await main();
