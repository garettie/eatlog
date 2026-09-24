# Worker release and rollback

This runbook covers the Worker used for USDA search and optional hosted Eatlog AI. A user's My key estimate goes directly from the app to Google and is outside this Worker. Steps marked **OWNER-ONLY** require production credentials or change external state. The preview release audit runs local checks and a read-only health check when a staging origin is available. Do not deploy production as part of the BYOK preview transition.

Subscription development uses `wrangler.subscription-staging.jsonc`; Play production uses `wrangler.subscription-production.jsonc`. Neither may be deployed over the legacy `eatlog-food` Worker. Staging and production have separate Worker names, Durable Object state, rate-limit namespaces, RevenueCat projects, Worker secret bindings, and EAS environments.

## Local release gate

Run from `worker/` at the candidate commit:

```bash
env TMPDIR=/tmp npm ci
npm test
npm run typecheck
npm run dry-run
npx wrangler deploy --dry-run --config wrangler.subscription-production.jsonc
npm audit --omit=dev
```

`npm run dry-run` validates the subscription-staging config. The explicit second dry run validates the production subscription config. Neither command deploys. Record the commit from `git rev-parse HEAD`, Worker package version, command results, and generated bundle sizes. Stop on a test, type, config, secret-scan, or audit failure.

## Version and configuration record

Before any production change, record these facts in the release record without secret values:

- app commit, app version/builds, and Worker commit/package version;
- production Worker origin and current deployment version;
- previous healthy deployment version and exact rollback target;
- hosted paid/legacy Gemini route `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`, and the date each model's structured-output availability was checked; My key uses direct app-to-Google requests;
- USDA search/detail contract-check date;
- configured install, IP, and emergency limiter names and values;
- date and result of Gemini quota/budget and Cloudflare notification checks;
- secret rotation dates, never the secret values;
- smoke results, log sample result, support owner, and incident owner.

Use the official [Cloudflare deployment commands](https://developers.cloudflare.com/workers/wrangler/commands/#deployments), [rollback command](https://developers.cloudflare.com/workers/wrangler/commands/#rollback), and [Workers Logs controls](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), plus the [Gemini model API](https://ai.google.dev/api/models) and [USDA FoodData Central API guide](https://fdc.nal.usda.gov/api-guide/), for the submission-week contract check.

## Smoke sequence

1. Set `EATLOG_WORKER_URL` in the shell without printing it. Run `npm run smoke:health`. This performs one read-only `GET /healthz` and requires HTTP 200 with `{ "ok": true }`.
2. Against local or preview, run `npm run smoke:validation`. It checks a wrong method, missing token, malformed JSON, and oversized text with synthetic input. It never calls USDA or Gemini. It does consume rate-limit entries, so production use requires owner approval.
3. **OWNER-ONLY — external provider calls.** With a fresh synthetic installation token, run common and full USDA searches, then one selected-food detail request. Use only generic test queries. Record Worker status, latency, result count, and cache outcome; do not capture the query, token, headers, or response body in release evidence. Check USDA quota headers only in an owner-controlled direct contract check or provider console.
4. **OWNER-ONLY — Gemini cost, model compatibility, and quota.** After explicit cost approval, use non-sensitive synthetic inputs with a Test Store Omelette entitlement against staging. Confirm Scan, Describe, and both re-estimate operations use `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`, accept the structured schema, stay inside the shared 20-second budget, normalize into editable results, and emit configured cost metadata. A Google location refusal must retry the same model through the `wnam`-pinned GeminiRelay. Exercise model fallback only through a controlled staging failure; never weaken the schema to make a model pass.
5. Exercise the hosted allowance in staging only after owner cost approval: 30 delivered operations per rolling 24 hours and 250 per rolling 30 days, shared across Scan, Photo, Describe, and meal/component re-estimation. Five no-food outcomes per rolling 24 hours have a separate ceiling. Provider failures and timeouts refund reservations; duplicate requests do not refund a sibling's reservation. Use local tests for exact boundaries and concurrency. Verify a free install receives `PAID_ACCESS_REQUIRED` without a Gemini call, while its local features and My key route remain usable.

Do not run provider smokes against production merely to fill a checklist. Stop if they would incur unapproved cost, consume a constrained quota, or use personal content.

## Log contract

Eatlog console entries may contain only:

- `route`;
- `status`;
- `latencyMs`;
- `upstream` category;
- `cache` outcome;
- `rejection` category.

Per-attempt `ai_usage` entries may additionally contain only `event`, `model`, `attemptNumber`, `attemptCount`, `outcome`, `finishReason`, `relayed`, `elapsedMs`, `inputTokens`, `cachedInputTokens`, `candidateTokens`, `thoughtTokens`, `outputTokens`, `totalTokens`, and `estimatedCostUsd`. One `ai_request` entry per logical estimate may contain only `event`, `operation`, `outcome`, and `elapsedMs`. `outcome`, `finishReason`, and the `reason` on `ai_model_rejected` are fixed enums; the provider's own message is never logged, because a rejection can quote the request back and the request is the user's food.

They must not contain URLs, methods, request or response bodies, search queries, descriptions, prompts, provider responses, raw installation tokens, token hashes, IP addresses, headers, request IDs, or secrets. Unit tests assert the exact field allowlist. Automatic Cloudflare invocation logs are disabled because they can include request and response metadata; Eatlog keeps only its sampled structured console entries. **OWNER-ONLY:** after the approved smoke, inspect a sampled 4xx and 5xx entry in Workers Logs, confirm the allowlist by hand, and record only pass/fail plus the deployment version. Do not copy the log payload into the repository.

Use Cloudflare Worker metrics, store crash/vitals reports, and the monitored support inbox for v1. Do not add a telemetry or advertising SDK.

## Deploy and secret rotation

**OWNER-ONLY — changes production state.**

1. Confirm the intended Cloudflare account and Worker with `npx wrangler whoami` and `npx wrangler deployments list`.
2. Confirm `USDA_API_KEY`, `GEMINI_API_KEY`, and `RATE_LIMIT_SALT` exist as Worker secrets and no value is in source, EAS public variables, command output, or the app bundle.
3. Confirm the declared rate-limit bindings, Gemini quota/budget alerts, and Cloudflare notifications in their consoles.
4. Run the local release gate. Deploy the candidate with `npx wrangler deploy --config wrangler.subscription-production.jsonc`, record the new version, and run the smoke sequence.
5. Rotate a provider key by creating the replacement, setting it with `npx wrangler secret put`, redeploying, completing the relevant smoke, then revoking the old key. Rotate `RATE_LIMIT_SALT` only as an intentional incident or maintenance action because existing rate-limit keys will change.

Never print, paste into release notes, or commit a secret. If a secret appears in source, a client build, a log, or captured output, treat it as compromised: halt the affected remote path, preserve non-secret evidence, rotate it, and verify the old value is revoked.

### Subscription staging owner checkpoint

This action changes external Cloudflare state. Deployment normally has no direct cost on the configured plan. Gemini compatibility and hosted quota smokes call a paid provider and require separate owner approval before each run.

1. Confirm the Cloudflare account: `npx wrangler whoami`.
2. Create each staging secret with `npx wrangler secret put <NAME> --config wrangler.subscription-staging.jsonc`: `USDA_API_KEY`, `GEMINI_API_KEY`, `RATE_LIMIT_SALT`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `AI_GRANT_SIGNING_KEY`, and `QUOTA_IDENTITY_SALT`. Do not print values.
3. Configure non-secret model rates without guessing. `GEMINI_PRICING` is a JSON object with a `dated` field and per-model `input`, `output`, and optional `cached` USD-per-million rates. Read each rate from the provider's current price list at the time of the change and record that date; do not carry a rate forward on the assumption it still holds. A model the table does not name is priced as unknown rather than as free. If `cached` is omitted, cached input uses the ordinary input rate. The older shared pair `GEMINI_INPUT_USD_PER_MILLION` / `GEMINI_OUTPUT_USD_PER_MILLION` still applies to any model the table omits, but it reports one rate for models that do not share one. Missing, empty, negative, or non-finite rates intentionally omit `estimatedCostUsd`, and a provider that reports no token usage yields `null` counts rather than zeros.

   Console entries are sampled. Interpret cost and latency as aggregate ratios and percentiles with the sample size stated, and never extrapolate a sum of sampled entries into a bill — reconcile against the provider's own billing totals instead.
4. Deploy with `npx wrangler deploy --config wrangler.subscription-staging.jsonc` only after owner approval.
5. Record the staging URL and configure only the subscription-preview EAS environment as `EXPO_PUBLIC_FOOD_WORKER_URL`; configure its RevenueCat Test Store public key as `EXPO_PUBLIC_REVENUECAT_API_KEY`.
6. Obtain separate owner approval for cost-bearing provider calls, then run the staging checks in the smoke sequence and record model, status, latency, token counts, and cost estimate without request content or identifiers.
7. Roll back using the recorded prior version. If this is the first deployment and no subscription preview uses it, delete only `eatlog-food-subscription-staging` from the Cloudflare dashboard.

### Subscription production owner checkpoint, deferred

These commands change external production state and are deferred until a separate production release. Run them only from `worker/` at the frozen release commit. They do not modify the subscription-preview EAS environment or `eatlog-food-subscription-staging`.

1. Run `npx wrangler deploy --dry-run --config wrangler.subscription-production.jsonc` and stop on any config, binding, migration, or bundle error.
2. Confirm the Cloudflare account with `npx wrangler whoami`. Verify that the config name is exactly `eatlog-food-subscription-production`; do not use a bare `wrangler deploy` command.
3. If the Worker already exists, run `npx wrangler deployments list --config wrangler.subscription-production.jsonc` and record the current healthy version as the rollback target. If it does not exist, record that this is the first deployment and that no rollback version exists yet.
4. Create each production secret interactively with `npx wrangler secret put <NAME> --config wrangler.subscription-production.jsonc`: `USDA_API_KEY`, `GEMINI_API_KEY`, `RATE_LIMIT_SALT`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `AI_GRANT_SIGNING_KEY`, and `QUOTA_IDENTITY_SALT`. The full expected RevenueCat `Authorization` header value belongs in `REVENUECAT_WEBHOOK_AUTH`; never print or commit it.
5. Deploy exactly `npx wrangler deploy --config wrangler.subscription-production.jsonc`. Record the resulting Worker URL and deployment version, then confirm them with `npx wrangler deployments list --config wrangler.subscription-production.jsonc`.
6. In the EAS `production` environment only, set `EXPO_PUBLIC_FOOD_WORKER_URL` to that production URL and `EXPO_PUBLIC_REVENUECAT_API_KEY` to the Google public SDK key beginning with `goog_`. Do not change the `preview` environment, its `test_` key, or its staging Worker URL.
7. Configure the production RevenueCat webhook endpoint as `<production Worker URL>/v1/revenuecat/webhook`. Configure its `Authorization` header to match the complete value stored in `REVENUECAT_WEBHOOK_AUTH`.
8. Run the read-only health smoke. Run validation and provider smokes only under the approvals in the smoke sequence, then verify a one-time Omelette purchase, restore, refund/revocation, and a valid legacy subscription through expiry from a Play-installed build before rollout. Confirm the production offering has the one-time `eatlog_itik` product and a store-localized price; a preview Test Store offer does not establish production configuration.
9. If the deployment fails a gate, run `npx wrangler rollback <RECORDED_VERSION_ID> --config wrangler.subscription-production.jsonc`, then repeat the minimum recovery smokes. On a first deployment with no rollback version, halt the app rollout and remove only `eatlog-food-subscription-production` after confirming no production build or RevenueCat webhook uses it.

## Rollback

**OWNER-ONLY — changes production state.**

1. Halt app rollout or provider smoke traffic if a release condition below is met.
2. Run `npx wrangler deployments list --config wrangler.subscription-production.jsonc` and verify the recorded previous healthy version.
3. Run `npx wrangler rollback <VERSION_ID> --config wrangler.subscription-production.jsonc` with that exact ID. Do not rely on an unrecorded implicit target during an incident.
4. Run read-only health, the validation smoke, and only the provider checks needed to prove recovery.
5. Record the failed version, restored version, time, reason, checks, and owner. Do not resume rollout until the cause and privacy impact are understood.

Before first production use, drill this sequence on a preview Worker: deploy a harmless preview version, verify the preview app, roll back to its recorded healthy version, repeat smoke, and save the non-secret evidence. The drill is not complete until an authorized owner performs it.

## Severity and halt conditions

- P0: secret or private-content exposure, data loss, unsafe target behavior linked to a remote result, runaway cost/abuse, or broad startup failure. Halt distribution and the affected remote path immediately.
- P1: Scan, Describe, or USDA broadly unavailable; malformed provider data reaches users; rate limiting fails open; rollback is unavailable. Pause rollout, restore the healthy Worker, and prepare a tested fix.
- P2: provider degradation with Manual/local logging intact or a material device-specific defect. Record and fix before public release unless the owner accepts it in writing.
- P3: cosmetic or low-impact operational issue. Record it for the next maintenance release.

## Coordination protocol and rollback target

Estimate responses carry `X-Eatlog-Protocol: 2`. Requests may carry `X-Eatlog-Request-Version: 2`; both are headers, so the JSON body contract installed clients send is unchanged and a Worker that predates the protocol simply omits and ignores them.

Deploy a compatible Worker before the app that offers hosted AI. A client that sends a random per-action identifier is safe against an older Worker, which treats it as any other identifier. A client that still derives its identifier from the payload is safe against this Worker, which deduplicates only inside a two-minute window and charges a later resubmission of the same meal normally. My key estimates use direct Google requests and have no Worker protocol dependency.

Before enabling a new app path, record a rollback Worker version that already understands this protocol. An older Worker remains deployable in an emergency, but it reintroduces free duplicate execution and is not an acceptable ongoing rollback target — prepare the compatible build first and note its version here alongside the deployed one.

Never claim the production Worker is ready while the named owner, deployed-version evidence, provider smoke, quota/alerts, sampled-log review, and rollback drill remain unverified.
