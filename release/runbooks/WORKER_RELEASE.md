# Worker release and rollback

This runbook covers Eatlog's Gemini and USDA gateway. Steps marked **OWNER-ONLY** require production credentials or can change external state. The account-free release audit runs only local checks and the read-only health check when a configured public origin is available.

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
- Pugo Gemini route `gemini-2.5-flash-lite` → `gemini-3.5-flash-lite`, paid/legacy route `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`, and the date all three models' structured-output availability was checked;
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
4. **OWNER-ONLY — Gemini cost, model compatibility, and quota.** After explicit cost approval, use non-sensitive synthetic inputs against staging. Confirm Pugo Describe and Scan use `gemini-2.5-flash-lite`, accept the unchanged structured schema, stay inside the shared 20-second budget, normalize into editable results, and emit the 2.5-specific configured cost. Confirm an approved Manok/Test Store request keeps the `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` route. Exercise fallback only through a controlled staging failure; never weaken the schema to make a model pass.
5. Exercise Pugo's shared rolling allowance with a fresh installation in staging only after owner cost approval: five mixed Scan/Describe reservations succeed, the sixth returns `PUGO_DAILY_LIMIT`, and usage reports zero remaining plus `nextEligibleAt`. Exercise paid-only clarification and every boundary/concurrency case in the local test harness.

Do not run provider smokes against production merely to fill a checklist. Stop if they would incur unapproved cost, consume a constrained quota, or use personal content.

## Log contract

Eatlog console entries may contain only:

- `route`;
- `status`;
- `latencyMs`;
- `upstream` category;
- `cache` outcome;
- `rejection` category.

Aggregate `ai_usage` entries may additionally contain only `event`, `model`, `inputTokens`, `outputTokens`, `totalTokens`, and `estimatedCostUsd`.

They must not contain URLs, methods, request or response bodies, search queries, descriptions, prompts, provider responses, raw installation tokens, token hashes, IP addresses, headers, request IDs, or secrets. Unit tests assert the exact field allowlist. Automatic Cloudflare invocation logs are disabled because they can include request and response metadata; Eatlog keeps only its sampled structured console entries. **OWNER-ONLY:** after the approved smoke, inspect a sampled 4xx and 5xx entry in Workers Logs, confirm the allowlist by hand, and record only pass/fail plus the deployment version. Do not copy the log payload into the repository.

Use Cloudflare Worker metrics, store crash/vitals reports, and the monitored support inbox for v1. Do not add a telemetry or advertising SDK.

## Deploy and secret rotation

**OWNER-ONLY — changes production state.**

1. Confirm the intended Cloudflare account and Worker with `npx wrangler whoami` and `npx wrangler deployments list`.
2. Confirm `USDA_API_KEY`, `GEMINI_API_KEY`, and `RATE_LIMIT_SALT` exist as Worker secrets and no value is in source, EAS public variables, command output, or the app bundle.
3. Confirm the declared rate-limit bindings, Gemini quota/budget alerts, and Cloudflare notifications in their consoles.
4. Run the local release gate. Deploy the candidate with `npx wrangler deploy`, record the new version, and run the smoke sequence.
5. Rotate a provider key by creating the replacement, setting it with `npx wrangler secret put`, redeploying, completing the relevant smoke, then revoking the old key. Rotate `RATE_LIMIT_SALT` only as an intentional incident or maintenance action because existing rate-limit keys will change.

Never print, paste into release notes, or commit a secret. If a secret appears in source, a client build, a log, or captured output, treat it as compromised: halt the affected remote path, preserve non-secret evidence, rotate it, and verify the old value is revoked.

### Subscription staging owner checkpoint

This action changes external Cloudflare state. Deployment normally has no direct cost on the configured plan. Gemini compatibility and Pugo quota smokes call a paid provider and require separate owner approval before each run.

1. Confirm the Cloudflare account: `npx wrangler whoami`.
2. Create each staging secret with `npx wrangler secret put <NAME> --config wrangler.subscription-staging.jsonc`: `USDA_API_KEY`, `GEMINI_API_KEY`, `RATE_LIMIT_SALT`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `AI_GRANT_SIGNING_KEY`, and `QUOTA_IDENTITY_SALT`. Do not print values.
3. Configure non-secret model rates without guessing: `GEMINI_25_INPUT_USD_PER_MILLION` and `GEMINI_25_OUTPUT_USD_PER_MILLION` for Gemini 2.5 Flash-Lite; `GEMINI_INPUT_USD_PER_MILLION` and `GEMINI_OUTPUT_USD_PER_MILLION` for the 3.5/3.1 route. Missing, empty, negative, or non-finite rates intentionally omit `estimatedCostUsd`.
4. Deploy with `npx wrangler deploy --config wrangler.subscription-staging.jsonc` only after owner approval.
5. Record the staging URL and configure only the subscription-preview EAS environment as `EXPO_PUBLIC_FOOD_WORKER_URL`; configure its RevenueCat Test Store public key as `EXPO_PUBLIC_REVENUECAT_API_KEY`.
6. Obtain separate owner approval for cost-bearing provider calls, then run the staging checks in the smoke sequence and record model, status, latency, token counts, and cost estimate without request content or identifiers.
7. Roll back using the recorded prior version. If this is the first deployment and no subscription preview uses it, delete only `eatlog-food-subscription-staging` from the Cloudflare dashboard.

### Subscription production owner checkpoint

These commands change external production state. Run them only from `worker/` at the frozen release commit. They do not modify the subscription-preview EAS environment or `eatlog-food-subscription-staging`.

1. Run `npx wrangler deploy --dry-run --config wrangler.subscription-production.jsonc` and stop on any config, binding, migration, or bundle error.
2. Confirm the Cloudflare account with `npx wrangler whoami`. Verify that the config name is exactly `eatlog-food-subscription-production`; do not use a bare `wrangler deploy` command.
3. If the Worker already exists, run `npx wrangler deployments list --config wrangler.subscription-production.jsonc` and record the current healthy version as the rollback target. If it does not exist, record that this is the first deployment and that no rollback version exists yet.
4. Create each production secret interactively with `npx wrangler secret put <NAME> --config wrangler.subscription-production.jsonc`: `USDA_API_KEY`, `GEMINI_API_KEY`, `RATE_LIMIT_SALT`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `AI_GRANT_SIGNING_KEY`, and `QUOTA_IDENTITY_SALT`. The full expected RevenueCat `Authorization` header value belongs in `REVENUECAT_WEBHOOK_AUTH`; never print or commit it.
5. Deploy exactly `npx wrangler deploy --config wrangler.subscription-production.jsonc`. Record the resulting Worker URL and deployment version, then confirm them with `npx wrangler deployments list --config wrangler.subscription-production.jsonc`.
6. In the EAS `production` environment only, set `EXPO_PUBLIC_FOOD_WORKER_URL` to that production URL and `EXPO_PUBLIC_REVENUECAT_API_KEY` to the Google public SDK key beginning with `goog_`. Do not change the `preview` environment, its `test_` key, or its staging Worker URL.
7. Configure the production RevenueCat webhook endpoint as `<production Worker URL>/v1/revenuecat/webhook`. Configure its `Authorization` header to match the complete value stored in `REVENUECAT_WEBHOOK_AUTH`.
8. Run the read-only health smoke. Run validation and provider smokes only under the approvals in the smoke sequence, then verify a production purchase, restore, cancellation-through-expiry, and Itik refund/revocation from a Play-installed build before rollout.
9. If the deployment fails a gate, run `npx wrangler rollback <RECORDED_VERSION_ID> --config wrangler.subscription-production.jsonc`, then repeat the minimum recovery smokes. On a first deployment with no rollback version, halt the app rollout and remove only `eatlog-food-subscription-production` after confirming no production build or RevenueCat webhook uses it.

## Rollback

**OWNER-ONLY — changes production state.**

1. Halt app rollout or provider smoke traffic if a release condition below is met.
2. Run `npx wrangler deployments list` and verify the recorded previous healthy version.
3. Run `npx wrangler rollback <VERSION_ID>` with that exact ID. Do not rely on an unrecorded implicit target during an incident.
4. Run read-only health, the validation smoke, and only the provider checks needed to prove recovery.
5. Record the failed version, restored version, time, reason, checks, and owner. Do not resume rollout until the cause and privacy impact are understood.

Before first production use, drill this sequence on a preview Worker: deploy a harmless preview version, verify the preview app, roll back to its recorded healthy version, repeat smoke, and save the non-secret evidence. The drill is not complete until an authorized owner performs it.

## Severity and halt conditions

- P0: secret or private-content exposure, data loss, unsafe target behavior linked to a remote result, runaway cost/abuse, or broad startup failure. Halt distribution and the affected remote path immediately.
- P1: Scan, Describe, or USDA broadly unavailable; malformed provider data reaches users; rate limiting fails open; rollback is unavailable. Pause rollout, restore the healthy Worker, and prepare a tested fix.
- P2: provider degradation with Manual/local logging intact or a material device-specific defect. Record and fix before public release unless the owner accepts it in writing.
- P3: cosmetic or low-impact operational issue. Record it for the next maintenance release.

Never claim the production Worker is ready while the named owner, deployed-version evidence, provider smoke, quota/alerts, sampled-log review, and rollback drill remain unverified.
