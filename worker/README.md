# Eatlog food Worker

## Local setup

1. Run `npm ci` in `worker/`.
2. Copy `.dev.vars.example` to `.dev.vars` and enter local or Test Store credentials. Never copy production values into this repository.
3. Run `npx wrangler dev --config wrangler.subscription-staging.jsonc`, `npm test`, `npm run typecheck`, and `npm run dry-run`.
4. Before a Play release, also run `npx wrangler deploy --dry-run --config wrangler.subscription-production.jsonc`.

The default `wrangler.jsonc` remains the legacy Worker contract. Subscription development uses `eatlog-food-subscription-staging`, its SQLite Durable Object, RevenueCat Test Store project, and staging bindings. Play builds use the separate `eatlog-food-subscription-production` Worker and production RevenueCat project. The three configs must not share Worker names, Durable Object state, rate-limit namespace IDs, secret storage, or EAS environments.

## AI routes and cost metadata

Pugo access, Manok trial, Manok, Itik, complimentary access, and the subscription-disabled legacy route all route `scan` and `describe` through `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`. `gemini-2.5-flash-lite` was dropped from the Pugo route: Google's API now returns `404 NOT_FOUND` for it ("no longer available to new users"), confirmed by a live staging probe on 2026-09-01, contradicting the "no shutdown date" status shown on `ai.google.dev`'s model card and deprecations page at the same time. Both routes keep the same prompt, request schema, structured response schema, 2,048-token output cap, and shared 20-second fallback budget. Pugo clarification is rejected before provider dispatch.

Set `GEMINI_INPUT_USD_PER_MILLION` and `GEMINI_OUTPUT_USD_PER_MILLION` for aggregate cost estimates on the shared 3.5/3.1 route. These are non-secret deployment configuration, but values must come from the current provider price sheet; missing, empty, negative, or non-finite pairs omit `estimatedCostUsd` rather than falling back to another model's rate.

## Deploy

Do not deploy either subscription Worker without owner approval. A deployment changes external state. Before approval, the owner must confirm the target account and supply these secret values without exposing them: `USDA_API_KEY`, `GEMINI_API_KEY`, `RATE_LIMIT_SALT`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `AI_GRANT_SIGNING_KEY`, and `QUOTA_IDENTITY_SALT`. Always pass the intended subscription config to secret, deploy, deployment-list, and rollback commands; never use a bare deploy command for a subscription Worker. The exact staging and production procedures are in the release runbook.

The checked-in config supports the Workers Free plan and therefore relies on
Cloudflare's built-in 10 ms CPU and 50-subrequest limits. Custom `limits` in the
Worker configuration require the Workers Paid plan.

```bash
npx wrangler login
npx wrangler secret put USDA_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put RATE_LIMIT_SALT
npx wrangler deploy --dry-run
npx wrangler deploy
```

Set `EXPO_PUBLIC_FOOD_WORKER_URL` to the deployed HTTPS origin. With the same origin in `EATLOG_WORKER_URL`, `npm run smoke:health` performs only the read-only health check. `npm run smoke:validation` adds synthetic invalid requests; it does not call USDA or Gemini, but it does consume test rate-limit entries. Run it only against local, preview, or an explicitly approved production Worker.

Workers dashboard: inspect **Workers & Pages > eatlog-food-subscription-production > Metrics** for traffic, CPU, errors, and latency; inspect **Logs** for 429/5xx events and rejection categories. Logs intentionally exclude request URLs, bodies, queries, prompts, responses, headers, identifiers, hashes, and secrets.

Successful Gemini requests also emit one aggregate `ai_usage` record containing only model name, input/output/total token counts, and an estimated USD cost when both non-secret per-million-token rates are configured. No food content or customer identifier is logged.

The full release, provider smoke, log review, secret-rotation, incident, and rollback procedure is in `../release/runbooks/WORKER_RELEASE.md`.
