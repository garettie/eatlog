# Food search quality implementation plan

Owner-approved direction, 2026-09-11. Evidence: `docs/research/2026-09-11-food-search-quality-benchmark.md`.

## Why

A benchmark of 45 common US food searches found:

- **15 of 45 failed outright** (chicken breast, milk, apple, potato, butter, peanut butter, pasta, yogurt, and others). The Worker returns `502 MALFORMED_UPSTREAM` when any one USDA food on the page is unusable.
- **10 of the 30 that returned put the wrong food first** ("rice" → Rice Dressing, "egg" → Egg Benedict, "soda" → Whiskey And Soda).
- **0 of 45 top results had a real serving.** Every one defaulted to 100 g.
- Names read like database rows: "Oatmeal Nfs", "Cheese Cheddar", "Soup Chicken".

FatSecret's public search got 45 of 45 right, with a real serving on 37. Its generic foods are largely USDA's data with clean names, ranking, and servings. This plan closes that gap in three phases.

## Settled

- The remote providers stay USDA FoodData Central and Open Food Facts. FatSecret is ruled out on every tier by its 24-hour storage rule.
- A small bundled JSON list of common foods in the app is approved. The "no bundled food catalog / no JSON dataset" lines in `FOOD_SEARCH_IMPLEMENTATION_PLAN.md` were never an owner decision; Phase 3 removes them.
- The common-foods list covers US-style staples that USDA describes well. Filipino dishes stay with Gemini Describe.

## Order

Phases 1 and 2 are independent. Phase 3 needs both: its generator reads USDA details through the Phase 1 Worker, and Phase 2's evaluator is its scoreboard.

Commit each phase to `main` separately. Other agents share this checkout: stage files by name and re-check `git status` before committing.

---

## Phase 1: the Worker keeps usable USDA foods

### Cause

- `usdaSearch` in `worker/src/index.ts` maps the page through `normalizeUsdaFood`, then throws `502 MALFORMED_UPSTREAM` if **any** food returned `null`.
- `normalizeUsdaFood` requires nutrient IDs 1008 (energy), 1003 (protein), 1005 (carbohydrate), and 1004 (fat).
- USDA Foundation records such as "Chicken, breast, boneless, skinless, raw" and "Pork, chop, center cut, raw" carry energy only as 2047 (Atwater General Factors) and 2048 (Atwater Specific Factors). Records such as "Milk, human" have none of the four.
- `usdaDetail` uses the same normalizer, so opening a Foundation food fails the same way.

### Steps

1. In `normalizeUsdaFood`, when 1008 is absent, take 2048, else 2047, and emit it as `nutrientId: 1008`. Emit 1008 because the app's `parseUSDAMacros` in `src/services/foodSearchCore.ts` reads only 1008. Every shipped app version then works with no app change.
2. In `usdaSearch`, drop foods that normalize to `null` and return the rest. When USDA sent a non-empty page and **none** survive, keep the `502 MALFORMED_UPSTREAM`, because that signals a broken upstream shape. An empty USDA page stays `200` with `foods: []`.
3. Leave `usdaDetail`'s single-food 502 as is. Step 1 already fixes the Foundation records.

### Tests (`worker/test/index.test.ts`, existing helpers `usdaFood()`, `jsonResponse()`, `call()`, `request()`)

- A search page with one valid food and one food missing all four macros → `200` with one food.
- A food with 2047 and 2048 but no 1008 → returned with `nutrientId: 1008` equal to the 2048 value, through both `/v1/usda/search` and `/v1/usda/foods/:id`. A food with only 2047 → 1008 equals the 2047 value.
- The existing test "caps USDA results and rejects malformed provider responses instead of forwarding them" still returns 502 for `{ foods: [{ fdcId: 1, description: 'bad' }] }`.
- A page that dropped foods is cached like any success (follow the pattern in "uses digest-only USDA cache keys, correct TTLs, and caches only successes").

### Done when

- `env TMPDIR=/tmp npm test` passes.
- After the owner deploys the Worker, `npm run evaluate:food-search` reports zero Worker failures across the 45 common queries. On 2026-09-11 there were 14.

### Ship

Worker only. The owner deploys the Worker separately. No app build, no OTA.

---

## Phase 2: the evaluator measures real quality

File: `scripts/evaluate-food-search.ts` (`npm run evaluate:food-search`, reads `EXPO_PUBLIC_FOOD_WORKER_URL` from `.env.local`).

### Flaws

- `containsExpected` passes when the query's tokens appear anywhere in the name, so "Beans And White Rice" counts as a hit for "white rice".
- The portion metric counts `defaultAmount.grams > 0`, which the 100 g reference always satisfies.
- Open Food Facts never runs, because no `openFoodFactsUserAgent` is passed.
- Queries fire back to back and can trip the 30/min `USDA_INSTALL_LIMITER`.

### Steps

1. Replace `expected: string[]` with `accept: RegExp[]`, tested against `normalizeFoodText(item.name)` and anchored `^…$`. For each query, accept the plain food in both USDA wording and the clean wording Phase 3 will add. Examples:
   - `banana`: `/^banana( raw)?$/`. This accepts "Banana Raw" and rejects "Banana Baked" and "Banana Chips".
   - `boiled egg`: `/^(boiled egg|egg whole (boiled or poached|cooked hard boiled))$/`.
   - `white rice`: `/^white rice( cooked)?$/`. This rejects "Beans And White Rice" and "Rice White Cooked Glutinous".

   Build the remaining patterns from real result names. Run the query and read the USDA descriptions; do not guess record names.
2. Count the serving metric on the top result only, when `defaultAmount.kind === 'serving'`.
3. Count `unavailable` outcomes, and partial outcomes with a USDA failure, as misses. List them in a separate failures block.
4. Pass `openFoodFactsUserAgent` from `buildOpenFoodFactsUserAgent(app.json version, EXPO_PUBLIC_SUPPORT_EMAIL)`, reading the email from the environment or `.env.local`. When it is absent, print a warning and run without OFF.
5. Space queries at least 2.1 s apart.
6. Set the targets that decide the exit code: common right food in top 3 ≥ 90%, top result with a real serving ≥ 80%, zero provider failures, explicit brands in top 3 = 100%, top-10 duplicate limit = 100%. It is expected to exit 1 until Phase 3 lands.

### Done when

- For every common query that did not fail in the benchmark report, the evaluator's hit or miss matches the report's Eatlog grade. That is 30 queries: 20 hits and 10 misses.
- The run against the current Worker exits 1 and prints a 0% top-result serving rate.
- The aggregate lines from that run go in the commit message as the baseline.

### Ship

Script only. Nothing ships to users.

---

## Phase 3: bundled common foods

**Goal:** a search for an everyday food shows the plain version first, with a natural name and a real serving, instantly and offline.

Vocabulary: a **common food** is one entry in the bundled list. Use this term in code (`isCommonFood`, `commonFoods`, `searchCommonFoods`) and in UI copy ("Common foods").

### 3a. Data

**Seed.** `scripts/common-foods.seed.json` is authored by hand. Each entry follows this shape:

```ts
interface CommonFoodSeed {
  id: string;             // kebab-case, stable forever: "white-rice-cooked"
  fdcId: number;          // the USDA record the macros come from
  name: string;           // what the user reads: "White Rice, cooked"
  aliases: string[];      // other ways people search: ["white rice", "rice", "steamed rice"]
  portions: { id: string; label: string; grams: number }[]; // "1 cup", "1 large", "1 slice"
  defaultPortionId: string;
}
```

**Choosing the USDA record.**

- Use Survey (FNDDS) for foods eaten prepared: cooked rice, scrambled egg, pizza, soups, coffee. FNDDS carries household portions such as "1 cup" and "1 large".
- Use SR Legacy for ingredients and raw produce, then Foundation.
- Choose the plain record: unflavored, no added fat, or "NFS", when one exists.
- Write portion labels as units people say ("1 cup", "1 slice", "1 large", "1 medium", "1 tbsp", "1 can"). Copy the grams from that record's USDA portions.

**Coverage.** About 300 foods. Start with the 45 common evaluator queries, then add US staples by category: grains and bread, eggs and dairy, meat and fish, fruit, vegetables, legumes and tofu, fats and spreads, drinks, snacks, fast-food basics. Branded products stay with USDA Branded and Open Food Facts.

**Generator.** `scripts/build-common-foods.ts` reads the seed. It fetches each `fdcId` through the deployed Worker's `/v1/usda/foods/:fdcId`, using the same `X-Eatlog-Install-ID` pattern as the evaluator and spacing requests at least 2.1 s apart. It writes `src/data/commonFoods.json` with each seed entry plus the USDA `dataType` and per-100 g calories, protein, carbs, and fat. The generator exits non-zero when:

- a detail request fails;
- a seed portion's grams differ from every USDA portion gram weight on that record by more than 1 g;
- two entries share an `id`, a normalized `name`, or an `fdcId`. `rankAndDeduplicateFoodResults` merges results with the same provider identity, so a shared `fdcId` would collapse two foods into one row.

Before wiring, print a table (name, USDA description, data type, default portion, kcal per default portion) and share it with the owner for a skim.

### 3b. App wiring

1. **`src/services/foodSearchTypes.ts`:** add `isCommonFood?: boolean` and `aliases?: string[]` to `FoodResult`.
2. **`src/services/commonFoods.ts` (new):** import `../data/commonFoods.json`, following the JSON import in `src/utils/shareCards.ts`. Build `FoodResult[]` once at module load:
   - `source: 'usda'`, `sourceFoodId: String(fdcId)`, `dataType` from the JSON, `brand: null`
   - `normalizedName` and `preparation` from `normalizeFoodName(name, null)`
   - `portions` from `buildFoodPortions`, `defaultAmount: { kind: 'serving', … }`
   - `alternateSourceIds: []`, `isCommonFood: true`, `aliases`

   Export `searchCommonFoods(query)`. It returns `[]` when `query.trim().length < 2`, because `matchClass` scores an empty query as a match and the empty-query recents view would otherwise list all 300 foods.
3. **`src/services/foodSearchCore.ts`:**
   - Compute `expandFoodAliases(query)` once per `rankAndDeduplicateFoodResults` call and pass the aliases into `matchClass`. Today `matchClass` rebuilds them, with dozens of `new RegExp` calls, for every candidate. The filter on the ranked list also recomputes every match class that `makeComparator` already stored, so reuse those. A per-query cache cut ranking 300 foods from 11.0 ms to 1.8 ms per search on a dev PC. Phones are slower, and personal search runs on every keystroke.
   - In `matchClass`, score a common food against its name and each alias, and keep the highest class.
   - In the comparator, after the personal, pinned, frequency, and recency keys, rank `isCommonFood` ahead of other results. The user's own history stays first.
4. **`src/services/foodSearch.ts`:**
   - Rename `searchPersonalFoods` to `searchLocalFoods`. It returns `rankAndDeduplicateFoodResults([...personal, ...searchCommonFoods(query)], query, 'common').items`. Update its callers.
   - In `loadFoodDetails`, return a common food unchanged. Otherwise it fetches the USDA detail and spreads it over the row, replacing the clean name and portions. `SearchInputState` awaits it without a catch, so selecting a common food offline would fail.
5. **`src/hooks/useFoodSearchController.ts`:** expose `commonResults` (combined items with `isCommonFood` and no `history`) and remove them from `remoteResults`. A remote USDA row with the same `fdcId` merges into the common food during ranking.
6. **Every screen that renders `useFoodSearchController` results** (start with `src/components/sheet-states/SearchInputState.tsx`; grep for other users): render a **Common foods** section between "From your history" and "Online results", using the existing `SectionTitle` and `foodRow`. Show it regardless of `remoteState`, so it stays visible while online search loads and when the phone is offline. Include `commonResults` in the "no results" check.
7. **Logging:** a common food logs as `source: 'usda'` with its `fdcId` and USDA `dataType`, so history grouping, backups, and CSV export treat it like any USDA food. No schema change.
8. **`FOOD_SEARCH_IMPLEMENTATION_PLAN.md`:** delete the statements that Eatlog will not bundle a food catalog or ship a JSON dataset (objective, success criteria, verification checklist, and out-of-scope sections). Add one line pointing to this plan.

### 3c. Tests (`node:test`, `src/services/*.test.ts`)

- `commonFoods.json` integrity: finite non-negative macros, at least one portion with grams > 0, a `defaultPortionId` that exists, and unique `id`, normalized `name`, and `fdcId`.
- `searchCommonFoods`: empty and one-character queries return `[]`; "white rice" returns the white rice entry first; a query that matches only an alias finds its entry.
- Ranking: a common food outranks a remote USDA result in the same match class; a personal history item outranks a common food; a remote result with the same `fdcId` merges into the common food row.
- `loadFoodDetails` returns a common food untouched even when the USDA loader would throw.
- The existing `foodSearchCore`, `foodSearchEngine`, and `foodSearchRemote` tests stay green.

### Done when

- `env TMPDIR=/tmp npm test` and `npx tsc --noEmit` pass.
- `npm run evaluate:food-search` exits 0: common right food in top 3 ≥ 90%, top result with a real serving ≥ 80%, zero provider failures.
- `src/data/commonFoods.json` is under 200 KB.
- The owner confirms on their phone, with the network off, that searching "white rice" shows the Common foods section with "1 cup".

### Ship

JavaScript and JSON only, so it ships over the air with EAS Update when the owner chooses.
