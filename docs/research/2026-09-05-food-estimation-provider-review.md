# Food-estimation provider review

Research date: 2026-09-05. Scope: current Gemini model eligibility, cost, generation settings, and provider reliability. Sources were opened directly during this review; no paid generation calls or production changes were made. Recommendations below are engineering judgments, not measured food-accuracy results.

## Current repository baseline

`worker/src/index.ts` currently routes both Pugo and paid requests through `gemini-3.1-flash-lite`, then `gemini-3.5-flash-lite`. The source explains that 3.5 was moved behind 3.1 after overload and slow responses. It has a 26-second total provider budget, a 9-second fallback floor, a 2,048-token output cap, structured JSON, and a location-refusal relay. Generation settings leave thinking and media resolution at provider defaults. These are code observations, not independently verified production measurements.

The previous [model-eligibility note](2026-08-28-food-image-model-eligibility.md) describes older routing and a 20-second budget. Its 3.5 Flash price was inferred from a different model's pricing; that inference must not be reused. The [Worker release runbook](../../release/runbooks/WORKER_RELEASE.md#smoke-sequence) records that `gemini-2.5-flash-lite` was dropped because Google returned 404 for it on this project. Public model listings do not establish project-specific availability: 2.5 Lite is not a usable replacement unless access and the exact schema are reconfirmed for this project.

## Models and lifecycle

The existing Lite family remains a reasonable baseline. Google lists 3.5 Flash-Lite as a stable multimodal model with image inputs, structured outputs, and thinking support. That establishes technical eligibility, not nutrition accuracy. [3.5 Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)

The current lifecycle table lists no announced shutdown for 3.5 Flash-Lite or 2.5 Flash-Lite. It lists May 7, 2027 for 3.1 Flash-Lite and recommends 3.5 Flash-Lite as replacement; Google describes these as earliest retirement dates, with exact dates communicated separately. Keep a migration reminder rather than replacing a healthy model solely because it is older. [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations)

3.8 Flash is a newly released stable alternative with image input and structured output. Its card emphasizes coding and agent tasks; it does not establish superiority on food estimation. It supports `low`, `medium`, and `high` thinking; `minimal` returns an error. Treat it as an evaluation candidate, not a drop-in upgrade with copied Lite settings. [3.8 Flash model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)

## Cost comparison

Standard paid USD rates per million text/image input and billable output tokens, followed by illustrative cost at **2,000 input + 800 output tokens**, without additional thoughts, caching, retries, or infrastructure. The 2.5 row is a price reference only; the runbook records it as unavailable on this project:

| Model | Input | Output | One estimate | 10,000 estimates |
| --- | ---: | ---: | ---: | ---: |
| 2.5 Flash-Lite | $0.10 | $0.40 | $0.00052 | $5.20 |
| 3.1 Flash-Lite | $0.25 | $1.50 | $0.00170 | $17.00 |
| 3.5 Flash-Lite | $0.30 | $2.50 | $0.00260 | $26.00 |
| 3.8 Flash | $0.75 | $3.75 | $0.00450 | $45.00 |
| 3.5 Flash | $1.50 | $9.00 | $0.01020 | $102.00 |

3.8 rates double January 1, 2027. The previous note's $0.50/$3.00 for 3.5 Flash is unsupported by today's table. Paid-tier content is not used to improve Google's products. [Pricing](https://ai.google.dev/gemini-api/docs/pricing)

These are arithmetic scenarios, not observed bills. For production accounting, multiply each attempt's actual tokens by that attempt's model rates. The current `logAiUsage` applies one shared pair of environment rates to both models and counts only `candidatesTokenCount` as output. A proposed extension should separately record thinking and cached tokens, model, attempt, operation, finish reason, elapsed time, and final request outcome, without meal text or images; this requires updating the runbook's explicit log-field allowlist and its tests together. Count tokens consumed by invalid/truncated attempts as well as the successful response.

## Settings and prompt implications

Both current Lite models already default to `minimal` thinking. Explicitly pinning that makes behavior intentional but is not evidence of an immediate speedup. Minimal can still think. Google bills response tokens plus `thoughtsTokenCount`; the current logger therefore undercounts whenever thoughts are present. 2.5 uses `thinkingBudget`, whereas Gemini 3 should use `thinkingLevel`. [GenerateContent thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking)

Keep default sampling parameters. Google's Gemini 3 guidance warns that reducing temperature below the default can degrade performance or cause loops. Test prompt changes with held-out examples rather than assuming temperature zero improves accuracy. [Prompt design](https://ai.google.dev/gemini-api/docs/prompting-strategies)

Google's **Gemini 3 family-level** media table lists about 1,120 image tokens at default/high, 560 at medium, and 280 at low. It does not name either Lite variant, and neither reviewed Lite model page specifies its own image-token default. Treat these as a provisional family reference, not a measured Lite per-scan charge; use each model's `usageMetadata` to verify. The old note's universal 258-token scan assumption is likewise unsupported. Preserve current defaults for labels and detailed plates while evaluating any lower-resolution setting. [GenerateContent media resolution](https://ai.google.dev/gemini-api/docs/generate-content/media-resolution), [3.1 Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [3.5 Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)

Google recommends putting the image before the text when there is one image. Eatlog currently builds text first, then image. Reversing their order is a small, testable prompt experiment. Orientation and image clarity also matter. [Image understanding](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding)

Structured outputs enforce shape, not truthful nutrition. Keep numeric and semantic checks after parsing. Current documentation lists `maxItems`, but its examples use a newer schema surface; it does not override Eatlog's recorded rejection on `responseSchema`. Preserve the working schema and post-normalization component cap until an exact-contract staging probe proves compatibility. [Structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)

Suggested accuracy experiments: distinguish observed ingredients from uncertain recipe assumptions; explicitly anchor edible cooked weight and nutrient basis; prioritize readable label values over generic knowledge; avoid counting cooking oil twice when a prepared-food density already includes it. These are hypotheses to score against known meals, not claims that more prompt instructions automatically improve output. Keep the current request-size guard and replace redundant wording when adding a rule.

## Reliability strategy

Google recommends bounded exponential backoff with jitter for transient failures such as 429, 408, and 5xx, rather than retries for malformed requests or invalid credentials. Fit recovery inside the user deadline; account for upload, authorization, all attempts, and body parsing. Classify shared credential/schema failures separately from model overload, while preserving Eatlog's special same-model location relay. [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)

Rate limits are project-scoped, vary by model, and include RPM, input TPM, and daily requests. A second API key in the same project does not create independent capacity. The applicable limits must be read in this account's AI Studio; public docs cannot establish Eatlog's current quota. Model fallback also cannot guarantee recovery from shared account or provider failures. [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

Keep standard inference for interactive logging. Flex trades lower prices for variable latency and best-effort availability, making it a poor fit for this product goal. Offline evaluations can use slower discounted processing. [Flex inference](https://ai.google.dev/gemini-api/docs/flex-inference)

Implicit caching is automatic but savings are not guaranteed. The published minimum-token table omits the Lite variants, so do not assume their threshold or pad a small prompt to chase caching. Explicit cache storage adds cost and complexity; measure actual cache hits first. [GenerateContent caching](https://ai.google.dev/gemini-api/docs/generate-content/caching)

## Recommended next decision

Retain the 3.1-first ordering supported by the source's recent overload observations while measuring reliability. Compare 3.1 Lite and 3.5 Lite on the same frozen Philippine meal/text set; add 3.8 Flash as a stronger candidate after project-specific compatibility is confirmed if the Lite models show material errors. Do not include 2.5 Lite unless its recorded project-level 404 has been resolved and compatibility reconfirmed. Test recognition, missing/extra ingredients, cooked grams, calorie/macronutrient error, labels, user quantity instructions, and clarification preservation. Repeat ambiguous cases to reveal variance. Include crowded plates that pressure the 2,048-token cap and record finish reasons.

Choose the cheapest route that passes accuracy and latency gates. Evaluate stronger-model escalation only on measurable failures or ambiguous cases; a model's self-reported confidence alone is not a calibrated quality score. Keep one-tap correction and saved/recent foods available so imperfect estimation does not block logging.

Remaining evidence gaps: no live accuracy benchmark, no current production p50/p95/p99 latency or failure distribution, no account quota inspection, and no exact observed token distribution. Passing mocked request/response tests cannot fill those gaps. This review verifies model suitability and provider mechanics; it does not certify a near-zero production failure rate or nutrition accuracy.
