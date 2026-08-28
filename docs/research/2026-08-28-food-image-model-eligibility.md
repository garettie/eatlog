# Eligibility of a different model for food-image scanning

Research date: 2026-08-28

This note answers whether Eatlog can use a different AI model specifically for scanning food images. It uses only the repository and current first-party Google documentation (Gemini API docs, pricing, deprecations). No external vendor calls or billing assumptions were added.

## Current implementation — repository facts

- Worker calls `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=...` with `GEMINI_API_KEY` from `worker/src/index.ts` line 21-22 and `GEMINI_ORIGIN` constant.
- `GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']` with sequential fallback, `GEMINI_TOTAL_TIMEOUT_MS = 20000`, `MAX_IMAGE_BYTES = 4 MiB` decoded, `MAX_ESTIMATE_BODY_BYTES = 6 MiB`, `GEMINI_MAX_OUTPUT_TOKENS = 2048`. All four operations (`scan`, `describe`, `clarify-meal`, `clarify-component`) share the same loop and `FOOD_ESTIMATE_SCHEMA` via `generationConfig.responseMimeType = 'application/json'` and `responseSchema`.
- `FOOD_ESTIMATE_SCHEMA` omits `maxItems`; `AGENTS.md` line 256 and `worker/src/index.ts` comment state Gemini Flash-Lite rejects `maxItems` and `normalizeGeminiResponse` enforces `MAX_COMPONENTS = 20`.
- Image input is `inlineData: { mimeType: 'image/jpeg', data: base64 }`; `decodeJpeg` validates JPEG magic and size. Worker tests assert the static request (system instruction + schema + prompt) stays at or below 4,500 bytes and that `maxItems` is absent.
- Consent gates the feature: `RemoteEstimateConsentContext` fail-closed before install-token loading; onboarding and on-demand share the full-screen consent flow. The consented recipient named in the UI and docs is Google/Gemini.

## Hard eligibility gates for a scanning replacement

A candidate replaces only `operation === 'scan'` or the whole loop. It is eligible only if every gate passes:

1. Image input via `generateContent` `inlineData`/`parts` on the Gemini Developer API.
2. Structured output `responseMimeType: application/json` with `responseSchema` matching the current contract.
3. Production paid-tier availability (not free-tier only, not preview-only).
4. Paid-tier data handling where data is not used to improve products.
5. Stable lifecycle with no imminent retirement that would force a second migration.
6. Compatible with the current Worker auth (`GEMINI_API_KEY`), quota, and consent disclosure.

Eligibility is separate from quality. Quality is measured later on a frozen representative food-image benchmark (Philippine plates, packaged labels, lighting, angles).

## Candidate assessment — verified public facts only

### Eligible today

**gemini-3.5-flash-lite — current primary, remains eligible.** Supports multimodal `generateContent` with structured JSON (`ai.google.dev/gemini-api/docs/generate-content/structured-output` and `docs/migrate-to-interactions` show `responseMimeType + responseSchema`). Pricing page lists Standard Paid Tier at $0.30 per 1M input tokens and $2.50 per 1M output tokens (`ai.google.dev/gemini-api/docs/pricing` section Gemini 3.5 Flash-Lite). Free-tier data may be used to improve products; paid-tier data is not (`docs/pricing` Gemini 2.5 Flash-Lite box generalizes the tier rule, and 3.5 Flash-Lite pricing is in the paid-tier table). No shutdown listed; docs call it the replacement for `gemini-3.1-flash-lite` (`ai.google.dev/gemini-api/docs/deprecations` and `docs/whats-new-gemini-3.5`).

**gemini-3.5-flash — eligible and the only justified stronger candidate for scan-only routing.** Same `generateContent` + structured output path (`docs/migrate-to-interactions` example uses it; `docs/antigravity-agent` lists it as a selectable model). Pricing page lists Standard Paid Tier at $0.50 per 1M input tokens for text, image, and video and $3.00 per 1M output tokens for Gemini 3 models in the paid table (`docs/pricing` Gemini 3 Flash Preview box explicitly states the $0.50/$3.00 paid-tier numbers; same table is referenced for Gemini 3.5 Flash-Lite at $0.30/$2.50). Stable primary model per `docs/whats-new-gemini-3.5` ("Gemini 3.5 Flash is the primary model for intelligent, scalable production use"). No retirement listed. Paid-tier data handling identical.

### Eligible but deprecated — do not extend

**gemini-3.1-flash-lite — technically eligible, scheduled removal.** Currently supports the same image + structured path and pricing tier, but `ai.google.dev/gemini-api/docs/deprecations` states *gemini-3.1-flash-lite is scheduled for shutdown on May 7, 2027, with gemini-3.5-flash-lite as its recommended replacement*. Keeping it as fallback beyond that date fails the lifecycle gate. Plan to remove it and keep `gemini-3.5-flash-lite` as the final fallback.

### Not eligible for production scans

**gemini-3.1-flash-lite-image (Nano Banana 2 Lite) — ineligible.** Docs explicitly state it *does not support structured outputs* (`ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image`: "does not support caching, code execution, audio generation, structured outputs, or search grounding"). The Eatlog contract requires `responseSchema`.

**gemini-3-flash Preview / gemini-3.1 Pro Preview — ineligible for production.** Preview models carry retirement dates (`docs/deprecations` lists `gemini-3-pro-preview` shutting down March 9, 2026 and `gemini-3.1-flash-image-preview` June 25, 2026). Preview status fails the stability gate even when image + structured are technically present.

### Eligible cost-saving candidate — your 2.5 Flash-Lite idea

**gemini-2.5-flash-lite — eligible, fully compatible, cheapest paid tier.** You asked about this one specifically, and it passes all six gates. `ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite` states it supports text, image, video, audio, and PDF inputs with text outputs, 1,048,576 input / 65,536 output limits, and capabilities including structured outputs, thinking, function calling, and context caching. That covers Eatlog's `inlineData: image/jpeg` + `responseMimeType: application/json` + `responseSchema: FOOD_ESTIMATE_SCHEMA` contract on the same `v1beta/models/{model}:generateContent` endpoint. Pricing page lists Standard Paid Tier at $0.10 per 1M input tokens for text, image, and video ($0.30 for audio) and $0.40 per 1M output tokens (`ai.google.dev/gemini-api/docs/pricing` Gemini 2.5 Flash-Lite sections, both standard and preview tables show the same $0.10/$0.40). That is about one-third the input cost and one-sixth the output cost of `gemini-3.5-flash-lite` ($0.30/$2.50). Paid-tier data is not used to improve products (same tier rule as 3.5). No retirement is listed in `docs/deprecations` for the stable `gemini-2.5-flash-lite` (only 3.1-flash-lite and preview models are listed); it remains production-available. The tradeoff is generation age: 2.5 is prior to the 3.5 family, so the savings trade against potential accuracy on high-variance image scans.

## What "different model for scanning only" would mean in this codebase

This is a minimal, eligible change for either direction:

* **Cost-saving scan route you asked about:** `scan: ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite']` while text operations stay on `gemini-3.5-flash-lite`. Same `GEMINI_API_KEY`, `v1beta`, `inlineData` JPEG, 20s budget, and `FOOD_ESTIMATE_SCHEMA` without `maxItems`. No consent change.
* **Quality-upgrade scan route:** `scan: ['gemini-3.5-flash', 'gemini-3.5-flash-lite']` with text ops on Flash-Lite.

Required code/test touchpoints after a decision (not done in this note): `worker/src/index.ts` `GEMINI_MODELS` branching plus `geminiEstimate` model selection, `worker/test/index.test.ts` URL assertions and request-size budget checks, and any docs that name the primary model. The current tests exercise both models and enforce the `maxItems`-absent contract; they continue to pass when 2.5 Flash-Lite or 3.5 Flash also rejects `maxItems` (normalize still enforces the cap).

This stays inside the existing Gemini Developer API, so rate-limiter bindings, JPEG validation, and 20-second budget remain valid.

## Cost comparison — envelope with labeled unknowns

Google prices by input and output tokens. Image token counts are model-specific and Google does not publish a single per-image token table in the pages reviewed for this note; that is flagged as an unknown and the estimates below keep it explicit.

Assumptions for the envelope (labeled, not measured): ~750-900 prompt tokens (system instruction + image prompt + schema description) + ~258 image tokens per JPEG + ~350-500 output tokens per structured estimate. Actual image tokens vary by resolution and model; use the real `usageMetadata` logged by `logAiUsage` / `aggregateAiUsage` after a trial.

Per-scan arithmetic from current published Standard Paid rates:

* **gemini-3.5-flash-lite** (current): input ~1,100 tokens x $0.30 per 1M = ~$0.00033; output 400 tokens x $2.50 per 1M = ~$0.00100; total ~$0.0013 per scan.
* **gemini-3.5-flash** (upgrade): input ~1,100 tokens x $0.50 per 1M = ~$0.00055; output 400 tokens x $3.00 per 1M = ~$0.00120; total ~$0.00175 per scan (~35% higher).
* **gemini-2.5-flash-lite** (your idea, cheapest): input ~1,100 tokens x $0.10 per 1M = ~$0.00011; output 400 tokens x $0.40 per 1M = ~$0.00016; total ~$0.00027 per scan (~79% cheaper than 3.5 Flash-Lite).

Monthly envelope:

* At 6,000 scans/month: 3.5 Flash-Lite ~$7.80; 3.5 Flash (scan only) ~$10.50; **2.5 Flash-Lite (scan only) ~$1.62**.
* At 18,000 scans/month stress: 3.5 Flash-Lite ~$23.40; 3.5 Flash (scan only) ~$31.50; **2.5 Flash-Lite (scan only) ~$4.86**.
* The existing Worker env supports overriding via `GEMINI_INPUT_USD_PER_MILLION` and `GEMINI_OUTPUT_USD_PER_MILLION` for observed accounting without code change.

No per-request surcharge or separate image flat fee appears in the reviewed pricing pages for these models; 3.1 Flash-Lite Image is the exception with a per-image output-token fee, but it is ineligible anyway.

## Data-use and consent consequence

Paid-tier Gemini traffic is documented as *not used to improve products* (`docs/pricing` tier notes). Staying on the Gemini Developer API with a different Gemini model ID does not change the data-use tier or recipient; the existing remote-estimate consent remains accurate.
## Recommendation

**2.5 Flash-Lite for scanning is fully eligible — it's a drop-in `GEMINI_API_KEY` model swap with no endpoint, schema, or consent change.** That was your question, and the answer is yes. It cuts paid-tier cost by roughly 79% per scan.

That does not make it automatically better. It is a prior generation to 3.5. Eatlog's image task is not just captioning — it is ingredient-level decomposition, hidden-ingredient inference (sauce, oil, wrapper), portion estimation from plate/hand cues, and label transcription, all under `FOOD_ESTIMATE_SCHEMA`. Choose between two eligible scan-only paths and gate on a benchmark:

* **Save money:** route `scan` to `gemini-2.5-flash-lite` (fallback to `gemini-3.5-flash-lite`). Adopt only if the frozen Philippine benchmark shows no material regression in missed foods, extra foods, gram deviations, per-100g deviations, and `unrecognized` rate.
* **Chase accuracy:** route `scan` to `gemini-3.5-flash` (fallback to Flash-Lite). Adopt only if it measurably reduces that same error and justifies the ~35% uplift.

If you want one decision now without a benchmark, keep the current `gemini-3.5-flash-lite` loop. Do not adopt preview models, do not adopt `gemini-3.1-flash-lite-image`, and retire `gemini-3.1-flash-lite` before its May 7, 2027 shutdown. Any non-Google candidate is not eligible without a new consent disclosure and privacy-policy revision.

## Final product decision

Eatlog Pugo routes both `scan` and `describe` to `gemini-2.5-flash-lite`, with `gemini-3.5-flash-lite` as fallback. Manok trial, Manok, Itik, complimentary access, and the subscription-disabled legacy route keep `gemini-3.5-flash-lite` followed by `gemini-3.1-flash-lite`. This is a cheaper paid-model route, not use of Google's free API tier.

The existing JPEG input, structured JSON schema, prompt, 2,048-token output cap, and shared 20-second fallback budget remain unchanged. A staging rejection of that contract by either Pugo model blocks the Pugo AI rollout; it does not justify weakening the schema or silently choosing another model.

## Benchmark gate before production cutover

Eligibility does not claim accuracy. Before changing the live scan model:

1. Build a frozen image set (e.g., 40-60 Philippine cases: rice+ulam plates at varied portions, packaged labels with nutrition facts, mixed lighting and angles).
2. Run the same set against `[gemini-3.5-flash-lite]` and `[gemini-3.5-flash -> gemini-3.5-flash-lite fallback]` through the staging Worker with consent enabled, capturing `usageMetadata` tokens, latency, `unrecognized` rate, and component error (missed foods, extra foods, gram and per-100g deviations).
3. Compare paid-tier cost from observed tokens, not from the envelope. The cutover criterion is a measured reduction in material nutrition error or hallucination that justifies the ~35% per-scan uplift; otherwise keep the current Flash-Lite loop.

### Verification status (2026-08-28)

Confirmed against the current `ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite` model card: `gemini-2.5-flash-lite` (not the unrelated `gemini-2.5-flash-image` generation model) lists text/image/video/audio/PDF input, text output, and structured outputs as supported. That matches the Worker's `inlineData: image/jpeg` plus `responseSchema` contract. The Worker's 52-case test suite exercises the exact schema, prompt, and fallback order against both `gemini-2.5-flash-lite` and `gemini-3.5-flash-lite` with mocked responses and passes.

No live Gemini call was made: this environment holds no `GEMINI_API_KEY`, and a real request needs owner cost approval per `release/runbooks/WORKER_RELEASE.md`. The frozen-image benchmark above is still unrun. Structural compatibility is verified; result quality (missed/extra foods, gram accuracy, hallucination rate) is not, and stays a release blocker until the owner runs the benchmark against staging.

## Sources

- `worker/src/index.ts` (model constants, `generateContent` body, JPEG handling, `FOOD_ESTIMATE_SCHEMA` without `maxItems`)
- `worker/test/index.test.ts` (dual-model URL assertions, `maxItems` absent check, 4,500-byte budget)
- `AGENTS.md` (Flash-Lite rejects `maxItems`; consent fail-closed; prompts Worker-owned)
- `src/context/RemoteEstimateConsentContext.tsx` and `src/components/RemoteEstimateConsentContent.tsx` (consent flow)
- `ai.google.dev/gemini-api/docs/pricing` (Gemini 3.5 Flash-Lite $0.30/$2.50 paid tier; Gemini 3 Flash $0.50/$3.00 paid tier; free-tier vs paid-tier data use)
- `ai.google.dev/gemini-api/docs/deprecations` (gemini-3.1-flash-lite shutdown 2027-05-07; preview retirements)
- `ai.google.dev/gemini-api/docs/whats-new-gemini-3.5` (3.5 Flash as primary; 3.1 Flash-Lite as long-term cost option)
- `ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image` (no structured outputs)
- `ai.google.dev/gemini-api/docs/generate-content/structured-output` and `docs/migrate-to-interactions` (structured JSON via `responseMimeType` + `responseSchema`)

## Open unknowns to resolve in the trial

- Exact image input token count per model and JPEG size (needed to replace the envelope with billed tokens).
- Per-minute and per-day quota for the project's `GEMINI_API_KEY` paid tier and retry behavior when the first model throttles (the Worker already falls through, but the budget for 20s should be remeasured at the larger model's latency).
