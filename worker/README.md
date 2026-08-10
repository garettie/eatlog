# Eatlog food Worker

## Local setup

1. Run `npm ci` in `worker/`.
2. Copy `.dev.vars.example` to `.dev.vars` and enter local secrets. Generate `RATE_LIMIT_SALT` with `openssl rand -hex 32`.
3. Run `npx wrangler dev`, `npm test`, `npm run typecheck`, and `npm run dry-run`.

## Deploy

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

The full release, provider smoke, log review, secret-rotation, incident, and rollback procedure is in `../release/runbooks/WORKER_RELEASE.md`.
