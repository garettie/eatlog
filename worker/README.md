# Eatlog food Worker

## Local setup

1. Run `npm install` in `worker/`.
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

Set `EXPO_PUBLIC_FOOD_WORKER_URL` to deployed `workers.dev` URL. Smoke-test `GET /healthz`, valid USDA search, wrong methods, malformed JSON, oversized input, throttling, timeout behavior, and redacted errors. Then rotate USDA and Gemini keys exposed to earlier APKs and remove old public key variables from EAS.

Workers dashboard: inspect **Workers & Pages > eatlog-food > Metrics** for traffic, CPU, errors, and latency; inspect **Logs** for 429/5xx events and rejection categories. Logs intentionally exclude request URLs, bodies, queries, prompts, responses, headers, identifiers, hashes, and secrets.

Rollback with `npx wrangler rollback` and select previous healthy version. Record deployed URL, version, rollback target, key-rotation status, and Gemini project rate/spending-cap confirmation in release notes.
