# Eatlog food Worker

## Local setup

1. Run `npm ci` in `worker/`.
2. Copy `.dev.vars.example` to `.dev.vars` and enter local or Test Store credentials. Never copy production values into this repository.
3. Run `npx wrangler dev --config wrangler.subscription-staging.jsonc`, `npm test`, `npm run typecheck`, and `npm run dry-run`.

The default `wrangler.jsonc` remains the Worker contract used by the installed preview APK. Subscription development uses the separate `eatlog-food-subscription-staging` Worker, SQLite Durable Object, RevenueCat Test Store project, and staging state bindings in `wrangler.subscription-staging.jsonc`.

## Deploy

Do not deploy the subscription staging Worker without owner approval. A staging deployment changes external state but normally has no direct deployment fee on the configured Cloudflare plan. Before approval, the owner must confirm the target account and provide these value names without exposing their values: `USDA_API_KEY`, `GEMINI_API_KEY`, `RATE_LIMIT_SALT`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `AI_GRANT_SIGNING_KEY`, and `QUOTA_IDENTITY_SALT`. Roll back with `wrangler deployments list --config wrangler.subscription-staging.jsonc` followed by `wrangler rollback <VERSION_ID> --config wrangler.subscription-staging.jsonc`, or delete only the new staging Worker after confirming no preview build uses it.

The checked-in config supports the Workers Free plan and therefore relies on
Cloudflare's built-in 10 ms CPU and 50-subrequest limits. Custom `limits` in
`wrangler.jsonc` require the Workers Paid plan.

```bash
npx wrangler login
npx wrangler secret put USDA_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put RATE_LIMIT_SALT
npx wrangler deploy --dry-run
npx wrangler deploy
```

Set `EXPO_PUBLIC_FOOD_WORKER_URL` to the deployed HTTPS origin. With the same origin in `EATLOG_WORKER_URL`, `npm run smoke:health` performs only the read-only health check. `npm run smoke:validation` adds synthetic invalid requests; it does not call USDA or Gemini, but it does consume test rate-limit entries. Run it only against local, preview, or an explicitly approved production Worker.

Workers dashboard: inspect **Workers & Pages > eatlog-food > Metrics** for traffic, CPU, errors, and latency; inspect **Logs** for 429/5xx events and rejection categories. Logs intentionally exclude request URLs, bodies, queries, prompts, responses, headers, identifiers, hashes, and secrets.

Successful Gemini requests also emit one aggregate `ai_usage` record containing only model name, input/output/total token counts, and an estimated USD cost when both non-secret per-million-token rates are configured. No food content or customer identifier is logged.

The full release, provider smoke, log review, secret-rotation, incident, and rollback procedure is in `../release/runbooks/WORKER_RELEASE.md`.
