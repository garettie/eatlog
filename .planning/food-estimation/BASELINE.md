# Food-estimation baseline

Captured 2026-09-05 at commit `857245a`, before any milestone-2 change. This is the state every
later milestone is measured against, and the compatibility surface installed apps already
depend on. Nothing here was deployed, verified against production, or measured against a live
provider; all of it is read from source.

## Model and generation configuration

| Setting | Value |
| --- | --- |
| Pugo model order | `gemini-3.1-flash-lite`, then `gemini-3.5-flash-lite` |
| Paid model order | `gemini-3.1-flash-lite`, then `gemini-3.5-flash-lite` |
| Model cooldown after a failure | 180,000 ms, in isolate memory only |
| Overload statuses that trigger a cooldown | 429, 500, 502, 503, 504 |
| `maxOutputTokens` | 2,048 |
| `responseMimeType` | `application/json` |
| Temperature, thinking budget, media resolution | not set — the provider defaults apply |
| System instruction size | 2,294 bytes |
| Region relay | `GeminiRelay` Durable Object, `locationHint: 'wnam'`, entered only on a location refusal |

## Deadlines and sizes

| Setting | Value |
| --- | --- |
| Client request timeout | 35,000 ms (`src/services/foodScan.ts`) |
| Gemini total budget | 26,000 ms |
| Per-model floor held back for the fallback | 9,000 ms |
| USDA upstream timeout | 8,000 ms |
| RevenueCat body cap | 256 KiB |
| Estimate request body cap | 6 MiB, decoded image cap 4 MiB |
| USDA request body cap | 4,096 bytes |
| Component cap | 20, each at most 10,000 g |
| Subscription-state calls | no explicit timeout |

The timers cover the upstream response headers only. Body reads happen after the timer is
cleared, so none of the numbers above is an end-to-end deadline today.

## Quota and access limits

| Limit | Value |
| --- | --- |
| Pugo (free) | 3 initial estimates per rolling 24 hours; clarification requires paid access |
| Manok trial | 30 per rolling 24 hours and 30 per trial, counted separately for initial and clarification |
| Paid fair use | 30 per rolling 24 hours, 250 per rolling 30 days |
| Refund/abuse ceiling | 5 refunded events per rolling day, applied to every access kind |
| Event retention | 30 days |

## Compatibility surface installed clients depend on

- Routes and methods: `GET /healthz`, `POST /v1/usda/search`, `GET /v1/usda/foods/:id`,
  `POST /v1/estimate`, `POST /v1/access/refresh`, `GET /v1/usage`, `POST /v1/revenuecat/webhook`.
- `X-Eatlog-Install-ID` request header, `/^[a-f0-9]{16,64}$/i`.
- `X-Eatlog-Request-ID` request header, `/^[A-Za-z0-9-]{16,128}$/`, required whenever
  subscriptions are enabled. The current app derives it from a SHA-256 hash of the request
  payload alone.
- `Authorization: Bearer <AI grant>` when the app holds one.
- `X-Eatlog-AI-Grant` and `X-Eatlog-AI-Grant-Expires-At` response headers.
- Error codes the app maps to specific copy: `PAID_ACCESS_REQUIRED`, `PUGO_DAILY_LIMIT`,
  `TRIAL_DAILY_LIMIT`, `TRIAL_ALLOWANCE_EXHAUSTED`, `FAIR_USE_DAILY_LIMIT`,
  `FAIR_USE_30_DAY_LIMIT`, `REFUND_DAILY_LIMIT`, `ENTITLEMENT_UNAVAILABLE`, plus the shared
  upstream failures. `nextEligibleAt` accompanies the rolling-window rejections.
- Estimate response shape: `status`, `unrecognizedReason`, `mealName`, `servesTotal`,
  `servingUnit`, and a `components` array of twelve fields each.

Any change in these has to keep an older installed app working; task 11 owns that check.

## Test results at this baseline

| Suite | Result |
| --- | --- |
| `worker/`: `env TMPDIR=/tmp npm test` | 87 tests, 78 pass, 0 fail, 9 todo |
| `worker/`: `npx tsc --noEmit` | passes |
| app: `env TMPDIR=/tmp npm test` | 500 tests, 490 pass, 0 fail, 10 todo |
| app: `npx tsc --noEmit` | passes |

The todo cases are the milestone-1 regression cases listed below. There were no failing or todo
tests before them, so any future failure is a real regression rather than inherited noise.

## Reproduced defects

Each case asserts the behaviour the service is supposed to have and is marked `todo` with the
task that repairs it, so the suite stays usable while the milestones land.

| Case | Suite | Observed today | Repaired by |
| --- | --- | --- | --- |
| One request ID means one inference | `worker/test/index.test.ts` | 3 provider calls against 1 reserved charge | Task 5 |
| A request ID cannot be reused for different content | `worker/test/index.test.ts` | accepted, second generation is free | Task 5 |
| A provider outage does not lock a customer out | `worker/test/index.test.ts` | 5 provider 503s then `429 REFUND_DAILY_LIMIT` against a healthy provider | Task 4 |
| The deadline covers a stalled response body | `worker/test/index.test.ts` | signal never aborts; the body is read outside the timer | Task 3 |
| Unknown nutrients are never zero | `worker/test/index.test.ts` | `200` with four zero nutrients | Task 2 |
| Impossible masses and densities are rejected | `worker/test/index.test.ts` | `200` for 1,000,000,000 g at 5,000 kcal/100 g | Task 2 |
| A stated amount survives a counted serving label | `worker/test/index.test.ts` | a weighed 30 g becomes 90 g | Task 2 |
| Every attempt is priced, thinking included | `worker/test/index.test.ts` | 1 usage record for 2 attempts, thoughts uncounted | Task 7 |
| Retrying one failed ID counts toward the refund ceiling | `worker/test/subscriptionDurableObject.test.ts` | the memory store blocks the sixth attempt; the Durable Object never does | Task 4 |
| A second deliberate estimate is a new action | `src/services/foodScan.test.ts` | identical text reuses the first identifier | Task 6 |

## Durable Object runtime harness

`worker/test/subscriptionDurableObject.test.ts` runs the real `EntitlementQuotaState` class,
its real SQL, and real SQLite storage. Wrangler bundles it offline (`deploy --dry-run`) and
Miniflare boots the bundle on the `workerd` binary both tools already ship with, so no new
dependency, network access, or Cloudflare account is involved. Each run gets an empty storage
directory, and `restart()` disposes and reboots the runtime on the same storage to exercise
process loss.

One limitation worth carrying forward: the installed `workerd` supports compatibility dates only
up to `2026-08-08`, while staging deploys `2026-08-22`. Nothing this harness exercises is
date-gated, but it means a runtime behaviour proven here is still worth confirming on staging.

## Working tree

Unrelated in-progress work by another agent — the review-sheet components under
`src/components/sheet-states/` and `src/navigation/*.test.ts` — was left untouched. No
application code, configuration, credential, or deployment was changed by this task.
