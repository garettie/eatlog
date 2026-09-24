# Eatlog food Worker

## Local setup

1. Run `npm ci` in `worker/`.
2. Copy `.dev.vars.example` to `.dev.vars` and enter local or Test Store credentials. Never copy production values into this repository.
3. Run `npx wrangler dev --config wrangler.subscription-staging.jsonc`, `npm test`, `npm run typecheck`, and `npm run dry-run`.
4. Before a Play release, also run `npx wrangler deploy --dry-run --config wrangler.subscription-production.jsonc`.

The default `wrangler.jsonc` remains a legacy Worker contract. Preview development uses `eatlog-food-subscription-staging`, its SQLite Durable Object, RevenueCat Test Store project, and staging bindings. A future Play build uses the separate `eatlog-food-subscription-production` Worker and production RevenueCat project. These configs must not share Worker names, Durable Object state, rate-limit namespace IDs, secret storage, or EAS environments.

## AI routes and cost metadata

Eatlog's free local features and My key route do not use this Worker for estimates. My key sends the selected estimate directly to Google with the user's own key. Hosted Eatlog AI requires an active `eatlog_paid` entitlement (one-time `eatlog_itik`, a valid legacy subscription, or a complimentary grant); a free install gets `402 PAID_ACCESS_REQUIRED` before any Gemini call. Hosted Scan, Describe, and meal/component re-estimation use `gemini-3.5-flash-lite` with `gemini-3.1-flash-lite` fallback. On a location refusal, the same model retries through the `wnam`-pinned GeminiRelay Durable Object. The route keeps one prompt and schema, a 2,048-token output cap, and a shared 20-second fallback budget.

The Worker enforces 30 combined hosted operations per rolling 24 hours and 250 per rolling 30 days, plus a five-per-day ceiling for rejected-food refunds. A one-time purchase is access to this bounded hosted service, not unlimited or guaranteed perpetual provider use. The app's My key route follows Google's separate project/model quota and billing rules. USDA search and detail still go through this Worker for free users; Open Food Facts explicit full search is direct from the app.

Set `GEMINI_INPUT_USD_PER_MILLION` and `GEMINI_OUTPUT_USD_PER_MILLION` for aggregate cost estimates on the shared 3.5/3.1 route. These are non-secret deployment configuration, but values must come from the current provider price sheet; missing, empty, negative, or non-finite pairs omit `estimatedCostUsd` rather than falling back to another model's rate.

## Deploy

This preview source update performs no Worker deployment. Before any authorized deployment, confirm the target account and supply these secrets outside git: `USDA_API_KEY`, `GEMINI_API_KEY`, `RATE_LIMIT_SALT`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `AI_GRANT_SIGNING_KEY`, and `QUOTA_IDENTITY_SALT`. Pass the intended config to every secret, deploy, deployment-list, and rollback command. The exact staging and production procedures are in the [release runbook](../release/runbooks/WORKER_RELEASE.md).

The checked-in config supports the Workers Free plan and therefore relies on
Cloudflare's built-in 10 ms CPU and 50-subrequest limits. Custom `limits` in the
Worker configuration require the Workers Paid plan.

Set `EXPO_PUBLIC_FOOD_WORKER_URL` to the deployed HTTPS origin. With the same origin in `EATLOG_WORKER_URL`, `npm run smoke:health` performs only the read-only health check. `npm run smoke:validation` adds synthetic invalid requests; it does not call USDA or Gemini, but it does consume test rate-limit entries. Run it only against local, preview, or an explicitly approved production Worker.

Workers dashboard: inspect **Workers & Pages > eatlog-food-subscription-production > Metrics** for traffic, CPU, errors, and latency; inspect **Logs** for 429/5xx events and rejection categories. Logs intentionally exclude request URLs, bodies, queries, prompts, responses, headers, identifiers, hashes, and secrets.

Successful Gemini requests also emit one aggregate `ai_usage` record containing only model name, input/output/total token counts, and an estimated USD cost when both non-secret per-million-token rates are configured. No food content or customer identifier is logged.

The full release, provider smoke, log review, secret-rotation, incident, and rollback procedure is in `../release/runbooks/WORKER_RELEASE.md`.
