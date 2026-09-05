# Food-estimation implementation plan

Date: 2026-09-05. Status: planned; no implementation or release performed.

Inputs: [service assessment](../../docs/research/2026-09-05-food-estimation-service-review.md), [provider research](../../docs/research/2026-09-05-food-estimation-provider-review.md), and the user's goals of minimal friction, very low failure, and cost efficiency. This is the Quick planning path for an already established brief; 12 implementation tasks, grouped into five milestones.

## Success criteria

| ID | Required outcome |
| --- | --- |
| C1 | Unknown/invalid nutrients never become zero; explicit consumed amounts survive normalization; no materially incomplete result is silently presented as complete. |
| C2 | One logical action has one quota charge; duplicate transport requests share work/results when available; every new generation is bounded and accounted for. |
| C3 | Provider outages do not create customer day-long lockouts; every response stage fits a deadline; recovery and cancellation preserve user input. |
| C4 | Per-model attempt cost and final request outcomes are measurable without logging food or identifiers. |
| C5 | Model and prompt changes pass a frozen, representative accuracy/latency/cost evaluation, including photos and Redo. |
| C6 | Installed clients, consent, subscription authority, quotas, and migration rollback remain compatible. |

Proposed initial service objective: at least 99.5% usable results for valid, online, authorized inputs inside the existing 35-second client request deadline. Count provider failures and false unrecognized results against that objective; exclude deliberate cancellation, true non-food, declined consent, and legitimate limits. Also report product-limit rejections separately so they cannot hide friction. This is a target, not measured current performance.

For model promotion, require all deterministic amount/label/contract checks to pass, no newly introduced severe errors on held-out examples, no worsened aggregate nutrition error or valid-result rate, and p95 latency no worse than the baseline. A cost increase requires a demonstrated reduction in material errors or user corrections. Freeze exact dataset tolerances before viewing candidate results; report uncertainty and category-specific results rather than treating a small set as an availability guarantee.

## Decisions and tradeoffs

- Keep `gemini-3.1-flash-lite` first and `gemini-3.5-flash-lite` second initially, for all current tiers. Immediate replacement could change accuracy and latency without addressing the confirmed defects. Do not restore 2.5 Lite without reconfirming project access; the runbook records 404 responses.
- Prefer strict numeric validation plus safe metadata repair. Rejecting every metadata defect increases failures; accepting guessed zeros creates false precision. Essential missing nutrition triggers bounded provider recovery, while unusable optional serving metadata can become null without changing consumed grams.
- Prefer a random ID per intentional action, retained across transport retries, plus Worker-side execution claims. Payload-only hashes conflate repeated meals; client-only deduplication cannot coordinate concurrent requests across Worker isolates.
- Prefer bounded **memory-only** result replay in the existing Durable Object coordination path: normalized result only, 120-second TTL, 64 KiB maximum per result and 4 MiB total memory budget, evict expired/oldest completed entries first. Never persist food text, image bytes, or result JSON in quota storage. Durable result replay would survive restarts but adds a food-retention commitment and is outside this implementation.
- Memory-only replay does not guarantee exactly-once external inference across process loss. A crash or eviction may require a controlled new provider execution. Track that execution and bound it; do not promise exactly-once billing or silently start unbounded replacements.
- Use existing local logging/reuse and existing UI surfaces for recovery. Avoid parallel speculative model calls, mandatory clarification questions, new provider integrations, and screen redesign.

## Milestone 1 — Establish reliable regression coverage

### 1. Preserve the baseline and reproduce the known defects

Criteria: C1–C6. Dependencies: none.

Files: `worker/test/index.test.ts`, `worker/test/subscriptions.test.ts`, `src/services/foodScan.test.ts`, `src/services/foodScanContract.test.ts`; new `worker/test/subscriptionDurableObject.test.ts` and the smallest local runtime harness required by that test.

- Port the seven synthetic probes from the assessment into regression tests in their owning suites. Keep provider calls mocked and clocks controllable.
- Exercise the actual Durable Object class and SQLite operations in a Workers-compatible local runtime, using the existing Wrangler tooling where practical. Do not copy the production SQL into a mock and call that runtime coverage.
- Cover concurrent reserve/finalize/refund, repeated failed IDs, failed bookkeeping, process restart, and stale completion. Run equivalent cases against the memory store to expose behavioral differences.
- Capture baseline model/prompt/config values, test results, and current deployed-client compatibility requirements. Preserve unrelated changes in the working tree.

Verification: reproduce each reported defect independently; existing tests remain green except the explicit new regression cases while under repair. Each subsequent milestone must turn its own failures green. No live API access is needed.

## Milestone 2 — Correct estimates and bound complete requests

### 2. Make nutrient and portion normalization trustworthy

Criteria: C1. Dependency: 1.

Files: `worker/src/index.ts` (`normalizeGeminiResponse`, `normalizeCountedServing`), `src/services/foodScanContract.ts`, related Worker/client contract tests. Extract an estimate-specific helper only if both runtime validation and evaluation need it; leave USDA coercion unchanged.

- Require actual finite numbers for generated nutrients and masses; reject null, booleans, numeric strings, empty strings, NaN, and infinities. Preserve legitimate zero nutrients.
- Use the existing 10,000g component limit consistently on generated total/serving masses. Start with broad hard density bounds of 0–1,000 kcal and 0–100g for each macro per 100g. Verify label rounding edge cases before enforcing any summed-macro bound. These are corruption checks, not nutrition truth checks.
- Treat calorie-versus-macro disagreement as a quality signal initially, not an exact 4/4/9 rejection rule. Account for legitimate fiber/alcohol/polyol/label conventions in evaluation.
- Never recalculate consumed grams solely from a counted serving label. Preserve valid total grams; retain one-unit serving metadata only when its interpretation is defensible, otherwise clear the ambiguous serving pair. Do not invent a per-cookie mass from contradictory data.
- Handle structurally malformed app responses with safe type guards so validation failures stay `invalid-response`, not thrown exceptions mislabeled as network errors. Preserve all material components or recover the estimate; do not drop one silently.

Verification: the null-nutrient, impossible-density, 30g-cookie, scan-label, fractional count, zero-fat, shared-meal, and Redo tests pass. Test both 3 cookies totaling 30g and 3 cookies at 30g each as distinct cases; normalization must not pretend they are distinguishable from ambiguous metadata alone.

### 3. Apply deadlines through body consumption and regional retry

Criteria: C3, C6. Dependency: 1.

Files: `worker/src/index.ts` (`handleRequest`, `fetchWithTimeout`, `readUpstreamJson`, `geminiEstimate`), `worker/src/geminiRelay.ts`, `worker/src/subscriptionStore.ts`, `src/services/foodScan.ts`, Worker/client tests.

- Retain the client's 35-second request deadline. Introduce a Worker deadline measured from handler entry, initially 29 seconds, with up to 26 seconds of provider work constrained by time already spent. Treat the six-second transit allowance as a hypothesis to verify on a phone, not a guaranteed bound for slow uploads.
- Apply remaining-time limits to request-body reading, authorization, state calls, provider headers and bodies, relay processing, and final bookkeeping. Bound bodies as they are streamed, not only after buffering them. Use existing request limits, 256 KiB for RevenueCat, and an initial 256 KiB cap for Gemini JSON/error envelopes.
- Keep each abort active until body parsing finishes; cancel readers on timeout/overflow. Bound state calls and cleanup using the same deadline and preserve remaining time for result delivery.
- Preserve the nine-second fallback floor when enough time remains. If authorization consumed too much time for two useful attempts, choose one adequately budgeted attempt rather than two doomed calls.
- Pass a trusted remaining duration to the relay and enforce it on the relay's inner fetch and body. Preserve same-model retry on location refusal and carry the relay path into later attempts. Verify the actual runtime's abort behavior; a raced timeout must not be mistaken for upstream cancellation.

Verification: deterministic delayed-header, delayed-body, partial-JSON, oversized-body, hung-authorization, hung-state, and relay-timeout tests complete inside their budgets. At least one default-runtime handler test remains. Validate slow-upload and cold-start behavior on the physical preview phone before release.

### 4. Separate provider recovery from abuse limits

Criteria: C3, C4, C6. Dependencies: 1, 3.

Files: `worker/src/index.ts`, `worker/src/subscriptions.ts`, `worker/src/subscriptionStore.ts`, `worker/src/subscriptionDurableObject.ts`, quota/runtime tests.

- Classify recognized success, true unrecognized content, provider timeout/network/overload, blocked/invalid provider output, and caller cancellation separately.
- Refund unusable service results without counting infrastructure/provider defects toward `REFUND_DAILY_LIMIT`. Count a true unrecognized generation once toward the existing content-abuse ceiling. Preserve the ordinary free/trial/paid product limits.
- Add an explicit failure reason to new quota attempt metadata. Existing `refunded` rows have unknown cause: keep their history, but exclude them from the new content-specific abuse count so old outages cannot preserve a lockout.
- Count real attempts consistently in memory and SQLite. Replaying a failure/result is not another generation; a new authorized generation is a new attempt even when the user supplied identical content.
- Classify provider errors before retrying: transient network/429/5xx may fall through within the deadline; shared invalid credentials/schema errors stop; model-not-found can use a configured available fallback; location refusals use the same-model relay. Bound backoff/jitter by remaining time and avoid stacked client/server retry loops.
- Return a reset timestamp for actual content-abuse limits. Keep per-install/IP/emergency throttles while measuring them; do not remove cost protection along with outage penalties.

Verification: five distinct provider failures followed by recovery permit the next estimate; repeated true unrecognized generations still reach their intended cap; duplicate responses do not increase that cap. Every tier and old/new refund row combination passes runtime tests.

## Milestone 3 — Make retry behavior and cost predictable

### 5. Implement coordinated execution and short result replay

Criteria: C2, C3, C6. Dependencies: 1, 3, 4.

Files: `worker/src/index.ts`, `worker/src/subscriptions.ts`, `worker/src/subscriptionStore.ts`, `worker/src/subscriptionDurableObject.ts`, Worker/runtime tests; new small execution helper only if needed to keep the state machine independently testable.

- Define states `running`, `succeeded`, `failed-retryable`, and `failed-terminal`, separate from quota accounting. Atomically claim one execution using a lease owner/generation token and deadline. Only the matching execution may complete/refund; late completions cannot alter its replacement.
- Bind the action ID to subject, access-eligible operation, and a server-computed keyed fingerprint of validated content. Reject same-ID/different-content reuse. Verify operation entitlement before returning any duplicate result, preventing a prior initial estimate from bypassing paid Redo access.
- Coordinate duplicates through the same Durable Object, share pending completion, and replay only normalized results under the memory bounds above. Return clones to callers. Do not hold storage/concurrency gates across provider I/O or serialize unrelated users behind one slow generation.
- Limit one logical action to two provider executions, each with the existing bounded model-attempt policy. Permit a second only after an explicit retryable failure or a safely expired lease; a live duplicate cannot acquire a second execution. Record unknown completion separately when a Worker dies after an upstream call.
- If the completed result has been evicted or the object restarted, attempt client recovery first; a regeneration must obtain a new execution claim and be accounted for. Exhaustion returns a clear retryable failure while retaining the user's draft; no endless auto-retry.
- Add metadata schema changes additively and transactionally. Keep old quota state and subject identity intact. Existing finalized rows without a fingerprint/replayable result must not authorize free repeated generation.

Verification: ten concurrent duplicates produce one execution and one quota charge; completed retries produce no provider call while replay is available; conflicts and paid-operation bypass attempts fail before Gemini. Exercise lost responses, memory eviction, object restart, lease expiry, late success/refund, and exhausted execution bounds. Distinguish quota-at-most-once from external-provider exactly-once, which is not guaranteed across crashes.

### 6. Give app actions stable retry identity and useful recovery

Criteria: C2, C3, C6. Dependency: 5.

Files: `src/services/foodScan.ts`, `src/components/sheet-states/FoodSheetContent.tsx`, `DescribeInputState.tsx`, `SearchInputState.tsx`, the current Redo callers, and related service/navigation tests. Re-read callers when implementing because unrelated review-sheet work is active.

- Create a random action ID for a new intentional estimate; preserve it across Retry of the unchanged draft/photo. A changed payload or a new estimate after completion gets a new action ID. Use a request-version header rather than changing the existing JSON body contract.
- Coalesce in-flight work within the client and retain successful results in memory while the draft/action is recoverable. Bound and clear this cache on expiry, consent withdrawal, entitlement/identity change, and Delete all data.
- Pass cancellation signals through the service. Leaving a screen detaches that view without spawning replacement work; an explicit cancel aborts the caller. Cancel must not terminate another subscriber to shared work or claim that already-consumed provider tokens were refunded by Google.
- Preserve typed failures through meal/component Redo; show the service's relevant retry/reset message in existing surfaces. Keep photo/text and editor drafts available, with manual/search alternatives. Enforce the existing 2,000-character Describe limit before upload with useful feedback.
- Keep no automatic app-level retry in the first release. The Worker owns provider recovery; explicit Retry can reuse the action/result. This avoids multiplying existing fallback calls.

Verification: same draft Retry reuses its ID; a new identical meal gets a new ID; duplicate taps share work; cancellation prevents stale UI mutation; Redo retains failure categories and dirty drafts. Verify existing screens on a physical Android preview device, including cancel/back, timeout/retry, quota reset, consent withdrawal, and saved-meal reuse.

### 7. Measure every attempt and final outcome accurately

Criteria: C4. Dependencies: 3, 4; integrate execution/replay outcomes after 5.

Files: `worker/src/index.ts` (`logAiUsage`, `logOperational`), `worker/src/subscriptions.ts` (`aggregateAiUsage`), Worker configs/tests, `release/runbooks/WORKER_RELEASE.md`.

- Replace the shared rate pair with a small explicit per-model pricing table or validated per-model config, dated and verified against the provider at implementation. Missing usage/rates stay unknown, never zero.
- Log input, candidate output, thoughts, and cached input separately, with provider-specific accounting that avoids adding cached input twice. Include usage from malformed/truncated attempts whenever the provider supplied it. A replay records zero new provider work.
- Emit one attempt event and one logical-request outcome with operation, model, finish/failure category, elapsed time, attempt number/count, replay status, and estimated cost where known. Use bounded enums. Remove free-form upstream error messages that can echo food text.
- Update the log allowlist and privacy tests together. Keep identifiers, fingerprints, food text/images, grants, and provider bodies out. Record unknown-cost timed-out attempts and reconcile with provider totals.
- Keep console sampling explicit in metric interpretation; use aggregate ratios/percentiles with sample size disclosed. Select staging sampling needed for the finite benchmark and restore its baseline afterward. Do not extrapolate unweighted sampled log sums into a bill.

Verification: multi-attempt and thought-token fixtures match hand-calculated totals for both models; invalid responses still record usage; no duplicate final outcomes; privacy allowlist tests reject sensitive/free-form fields. A new runtime test covers the non-injected logging path.

## Milestone 4 — Prove prompt and model quality

### 8. Replace the four-case smoke with a reproducible evaluator

Criteria: C1, C4, C5. Dependencies: 2, 3, 7.

Files: `worker/scripts/evaluate-estimates.mjs`, `worker/package.json`; new `worker/test/evaluation.test.ts`, `worker/evaluation/README.md`, `worker/evaluation/cases.json`, and local-only output/fixture paths documented there.

- Support offline fixture evaluation and separately invoked paid staging evaluation. Include required request IDs, supported access/grant handling, deadlines, request counts, stop-on-budget/429, and deterministic result summaries. Never print grants or tokens.
- First freeze 60 cases: 15 weighed/simple descriptions, 15 composite Filipino/Taglish descriptions, 10 labeled products, 10 consented plated/shared-dish photos, 5 meal/component Redo cases, and 5 ambiguous/non-food inputs. Split 40 development/20 held-out cases before tuning. A fixture may have several explicit assertion types.
- Attach source/reference nutrition, cooked edible grams, acceptable label-rounding tolerances, and expected material components. Images must have permission and measured reference data; do not fabricate photos or nutrition ground truth. Keep personal fixtures/results outside tracked/public artifacts.
- Report mass, calorie and macro error, material omission/double-counting, quantity preservation, label conversion, Redo preservation, false unrecognized/false recognized outcomes, latency and cost per usable result. Include absolute error when reference values are near zero.
- Preserve the original prompt/model configuration as a baseline fixture before edits. Baseline and candidates must run through the same validation/scoring, while a separate comparison records the improvement from the old validator itself.

Verification: offline evaluator tests detect deliberately wrong grams, null nutrients, duplicated oil, wrong label conversion, and unknown latency/cost. Staging runner cannot execute accidentally in offline mode and stops at its request/budget ceilings. Dataset manifest validates without needing paid calls.

### 9. Test focused prompt and output-budget changes

Criteria: C1, C5. Dependency: 8; paid run gate applies.

Files: `worker/src/index.ts` (prompt constants, `promptFor`, generation config, candidate parsing), Worker tests, evaluation fixtures and aggregate reports under `docs/research/`.

- Tighten precedence for consumed quantity, corrected identity, readable label nutrition, visible food, and inferred recipe defaults. Resolve the one-labeled-serving versus whole-dish versus user-stated-amount conflict explicitly.
- Preserve ingredient-level breakdown, material completeness, countable serving units, minimal source context, and existing request-size guards. Add rules by replacing redundant wording; justify any byte-budget increase with a measured result.
- Test image-before-text ordering; cooked/dry/reconstituted state; density versus portion; single versus multi-serving labels; fractional servings; hidden oil/sauce counted once; and preservation of amount/name punctuation.
- Join non-thought text parts, inspect finish reasons, and classify blocked/truncated/invalid responses before fallback. Evaluate 2,048 versus 4,096 maximum output tokens on crowded plates; do not raise the cap merely because it is available.
- Pin minimal thinking only for the current Lite models after exact-contract validation. Keep temperature and image resolution unchanged initially. Evaluate lower media resolution only as a later isolated experiment if label accuracy is unaffected.

Verification: compare baseline and each change separately; repeat ambiguous/crowded cases three times. No model routing changes during prompt comparison. Merge only changes passing the frozen gates; preserve unsuccessful experiments in results, not production code.

### 10. Choose routing from measured usable-result cost

Criteria: C4, C5. Dependency: 9; paid run gate applies.

Files: `worker/src/index.ts` (model lists/routing), Worker tests, evaluation runner and aggregate report, `release/runbooks/WORKER_RELEASE.md`.

- Compare the existing two Lite models with the winning prompt. Evaluate a stronger currently available model only if material errors remain and its current exact API/schema/settings are verified.
- Use a local evaluation-only single-model override or separate staging revision; never accept arbitrary model names/settings from public app requests. Do not add a public quota bypass or benchmark endpoint.
- Keep cheapest routing that passes accuracy, latency, and valid-result gates. Retain 3.1-first if neither alternative wins. Add operation-specific routing or selective escalation only if the data justifies it; self-reported confidence alone is not a gate.
- Record the chosen model IDs, price date, limits, measured distribution, fallback trigger/order, and retirement reminder. Confirm actual project access, rather than inferring it from a public model card.

Verification: held-out comparison across all categories, no unexplained latency regressions, no literal quantity/label contract failures, and an explicit cost/quality decision. Make model promotion a separate reversible change from structural service fixes.

## Milestone 5 — Ship compatibly and verify real usage

### 11. Validate compatibility, quotas, migration, and rollback

Criteria: C2, C3, C6. Dependencies: 2–7; model/prompt changes from 9–10 may ship later.

Files: `worker/test/config.test.ts`, actual runtime tests, `worker/wrangler.subscription-staging.jsonc`, `worker/wrangler.subscription-production.jsonc`, `release/runbooks/WORKER_RELEASE.md`, app service tests.

- Introduce the new execution protocol Worker-first and advertise it through a response header. Test old client/new Worker and new client/old Worker fixtures. New app deployments requiring coordinated retry must wait until the supporting Worker is healthy.
- For old payload-hash IDs, deduplicate only within the bounded retry window, then assign a new internal action/execution ID and apply normal quota. Historical finalized rows must not mean permanent free generation. Operation eligibility remains mandatory for legacy duplicates too.
- Keep additive metadata and a versioned execution ledger isolated from old quota data. Test upgrade from a populated database, migration rerun, and rollback read behavior. Do not erase historical quota, change quota identity, reset trial usage, or backfill fabricated failure reasons.
- Confirm whether any supported app still uses the legacy Worker. Verify its continued compatibility separately; do not deploy a subscription entry point onto its name. Preserve the existing regional retry, config isolation, and no custom Free-plan limits block.
- Record a rollback Worker version that understands the new metadata/protocol before enabling the new app path. Old application code may still run, but an old Worker that reintroduces free duplicate execution is not an acceptable ongoing rollback target; prepare a compatible fallback build first.

Verification: old/new protocol matrix and actual SQLite upgrade/rollback tests pass; staging/production dry runs pass; no paid access demotion, trial reset, or duplicate-charge regression. Recover from each simulated migration/Worker failure without deleting stored state.

### 12. Run approved staging checks and observe rollout

Criteria: C1–C6. Dependency: 11; include 8–10 when promoting prompt/models.

Files: `release/runbooks/WORKER_RELEASE.md`, evaluation reports under `docs/research/`, relevant Worker configs only if measured tuning is needed.

- Follow the existing explicit paid-smoke and deployment approvals. Before asking for paid evaluation, prepare the dataset, offline checks, exact model/request matrix, credentials via owner-controlled configuration, and a conservative cost ceiling including retries/thinking. Initial pilot proposal: up to 40 logical requests under a $1 ceiling, with no evaluator-level retries. Reserve each request's worst-case input/output cost across both models and the possible regional retry before sending it; reduce the request count if that maximum cannot fit. A local stop after a response is not sufficient to enforce the budget. The full benchmark is a separately budgeted batch, not an implicit continuation.
- Use an authorized staging test identity with sufficient legitimate allowance for the finite run. Respect rate limits; do not rotate identities to evade them. Confirm project quota and provider billing/alerts before load tests. Never stress production to test fallback.
- Verify real Scan/Describe/Redo, slow mobile networking, region-refusal recovery, input retention, cancellation, reuse, and quota messages on the standalone preview phone. Capture before/after screenshots for changed UI behavior; no emulator creation.
- Roll out the compatible Worker before the app. Track final usable-result rates, p50/p95/p99 by operation, false unrecognized reports, timeout/fallback rate, quota rejection reasons, and estimated/reconciled cost. Measure IP throttling before changing limits; mobile shared-IP protection and global provider budget are different controls.
- Hold or roll back for a reproduced amount/label regression, paid-access failure, outage lockout, duplicate quota charge, uncontrolled execution multiplication, or unbounded deadline. Compare with baseline over comparable traffic/time periods; sparse traffic is insufficient evidence of 99.5% availability.
- Monitor long enough to include normal meal-time peaks and provider variation. Six hundred zero-failure independent trials give only a rough upper 95% failure bound near 0.5%; correlated outages still require longitudinal observation.

Verification: recorded deployed versions, approved finite-run receipts, phone checks, privacy-safe metrics and billing reconciliation, and a tested rollback target. Record unknowns honestly. A successful `/healthz` alone does not establish estimation readiness.

## Dependencies and delivery units

| Delivery | Tasks | Can ship independently? |
| --- | --- | --- |
| A. Correctness and deadlines | 1–3 | Yes, after the compatibility/release checks applicable to those changes. |
| B. Quota and coordinated retries | 4–6 | Keep server metadata/protocol changes ordered; Worker first, app second. |
| C. Measurement | 7–8 | Metrics/evaluator can proceed after their dependencies without waiting for model selection. |
| D. Prompt and model experiments | 9–10 | Each proven change is separate and reversible; no promotion if evidence is insufficient. |
| E. Compatibility and rollout | 11–12 | Apply to every shipping delivery, not only at the end. |

`index.ts`, quota state, and client service overlap across tasks: implement these changes sequentially. Independent fixture preparation can happen alongside implementation if later explicitly delegated.

## Verification commands

- Worker: `env TMPDIR=/tmp npm test` and `npm run typecheck` from `worker/`.
- App: focused service/contract tests during implementation; `env TMPDIR=/tmp npm test` and `npx tsc --noEmit` before integrated handoff. Classify unrelated pre-existing failures without changing their tests.
- Runtime: wire the new actual Durable Object suite into a documented local command and the Worker gate; mock all paid providers.
- UI/app bundle when client changes: `npx expo export --platform android --dev`, followed by physical preview-phone checks. This does not build or deploy a new preview APK by itself.
- Config: existing `npm run dry-run` plus production-config dry run after loading Wrangler guidance; neither deploys.
- Documentation: `git diff --check`; run `release/site/check.mjs` if release-site files are deliberately changed. No linter is currently configured.

## Explicit release boundaries

This plan requires no new provider, durable food-content cache, telemetry SDK, user account, credential UI, or backend dependency. Application data remains local-first. Test tooling is development-only; verify what the installed runtime provides before adding it.

The current privacy policy says durable access/quota records contain no food content. Execution records therefore contain only control metadata; memory-only replay is transient processing and never serialized into quota storage/logs. If implementation needs durable result retention or a policy-text change, bring that concrete change back for the versioned-policy decision before proceeding with it. Ordinary local regression work remains independent.

Paid staging generation and deployment are not authorized by this planning request. Their exact gates come from `release/runbooks/WORKER_RELEASE.md`; local code/test work can be planned completely without those operations. No new approval is required merely to finish this plan.

## Plan audit

- 12 tasks reviewed; all trace to C1–C6 and name files, dependencies, and verification.
- Scope: matches the assessment and user goals. Model upgrades, lower image resolution, and new routing are conditional experiments with explicit promotion gates.
- Risks addressed: runtime/mock differences, uncertain serving metadata, response-body deadlines, lease fencing, old clients, legacy request IDs, eviction/restart, quota migration, privacy, retry multiplication, and paid evaluation cost.
- Dependency order: correct. Release checks apply per delivery; local fixes do not wait for a live benchmark.
- Verdict: PASS for implementation planning. Execution, paid evaluation, and rollout are not represented as completed or authorized.
