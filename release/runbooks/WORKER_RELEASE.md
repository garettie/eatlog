# Worker release and rollback

This runbook covers Eatlog's Gemini and USDA gateway. Steps marked **OWNER-ONLY** require production credentials or can change external state. The account-free release audit runs only local checks and the read-only health check when a configured public origin is available.

Subscription work must first use `wrangler.subscription-staging.jsonc`. It must not be deployed over the Worker used by the existing preview APK. Creating or deploying that staging Worker, adding its secrets, or configuring a production RevenueCat webhook are separate owner checkpoints.

## Local release gate

Run from `worker/` at the candidate commit:

```bash
env TMPDIR=/tmp npm ci
npm test
npm run typecheck
npm run dry-run
npm audit --omit=dev
```

`npm run dry-run` validates and bundles locally; it does not deploy. Record the commit from `git rev-parse HEAD`, Worker package version, command results, and the generated bundle size. Stop on a test, type, config, secret-scan, or audit failure.

## Version and configuration record

Before any production change, record these facts in the release record without secret values:

- app commit, app version/builds, and Worker commit/package version;
- production Worker origin and current deployment version;
- previous healthy deployment version and exact rollback target;
- Gemini primary/fallback models and the date their availability was checked;
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
4. **OWNER-ONLY — Gemini cost and quota.** Run Describe with non-sensitive synthetic text. Run Scan only after explicit cost approval, using a non-identifying test image captured for release QA. Confirm primary/fallback behavior, bounded timeout, response normalization, and editable results without saving real data.
5. Exercise rate limiting in a local/test harness. Confirm HTTP 429 and `Retry-After: 60`. Unit tests cover limiter failures, upstream timeouts, malformed upstream JSON/content type/shape, and redacted 4xx/5xx logs without calling providers.

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

This action changes external Cloudflare state. It does not itself create an EAS build, Play product, or production webhook, and it normally has no direct cost on the configured plan.

1. Confirm the Cloudflare account: `npx wrangler whoami`.
2. Create each staging secret with `npx wrangler secret put <NAME> --config wrangler.subscription-staging.jsonc`: `USDA_API_KEY`, `GEMINI_API_KEY`, `RATE_LIMIT_SALT`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `AI_GRANT_SIGNING_KEY`, and `QUOTA_IDENTITY_SALT`. Do not print values.
3. Deploy with `npx wrangler deploy --config wrangler.subscription-staging.jsonc` only after owner approval.
4. Record the staging URL and configure only the subscription-preview EAS environment as `EXPO_PUBLIC_FOOD_WORKER_URL`; configure its RevenueCat Test Store public key as `EXPO_PUBLIC_REVENUECAT_API_KEY`.
5. Roll back using the recorded prior version. If this is the first deployment and no subscription preview uses it, delete only `eatlog-food-subscription-staging` from the Cloudflare dashboard.

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
