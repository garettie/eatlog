# History-First Food Search Implementation Plan

## Status and objective

This plan replaces the previous API-first plan. Eatlog will not bundle or download a food catalog. It will not use FatSecret or add barcode search.

The search experience will use the user's own logging history first, including individual components created by image and description scans. Remote USDA and Open Food Facts results will cover foods the user has not logged. An explicit Gemini estimate will cover gaps. Once the user logs a result, the existing `food_logs` rows make it available offline.

Success means:

- A search finds matching standalone foods and meal components without waiting for the network.
- Empty-query results show pinned and recent foods and meals.
- Personal matches rank above equivalent provider matches and keep the user's last portion.
- Search remains useful offline for prior foods, meal components, meals, and manual entry.
- Online failures do not hide personal results.
- Quick-log reproduces the latest quantity and nutrition and supports undo.
- The APK contains no bundled food database, JSON dataset, or CSV dataset.
- The Expo bundle contains no USDA or Gemini secret.
- The Worker rejects undocumented routes, malformed or oversized input, and requests over its layered abuse limits before contacting an upstream provider.
- Worker logs contain operational metadata without food queries, descriptions, images, device identifiers, prompts, responses, or secrets.

## Product behavior

### One search surface

Replace the separate Recent and Search screens with one food-search screen.

- The existing Recent menu action opens it with an empty query and no autofocus.
- The existing Search menu action opens it with the input focused.
- Keep the entry-method menu and the current whole-meal review flow.
- Reuse the same search controller and food rows in the meal component editor.

With an empty query, show pinned entries first and then recent entries. Mix individual foods and whole meals by pin state and recency, but label whole meals and keep them as a distinct result type.

With a query, render these sections:

1. **From your history**: standalone logs and individual meal components.
2. **Meals**: complete logged meals whose names match.
3. **Online results**: USDA and Open Food Facts candidates.

Do not block the first two sections while online search runs. Show online loading and failure states inside the online section.

### Result rows and actions

Each food row shows:

- Food name.
- Brand or personal-history context.
- Calories for the default portion.
- Portion label and grams when known.
- A pin control for personal entries.
- A quick-log control for personal food and component entries.

Hide provider terminology such as `Survey (FNDDS)` from the main row. Use short provenance labels such as `Your history`, `USDA`, and `Open Food Facts` where provenance helps the user.

Tapping any food opens portion review. Quick-log copies the representative log's grams and absolute calories, protein, carbohydrates, and fat to the active diary date. It uses the entry flow's initial meal when provided, otherwise `defaultMealForNow()`. The new row must have `meal_id = NULL`, even when the source item came from a meal component. Use the existing completion toast and delete-by-ID undo pattern.

Whole-meal rows continue to open meal review. They do not receive the individual-food quick-log control.

### No-result behavior

When personal and online searches return no useful food, show:

- `Estimate "<query>" with AI`.
- `Enter manually`.

The AI action must remain explicit. Send the query through the existing description-estimation contract, open component review, and require confirmation before logging. The saved meal and its component rows then join personal search history.

When the device is offline, keep personal results visible and show a short online-unavailable message. Manual entry remains available. A user with no history and no connection will not receive generic food results.

## Personal history search

### Database query

Replace the search runtime's dependency on `food_cache` with a history query over the existing `food_logs`, `meals`, and `pinned_foods` tables. Do not add a catalog table or persist remote result pages.

The history query must include:

- Standalone rows where `meal_id IS NULL`.
- Component rows where `meal_id IS NOT NULL`, including `scan` and `describe` sources.
- Manual and provider-backed logs.
- The parent meal name and photo for a component when present.
- The latest row, last-used time, usage count, and all legacy pin keys needed to determine pin state.

Keep complete-meal matching in the existing meal query. Do not return a component as a complete meal.

### Nutrition normalization and clustering

Create personal candidates from actual log rows before combining them with remote results.

- Use `source + source_food_id` as the identity when a provider ID exists.
- Otherwise group candidates by normalized name, brand, and preparation.
- Within a name group, merge candidates when all four per-100 g macro differences are at or below the existing 20% threshold.
- Keep candidates separate when any macro exceeds that threshold.
- Do not merge candidates with missing macro data unless their provider identity matches.
- Choose the newest row as the cluster representative.
- Sum usage counts and retain the newest `logged_at`, photo, parent-meal context, and portion.
- Treat a cluster as pinned when any member's legacy `food_key` is pinned. Use a stable history key based on normalized name, brand, and preparation for future pin toggles. Keep existing whole-meal pin keys unchanged.

If a representative lacks per-100 g values, derive them from its absolute macros and positive `grams_logged`. Exclude the row from reusable food results when neither stored nor derivable macro values exist.

### Matching and ranking

Keep normalization and ranking in the pure search-core module. Apply matching in this order:

1. Exact normalized name or alias.
2. Name prefix.
3. Every query token matching a candidate token or token prefix.
4. One Damerau-Levenshtein edit for tokens containing at least five characters.

Reject multi-token candidates that match only one query token. Keep singular/plural handling and existing preparation extraction.

Add a small bidirectional Filipino-English alias map for provider rewriting and matching. Initial groups:

- talong / eggplant
- kamote / sweet potato
- sayote / chayote
- pechay / bok choy
- kangkong / water spinach
- bangus / milkfish
- galunggong / round scad
- calamansi / calamondin
- malunggay / moringa
- togue / mung bean sprouts
- tokwa / tofu
- lugaw / rice porridge

Within each lexical tier, rank candidates in this order:

1. Personal history before remote providers.
2. Pinned before unpinned.
3. Higher usage count.
4. Newer use date.
5. Better preparation agreement and complete nutrition.
6. Stable provider order and source ID.

When a personal result and remote result represent the same provider ID or pass the existing name, preparation, brand, and macro deduplication rule, keep the personal result as canonical so its last portion survives.

## Portion and result model

Replace the app-level single-serving fields with a portion list:

```ts
export interface FoodPortion {
  id: string;
  label: string;
  grams: number;
}

export interface FoodHistoryMetadata {
  representativeLogId: number;
  lastLoggedAt: string;
  timesLogged: number;
  lastGrams: number;
  pinKey: string;
  parentMealName: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
```

Add `portions`, `defaultPortionId`, and optional `history` metadata to `FoodResult`. Keep per-100 g macros and provider provenance. Update all search parsers, fixtures, review code, and component-add code to use the new portion model. The database schema and backup format remain unchanged.

Build portions as follows:

- History: the latest logged amount first, then its provider/serving size when different, then 100 g.
- USDA: every valid household portion from selected-item details, then 100 g.
- Open Food Facts: its valid serving, then 100 g.
- AI/manual: the reviewed amount, then 100 g when gram-based nutrition supports it.

Deduplicate equal gram weights and invalid or non-positive portions. History defaults to the last logged amount. A remote food defaults to its first valid household serving, then 100 g. Remove the arbitrary 150 g fallback from review; use 100 g only when no valid portion exists.

The review screen must let the user select a named portion or grams. Store the selected portion's grams, label, and absolute nutrition in the existing log columns.

## Search lifecycle and remote providers

Create one shared controller or hook used by standalone search and component search.

- Load and rank personal history for every query change, including a one-character query.
- Start common USDA search after a 350 ms debounce when the trimmed query contains at least two characters.
- Cancel the previous remote request when the query changes or the screen unmounts.
- Ignore stale responses with the existing sequence-guard pattern.
- Keep the bounded 50-entry, five-minute in-memory remote cache.
- Never persist remote search result pages on-device.
- Preserve partial and unavailable provider states without clearing local sections.

Common typeahead requests search USDA Survey, Foundation, and SR Legacy foods. Keyboard submission performs full search by adding USDA Branded and Open Food Facts.

Do not send Open Food Facts requests per keystroke. Call its full-text endpoint only after explicit submission and keep it optional when its rate limit or service fails.

Remove the eager USDA batch-detail request for the top search results. Search responses provide enough nutrition for rows. Fetch full USDA details and portions only after the user selects a result. A detail failure must leave a 100 g review option usable.

## Cloudflare Worker

Add a standalone `worker/` project with its own package manifest, Wrangler configuration, source, tests, and deployment instructions. It will expose:

```text
GET  /healthz
POST /v1/usda/search
GET  /v1/usda/foods/:fdcId
POST /v1/estimate
```

`POST /v1/usda/search` accepts `{ "query": string, "mode": "common" | "full" }`. Keeping the query in the body prevents Worker invocation logs from recording food-search text in a URL.

`POST /v1/estimate` accepts one fixed operation:

```ts
type EstimateOperation = 'scan' | 'describe' | 'clarify-meal' | 'clarify-component';

interface EstimateRequest {
  operation: EstimateOperation;
  text?: string;
  imageBase64?: string;
}
```

The client sends user input, not a Gemini prompt. The Worker owns the prompts, response schemas, model allowlist, and fallback order.

### Wrangler configuration and secrets

Use Wrangler 4.36 or newer and declare these required Worker secrets:

- `USDA_API_KEY`
- `GEMINI_API_KEY`
- `RATE_LIMIT_SALT`, generated as a random 32-byte value

Configure `wrangler.jsonc` with:

- `secrets.required` containing all three names so deployment fails when a binding is missing.
- Workers Logs with invocation logging enabled and a production head-sampling rate of `0.1`.
- A `10` ms CPU limit and at most `4` subrequests per invocation.
- Separate rate-limit bindings with unique namespace IDs.
- `workers.dev` deployment. Do not require a custom domain for this release.

Store local Worker secrets in `worker/.dev.vars`, add `.dev.vars*` to `.gitignore`, and commit only `worker/.dev.vars.example` with empty values. Production setup uses interactive `wrangler secret put` commands so shell history and repository files do not contain secret values.

Move the mobile app from `EXPO_PUBLIC_USDA_API_KEY` and `EXPO_PUBLIC_GEMINI_API_KEY` to `EXPO_PUBLIC_FOOD_WORKER_URL`. The Worker URL is public configuration. Route scan, describe, clarification, and USDA calls through the Worker. Open Food Facts remains a direct, explicit-submit request because it needs no secret.

After the deployed Worker passes smoke tests, the owner must rotate the USDA and Gemini keys used by previous APK builds and remove both old `EXPO_PUBLIC_*_API_KEY` variables from EAS.

### Request boundary

Treat the Worker URL as public. Do not embed a shared bearer token, Cloudflare Access service token, signing secret, or HMAC key in the APK. CORS and application-name headers do not authenticate a native app.

Enforce these rules before any upstream request:

- Allow only the four documented paths and their exact methods. Return `404` for unknown paths and `405` for wrong methods.
- Accept `application/json` only for both POST routes.
- Require a normalized USDA query between 2 and 100 characters and `mode` equal to `common` or `full`.
- Require a positive decimal FDC ID that fits a JavaScript safe integer.
- Require an estimate operation from the fixed enum. Accept text between 1 and 2,000 Unicode characters only for operations that use text.
- Accept JPEG image data only for operations that use an image. Reject decoded image data over 4 MiB and reject a complete estimate request over 6 MiB. Check `Content-Length` when present and verify the number of bytes read when it is absent or false.
- Require `scan` to contain an image and no text. Require `describe` to contain text and no image. Require both clarification operations to contain text and allow one optional image.
- Verify the decoded JPEG magic bytes instead of trusting the client-provided operation or filename.
- Normalize camera and gallery images in the app before upload: JPEG, maximum 1,600 px on the longest edge, quality `0.65`. Reject an image that still exceeds the Worker limit.
- Reject unknown JSON properties, invalid field combinations, non-finite numbers, malformed base64, and empty values.
- Hard-code the USDA and Gemini origins, USDA page sizes, Gemini model IDs, prompts, and response schemas. Do not accept an upstream URL, API key, model, prompt, page size, or response schema from the client.

Set an 8-second USDA timeout and a 20-second total Gemini timeout. Return stable error objects with a request ID and an application error code. Do not return upstream bodies, stack traces, provider URLs containing credentials, or secret-binding names.

Validate and normalize every upstream response before returning it. Cap the displayed USDA result count at 25 and cap AI components at 20. Reject a malformed provider response instead of forwarding it.

### Layered abuse controls

Send `X-Eatlog-Install-ID` on `/v1/*` Worker requests using Android's existing `expo-application.getAndroidId()`. The Worker validates the identifier, combines it with `RATE_LIMIT_SALT`, hashes it with Web Crypto, and uses the digest as the install rate-limit key. Do not log the raw identifier or digest. This identifier groups requests for throttling; it does not prove that Eatlog sent them. Exempt `/healthz` from the install-ID requirement and upstream rate-limit counters.

Configure these rate-limit bindings:

| Route group | Per install | Loose per-IP ceiling | Per-location emergency ceiling |
| --- | ---: | ---: | ---: |
| USDA search/detail | 30 requests per 60 seconds | 300 per 60 seconds | 1,000 per 60 seconds |
| Gemini estimate/clarification | 5 requests per 60 seconds | 30 per 60 seconds | 100 per 60 seconds |

Use `CF-Connecting-IP` only for the loose ceiling because mobile carrier addresses can represent many users. Use a constant route-group key for each emergency ceiling. Return `429` with `Retry-After: 60` when any binding rejects the request.

Cloudflare rate-limit counters are local and eventually consistent, so they serve as abuse throttles rather than billing or usage accounting. If a rate-limit binding throws or becomes unavailable, fail closed with `503`; do not call the upstream provider.

The owner will use a billing-enabled Gemini project, leave optional prompt/response logging and data sharing disabled, and configure project rate limits and spending caps in Google AI Studio. The implementation must retain Worker-side Gemini throttles because account controls can lag and apply at a different boundary.

### Caching, logging, and operational behavior

Cache only successful normalized USDA responses:

- Common search: 6 hours.
- Full search: 1 hour.
- Food details: 24 hours.

Build cache keys from the validated FDC ID or a SHA-256 digest of the normalized query and mode. For search POSTs, use a synthetic internal GET request containing the digest as the Cache API key; do not place the query text in that key. Do not cache provider errors, rate-limit responses, health responses, Gemini requests, or Gemini responses.

Emit one structured log for errors and rejected requests. Record request ID, route name, method, status, duration, upstream name, cache outcome, and rejection category. Exclude URL query strings, request and response bodies, food descriptions, images, Android IDs, rate-limit digests, headers, and secrets. `/healthz` returns only `{ "ok": true }` and performs no upstream request.

Review Worker metrics and logs after deployment for 429s, 5xx responses, CPU-limit errors, request spikes, and provider latency. The deployment guide must show where to inspect each signal in the Cloudflare dashboard.

Do not add Worker KV, Durable Objects, a server-side food database, authentication, or FatSecret code.

If deployment credentials are unavailable during implementation, finish and test the Worker locally. Document `wrangler login`, `wrangler deploy --dry-run`, `wrangler secret put`, deployment, smoke-test, rollback, and key-rotation commands. Report deployment and owner-managed Gemini account limits as external steps.

## Testing and acceptance cases

Add deterministic tests for:

- History retrieval that includes standalone foods, manual entries, and AI meal components.
- Parent meal context and photos on component results.
- Exact provider identity grouping.
- The 20% history clustering boundary and latest-row selection.
- Per-100 g derivation from absolute macros and grams.
- Exact, prefix, all-token, singular/plural, alias, and one-edit matching.
- Rejection of unrelated any-token matches.
- Personal, pin, frequency, and recency ranking.
- Cross-source deduplication that keeps the personal portion.
- Portion creation, deduplication, defaults, and the removal of the 150 g fallback.
- Immediate local results followed by remote results.
- Cancellation, stale-response protection, cache expiry, partial results, and offline behavior.
- Common USDA search, full USDA search, submit-only Open Food Facts, and selected-item detail loading.
- Worker route and method allowlists, content-type enforcement, field combinations, length limits, byte limits, malformed base64, and upstream error mapping with mocked fetches.
- Fixed upstream origins, model IDs, prompts, page sizes, response schemas, result caps, and component caps.
- Required secret validation and checks that errors, logs, dry-run output, and response payloads do not expose keys or secret-binding names.
- Separate install, IP-ceiling, and emergency rate limits for USDA and Gemini, including `429`, `Retry-After`, and fail-closed limiter errors.
- Android install-ID validation and salted hashing without logging the source identifier or digest.
- USDA cache keys and TTLs, plus proof that errors and Gemini traffic bypass caching.
- Worker timeout, request-ID, stable error, health, log-redaction, and malformed-upstream behavior.
- Quick-log insertion, active date and meal selection, component detachment from its old meal, and undo deletion.

Add an integration case that saves a described or scanned meal containing rice, searches for `rice`, opens the individual component, and quick-logs the same grams and macros.

Verify the UI on Android for:

- Recent entry without keyboard autofocus.
- Search entry with autofocus.
- Personal results appearing before online results.
- Result rows, portion selection, pinning, quick-log, and undo.
- Empty, loading, partial-provider, offline, and AI/manual fallback states.
- Component search inside meal review.

Before handoff:

1. Record the baseline working-tree state and preserve unrelated changes.
2. Run `npm test`.
3. Run `npm run typecheck`.
4. Run `npx expo export --platform android --dev`.
5. Run the Worker tests and local contract checks.
6. Run `npx wrangler deploy --dry-run` and inspect its resolved bindings and bundle contents.
7. Confirm the Expo and Worker outputs contain no USDA key, Gemini key, rate-limit salt, food database, dataset JSON, or dataset CSV.
8. Against the deployed preview Worker, test health, valid USDA search, wrong methods, malformed JSON, oversized input, rate limiting, upstream timeout, and redacted errors.
9. Confirm Workers Logs contain no query text, prompts, images, Android IDs, request bodies, response bodies, or secrets.
10. Record the deployed URL, Worker version, rollback command, secret-rotation status, and the owner's confirmation that Gemini account limits are configured.

## Fixed decisions

- No bundled or downloadable food catalog.
- No FatSecret integration.
- No barcode search in this implementation.
- No automatic AI result mixed into deterministic search results.
- Offline discovery covers the user's history and manual entry only.
- Whole meals keep their review flow; quick-log applies to individual foods and components.
- Android remains the verification target.
- The Worker URL is public. Worker controls bound anonymous abuse but do not authenticate the APK.
- The owner configures Gemini account rate and spending limits before release; the Worker still enforces endpoint throttles.
- A larger public rollout that needs caller authenticity requires a later Play Integrity or user-authentication design.

## References

- [USDA FoodData Central API guide](https://fdc.nal.usda.gov/api-guide/)
- [USDA FoodData Central API specification](https://fdc.nal.usda.gov/api-spec/fdc_api.html)
- [Open Food Facts API guidance and rate limits](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers caching](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Cloudflare Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Gemini API billing and spend caps](https://ai.google.dev/gemini-api/docs/billing)
- [Gemini API data-use terms](https://ai.google.dev/gemini-api/terms)
