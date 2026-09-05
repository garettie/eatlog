# Food-estimation service review

Reviewed 2026-09-05. Scope: current app-to-Worker estimation path, prompts, normalization, provider recovery, quota handling, tests, and developer cost. Application code and deployment were not changed. Unrelated working-tree UI changes were excluded.

## Assessment

Keep the current `gemini-3.1-flash-lite` → `gemini-3.5-flash-lite` route provisionally. The highest-confidence improvements are request correctness, failure recovery, and cost accounting. A model upgrade cannot fix the confirmed service defects below. The prompt has a useful, compact foundation, but neither its nutrition accuracy nor near-zero production failure has been demonstrated.

Separate three goals: a usable result on valid input, an accurate estimate, and successful logging despite unavailable inference. Returning plausible JSON satisfies only part of the first. Photographs do not reveal exact mass or hidden recipe ingredients, so zero estimation error is not a realistic target. Keep correction and existing local logging available, while measuring avoidable service failures separately from non-food input, consent, and legitimate product limits.

The [provider review](2026-09-05-food-estimation-provider-review.md) contains current official model, pricing, lifecycle, and generation-setting research. It supersedes outdated model/cost assumptions in the August 28 note, without rewriting that historical file.

## Existing strengths

- Prompts and schema are Worker-owned; text and clarification request sizes have explicit regression guards. Clarification sends source text plus component names/grams rather than an entire result or chat history.
- English, Filipino, and Taglish quantities, prepared-state nutrients, edible amounts, label conversion, hidden cooking fats, parent/ingredient overlap, and one-unit portions are explicitly addressed.
- Both free and paid users get the same model route. A transiently unhealthy model is demoted for three minutes within an isolate; fallback retains a nine-second floor within the nominal 26-second provider budget.
- Unsupported-location errors retry the same model through the relay. Subsequent model attempts in that request keep the relay path.
- Consent gates uploads. Cached verified access survives RevenueCat outages, and a usable signed grant skips inline re-verification.
- JPEG preparation converts and resizes images before upload, reuses prepared bytes on photo retry, and limits decoded images to 4 MiB.
- Failed and unrecognized estimates refund the visible allowance. The app preserves photo/text input for retry and offers local logging alternatives.

Evidence: [Worker](../../worker/src/index.ts), [client](../../src/services/foodScan.ts), [photo preparation](../../src/utils/mealPhotos.ts), [Describe flow](../../src/components/sheet-states/DescribeInputState.tsx).

## Priority findings

### 1. Duplicate quota accounting does not prevent duplicate inference — high

The client hashes only the serialized payload into `X-Eatlog-Request-ID` (`foodScan.ts:228–260`). The quota store returns `duplicate: true` for an existing reserved/finalized ID, but the handler ignores that flag and calls Gemini again (`index.ts:1303–1336`; `subscriptionDurableObject.ts:80–88`). No result replay or in-flight coalescing exists.

Confirmed locally: three identical successful requests made **three upstream calls while charging one allowance unit**. Repeating an ordinary description on another day also reuses the same ID during the 30-day request retention period. The server does not bind the supplied key to a payload fingerprint, so clients can reuse a prior key for different content. Per-minute throttles remain, but the long-window inference budget is not reliable.

Recommendation: distinguish one user action from a transport retry. Give a new intentional estimate its own ID, retain that ID for its retries, bind it to the validated operation/payload on the Worker, and coalesce pending work. Completed retries should reuse the result without another provider call. Any server-side result replay needs a short, explicit retention policy; do not silently create a long-term food-content cache. Test concurrent duplicates, same-key/different-payload rejection, retry after a lost response, and a fresh intentional estimate of identical food.

### 2. Provider outages can lock a user out after recovery — high

Every final Gemini error is refunded using the same event class as unrecognized input (`index.ts:1334–1342`). `decideQuota` rejects all access kinds once there are five refunded events in a rolling day (`subscriptions.ts:164–168`).

Confirmed locally: five distinct attempts returning provider 503 exhausted the refund ceiling; a sixth request received **429 `REFUND_DAILY_LIMIT` without contacting the now-healthy provider**. A short outage can therefore become a much longer user-facing failure. The response provides no reset timestamp for this limit.

Recommendation: classify infrastructure failure separately from repeated unusable input. Provider/network failures should trigger bounded service recovery and operational budget controls, not a full-day customer lockout. Retain meaningful abuse controls for paid inference on repeated unrecognized content.

There is also a test/runtime mismatch: the memory store appends refunded events, while production SQL uses `(subject, request_id)` as its primary key and replaces the row when a refunded ID is retried (`subscriptionDurableObject.ts:21, 87–88`). Repeated retries of the same failed payload therefore do not accumulate the same abuse count in both stores. Exercise the production Durable Object implementation, not only the memory substitute.

### 3. Timeouts stop at response headers, not complete responses — high

`fetchWithTimeout` clears its timer as soon as `fetch` returns (`index.ts:451–470`). The following JSON/body reads occur outside that timer (`index.ts:519–531, 1098–1102, 1196–1208`). This affects Gemini and RevenueCat. A response with quick headers and a slow/stalled body can spend the fallback budget without triggering the intended abort.

Confirmed using a streamed response and accelerated timers: a 17ms deadline was cleared at headers; the body arrived at 70ms and the request still returned 200 with an unaborted signal. This is a deterministic deadline-coverage probe, not a real-network latency measurement.

The total is also not an end-to-end deadline: eight seconds of RevenueCat plus 26 seconds of Gemini leaves approximately one second under the client's 35-second timeout for upload, hashing, state calls, parsing, and return transit. Subscription-state calls have no explicit timeout. The relay's inner provider fetch does not forward a signal or carry its own deadline (`geminiRelay.ts:20–24`).

Recommendation: propagate one remaining-time budget through authorization, body consumption, all provider attempts, and result delivery. Keep the timeout active until a bounded body has been read. Reserve measured mobile-network headroom, preserve fallback time, and test delayed headers, delayed body, hung state calls, and cold authorization. Increasing every timeout is not sufficient.

### 4. Validation admits wrong nutrition and can overwrite explicit amounts — high

`finiteNonNegative` uses `Number(value)` (`index.ts:473–475`), so `null`, `false`, and empty strings can become zero. Output normalization imposes no upper mass or nutrient-density bounds (`index.ts:974–1015`); the 10,000g cap applies to incoming clarification context, not generated estimates.

Confirmed locally:

| Injected provider output | Current Worker result |
| --- | --- |
| All four nutrient values are `null` | HTTP 200 with four zero nutrient values |
| 1 billion grams, 5,000 kcal/100g, 200g each macro/100g | HTTP 200 |
| User says `30g cookies`; provider returns 30g total, `servingLabel: "3 cookies"`, `servingSizeGrams: 30` | Normalizer changes consumed amount to 90g |

The last case follows `normalizeCountedServing`, which multiplies label count by serving mass for non-scan operations without knowing whether the provider's mass describes the entire labeled serving or one cookie (`index.ts:917–958`). Explicitly stated edible grams can be lost even if Gemini got them right.

Recommendation: require actual finite numbers for generated nutrition; preserve unknown values as unknown rather than zero; enforce broad physical bounds and flag major energy/macronutrient inconsistencies. Do not require exact 4/4/9 calorie equality because legitimate label conventions differ. Treat total consumed grams as authoritative when normalizing ambiguous serving metadata. Repair optional metadata locally when safe; retry genuinely unusable nutrition within the remaining budget. Do not silently drop a material component to manufacture success.

Google explicitly distinguishes structured JSON from semantically correct values. [Structured output guidance](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)

### 5. The current evaluation cannot establish food accuracy — high evidence gap

`worker/scripts/evaluate-estimates.mjs` has four text-only cases. It checks ingredient-name matches and component counts, not grams, calories, macros, labels, photos, omissions by nutritional impact, repeatability, or clarification correctness. It also omits the request ID required by subscription staging/production, and its 25-second client timeout is shorter than the current provider budget.

Mocked tests prove request/response behavior for their fixtures. They do not prove that a real model estimates Philippine meals well. No current production latency distribution, provider failure rate, correction rate, or independently measured nutrition dataset was available in this review.

Recommendation: make the evaluator match the deployed contract, then freeze a labeled dataset before tuning prompts or selecting models. Include weighed cooked foods, representative Filipino composite meals, clear and difficult labels, shared dishes, explicit amounts overriding photos, mixed English/Taglish, ambiguous images, non-food, and meal/component Redo. Use known recipe/label or trusted food-composition references for nutrition; a second model is not ground truth.

### 6. Cost and success telemetry omit important work — medium/high

`logAiUsage` runs only after a response normalizes successfully, uses `candidatesTokenCount` without `thoughtsTokenCount`, and prices both models with one pair of environment rates (`index.ts:100–116, 1203–1214`). Current checked-in configs do not set those rates; deployed values were not inspected.

Confirmed locally: two generated attempts, the first truncated, emitted only one usage record. That record counted 250 output tokens while its synthetic usage contained another 750 thinking tokens. The logger cannot accurately price the mixed route even if its one rate pair is configured.

`logOperational` is called for final failures, not successful estimate latency; invocation logs are disabled and console logs are sampled at 10%. An HTTP 200 unrecognized result is not distinguished by the existing usage record. This is insufficient to calculate reliable per-operation latency and valid-result rates from those logs alone.

Recommendation: record privacy-safe per-attempt model, operation, outcome/finish reason, elapsed time, token classes, and per-model estimated cost; record one final outcome/latency per logical request. Account for sampling and reconcile with provider billing, especially timed-out generations whose usage may never reach the Worker. Update the existing log-field allowlist and tests alongside telemetry changes. Never log food text, photos, or full provider error messages; the current free-form rejection reason deserves scrutiny because a provider can echo input into an error.

Both Lite models already default to minimal thinking, which may still produce billable thoughts. Pinning minimal is a consistency measure, not a demonstrated latency optimization. [Thinking and billing](https://ai.google.dev/gemini-api/docs/generate-content/thinking)

### 7. Prompt and output-budget improvements need measured experiments — medium

The current prompts are reasonably concise and cover many real product requirements. Do not replace them with a generic nutrition prompt or add long explanations. The largest opportunities are clearer precedence and smaller output ambiguity:

- State one consistent precedence: corrected user identity and explicit consumed amounts; legible label facts for nutrient density; visual evidence; typical recipe assumptions. The label prompt says one labeled serving, the system prompt says the entire depicted dish, and title instructions say the amount actually eaten. Cases combining these instructions need explicit regression examples.
- Distinguish nutrition per 100g from consumed grams, cooked from dry weight, and edible mass from bones. Test dilution/reconstitution, drained foods, sauces/oil, fractional counts, and multi-serving labels. Existing text anchors help consistency but are assumptions, not universal facts about every rice cup or chicken piece.
- Keep ingredient breakdown, but avoid turning uncertain recipe guesses into numerous mandatory edits. Test whether inferred oil/sauce improves total nutrition or duplicates fat already included in a prepared-food density.
- Preserve the compact source/context contract. Put the single image before its text as a controlled experiment, following Google's [image guidance](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding). Keep the current clear-image path until lower media resolution passes label/portion tests.
- The 2,048-token output cap competes with up to 20 components containing 12 required fields each. This is a truncation risk, not a measured production failure rate. Record `finishReason`, test crowded plates, and compare a larger maximum or compact schema. A higher maximum is not automatically a higher bill: actual generated tokens matter. Ensure any thinking budget also fits.
- Parse all relevant non-thought text parts rather than assuming `parts[0].text` is the entire answer. Distinguish blocked, truncated, malformed, and genuinely unrecognized responses before deciding whether another model can help.

### 8. Regional, rate-limit, and cancellation edges remain — medium

The relay is useful, but `locationHint: 'wnam'` is best effort and applies only on initial object placement; it is not a guaranteed pin. Verify the created relay's behavior from affected routes and give its upstream call a deadline. The legacy config has no relay binding; confirm no supported app runtime still depends on that endpoint. Do not silently deploy subscription configuration over it. [Cloudflare placement](https://developers.cloudflare.com/durable-objects/reference/data-location/)

The Gemini IP limit is 30/minute, which can throttle unrelated users sharing a mobile-carrier/public IP. The emergency 100/minute binding is per Cloudflare location and eventually consistent, not a global spend cap. Retain abuse protection, but use observed legitimate traffic and account quotas to tune it; do not describe it as exact budget accounting. [Cloudflare rate-limit scope and guidance](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

The UI cancels by invalidating a local request counter; it does not cancel the estimate's network request (`FoodSheetContent.tsx:780–785`). Redo helpers discard typed failure details and return null (`foodScan.ts:356–371`), so callers cannot preserve specific quota/timeout recovery. Photo failure handling also replaces the richer service message with static text. These are opportunities to reduce repeated paid work and make recovery less frustrating. Keep a result reusable if it finishes during navigation, and preserve failure categories through Redo.

## Model and cost decision

Both configured Lite models remain technically eligible. Keep 3.1 first while it is the measured healthier option in this project; source comments report 3.5 overload, but this review did not independently remeasure it. Benchmark 3.5 Lite and a stronger candidate on the same inputs before changing routing. Do not put 2.5 Lite back solely for its low published price: the release runbook records project-specific 404 responses for it.

At an illustrative **2,000 input + 800 billable output tokens**, one successful 3.1 Lite attempt is **$0.0017**, or **$17 per 10,000**; 3.5 Lite is **$0.0026**, or **$26 per 10,000**. These figures exclude extra thoughts, retries, infrastructure, and other services and are not measured Eatlog usage. At the paid 250-operation rolling-month cap, the same single-attempt scenario is $0.425 or $0.65 per user; lifetime Itik therefore has recurring inference cost. [Current Google pricing](https://ai.google.dev/gemini-api/docs/pricing)

Prefer cost per usable estimate, including retries and corrections, over price per token. Avoid speculative dual-model calls or a stronger model on every request. Reuse already-saved meals when the user chooses them; this can avoid inference entirely. Consider selective escalation only after measured errors justify its cost. Model-reported confidence alone is not a calibrated trigger.

## Recommended execution and verification order

1. Fix strict numeric/portion handling and the duplicate execution path. Verify nulls, impossible values, serving ambiguity, repeated/concurrent IDs, payload conflicts, and lost responses against the real quota implementation.
2. Fix complete-response deadlines and failure classification. Verify provider recovery does not leave user lockouts, mobile/network headroom exists, and a stalled response cannot prevent fallback. Apply bounded transient retries only where remaining time permits; do not blindly retry invalid credentials/schema. Preserve the special same-model region retry.
3. Add accurate, privacy-safe request/attempt metrics and update the evaluator. Verify observed cost by model, thinking, failed attempts, and final outcome against provider totals. Inspect account-level RPM/TPM/daily limits and developer spend controls.
4. Run a frozen food benchmark with current models, then test prompt/budget changes one at a time. Measure known-amount preservation, nutrient error, material omissions/double counting, label conversion, Redo preservation, valid-result rate, p50/p95 latency, and cost per usable result. Separate clear labels from uncertain plated-photo estimates.
5. Roll out only measured improvements with the existing rollback workflow. A reasonable initial reliability objective is at least 99.5% usable results for valid, online requests inside the client deadline, tracked separately by operation and region. Treat this as a proposed target, not today's performance. Tune accuracy/latency gates from the frozen baseline and actual user tolerance.

For statistical perspective, zero failures in approximately 600 independent representative trials only puts the rough 95% upper failure bound near 0.5% (rule of three). A handful of successful examples cannot establish near-zero failure, and correlated provider outages require longitudinal monitoring as well.

## Verification performed and limits

- Worker tests: **67 passed, 0 failed** (`env TMPDIR=/tmp npm test` in `worker/`).
- Focused client/contract/subscription tests: **34 passed, 0 failed**.
- Worker and app TypeScript checks: **passed**.
- Seven additional deterministic fault probes against the current handler: all confirmed the behaviors reported above. Temporary runner: `/tmp/eatlog-estimation-review-probes.mjs`, executed with the installed `tsx` loader. All provider data, credentials, grants, and quota state were synthetic/local.
- Official Google and Cloudflare documentation was consulted. Worker types checked against the installed `@cloudflare/workers-types` 5.20260808.1 through the successful typecheck; no claim of a latest-package upgrade or deployed-runtime validation.
- No application code, production configuration, credentials, or unrelated UI work was changed. No live nutrition generation, deployed-version inspection, or production-log/billing inspection was performed.

The [Worker release runbook](../../release/runbooks/WORKER_RELEASE.md) explicitly requires separate cost approval for paid provider smokes: “After explicit cost approval, use non-sensitive synthetic inputs against staging.” Its old routing/deadline descriptions are stale relative to source, but that explicit approval requirement still governs such a run. This review therefore establishes local defects and current provider suitability; it does not certify live accuracy or production availability.
