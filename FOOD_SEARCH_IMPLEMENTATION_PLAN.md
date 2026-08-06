# API-First Curated Food Search Implementation Plan

## Status and objective

Marco's traditional food search currently combines the user's scan/describe cache with USDA Foundation, USDA SR Legacy, USDA Branded, and Open Food Facts results. It does not query USDA Survey foods (FNDDS), and it sends Open Food Facts requests while the user is typing.

The objective is a useful common-food search experience: ordinary queries should return recognizable foods, practical preparations, and usable portions before noisy branded products. This phase will validate that experience using provider APIs and deterministic code. It will not add an offline food catalog and will not use AI for query rewriting or ranking.

Success means:

- The intended common food appears in the first three results for at least 85% of the evaluation queries.
- No top ten contains more than three near-duplicate entries.
- At least 80% of the first five common-food results have a usable household portion or gram serving.
- An explicitly submitted brand/product query returns the intended branded result in the first three when either provider contains it.
- Failure of one provider still returns results from the remaining sources with the existing partial/unavailable behavior.

## Architecture decision

Use two search modes behind the existing search interface:

```ts
export type FoodSearchMode = 'common' | 'full';

export async function searchFood(
  query: string,
  mode?: FoodSearchMode,
  signal?: AbortSignal,
): Promise<FoodSearchOutcome>;
```

`mode` defaults to `common` for compatibility.

### Common mode: typeahead

Run after a 500 ms debounce once the trimmed query contains at least two characters. Search:

1. The local scan/describe cache.
2. One USDA `/foods/search` request with:
   - `dataType`: `Survey (FNDDS)`, `SR Legacy`, and `Foundation`
   - `pageSize`: 50
   - `pageNumber`: 1

Do not call USDA Branded or Open Food Facts in common mode.

### Full mode: explicit submission

Run when the user presses the keyboard search action. Merge:

1. Fresh local cache results.
2. Common-mode USDA candidates, reusing the session cache when available.
3. Up to 12 USDA Branded candidates.
4. Up to 15 Open Food Facts candidates.

Use Open Food Facts' supported full-text search endpoint rather than passing `search_terms` to API v2. Identify Marco in request headers where React Native permits it, request only the fields already consumed by the app, and treat HTTP 429/503 as a failed optional source.

Verify request identification on an Android build before relying on Open Food Facts. React Native may not honor a custom `User-Agent` consistently. Inspect the emitted request with Android network tooling or a temporary controlled echo endpoint; do not add a native networking dependency solely to force this header. If Marco cannot provide a custom identifier, record the limitation and keep Open Food Facts optional and explicit-submit-only.

This split is required because Open Food Facts limits search to 10 requests per minute per IP and explicitly disallows search-as-you-type use.

### Request lifecycle and caching

- Both search surfaces must abort their previous in-flight request when the query changes or the component unmounts.
- Maintain a remote-only in-memory LRU cache keyed by normalized query and search mode.
- Cache at most 50 entries for five minutes. A cached full result may satisfy a common request; a common result must not satisfy a full request.
- Always query the local scan/describe cache afresh so newly saved personal foods appear immediately.
- Preserve the existing 8-second search timeout and 5-second detail timeout.
- Do not retry automatically. A later user action or expired cache entry is the retry boundary.
- Treat USDA's default 1,000-request-per-hour, per-IP limit as an observable budget. The live evaluator must measure actual request usage rather than assuming debounce and cancellation are sufficient.

## Provider parsing and data model

Extend `FoodResult.dataType` and the `food_logs.data_type` constraint with the exact provider value:

```ts
'Survey (FNDDS)'
```

`FoodResult.source` remains `usda`; no new logging source is introduced.

Update USDA parsing so unknown USDA types are rejected instead of silently becoming `Branded`. Recognize only Foundation, SR Legacy, Survey (FNDDS), and Branded.

Keep provider-specific parsing separate from ranking. Provider parsing must:

- Preserve the original description for matching while producing a cleaner display name.
- Include USDA `additionalDescriptions` in internal search text when present.
- Normalize brand separately instead of deleting brand evidence needed for branded-query matching.
- Accept nutrient IDs 1008, 1003, 1005, and 1004 for calories, protein, carbohydrate, and fat.
- Reject candidates missing any of the four required macro values or containing non-finite/negative values.
- Use `portionDescription`, then `modifier`, then a gram label when selecting a USDA portion label.
- Continue converting Open Food Facts kilojoules to kilocalories only when `energy-kcal_100g` is absent.

After preliminary ranking, request full USDA details in one `/foods` batch call for up to the ten highest-ranked common-food candidates. Merge household portion weights into those candidates without changing their nutrient values. A failed detail request must leave the ranked search results usable in grams.

## Deterministic query normalization

Move normalization, alias expansion, matching, deduplication, and ranking into a pure module with no database or network imports.

Normalization must:

- Lowercase, trim, collapse whitespace, and remove punctuation without discarding meaningful food qualifiers.
- Match straightforward singular/plural forms.
- Extract preparation terms such as raw, cooked, grilled, baked, fried, roasted, steamed, boiled, scrambled, poached, toasted, dried, smoked, canned, and frozen.
- Use a small, bidirectional alias table for established vocabulary differences. Initial groups:
  - aubergine / eggplant
  - garbanzo / chickpea
  - minced beef / ground beef
  - minced pork / ground pork
  - capsicum / bell pepper
  - courgette / zucchini
  - coriander / cilantro
  - rocket / arugula
  - prawn / shrimp
  - scallion / spring onion / green onion
  - maize / corn
  - icing sugar / powdered sugar
- Expand aliases for matching and provider-query rewriting only; never change the displayed food name or nutrition.

Do not add fuzzy spelling, stemming libraries, embeddings, or AI in this phase. Failed real queries should first become regression cases; add a deterministic alias only when it represents a genuine equivalent.

## Ranking and deduplication

Use a stable lexicographic ranking rather than provider response order alone. Compare candidates in this order:

1. Match class: exact normalized name or alias, prefix phrase, all query tokens, then partial token match.
2. Explicit product match: a full submitted query matching both brand and product terms may outrank common foods.
3. Personal relevance: a strong matching scan/describe cache item outranks an equivalent provider item.
4. Common-food source priority: Survey (FNDDS), SR Legacy, Foundation, USDA Branded, then Open Food Facts.
5. Preparation agreement: a requested preparation outranks other preparations; do not automatically prefer raw food.
6. Data usability: complete macros and a usable portion outrank records lacking a portion.
7. Stable tie-breakers: provider order followed by source food ID.

A query is an explicit product match only when its normalized terms include the candidate's brand plus at least one product-name term, or when it exactly matches the candidate's full branded product name. Merely returning a branded candidate does not establish product intent.

Deduplicate using normalized name, preparation, normalized brand, and macro similarity:

- Merge candidates only when all four macros are within 20% of one another.
- Keep distinct preparations and nutritionally different variants separate.
- Prefer the higher-ranked candidate as canonical and retain the other source IDs in `alternateSourceIds`.
- Return no more than 25 displayed results.

## User-interface integration

Keep the current responsive list and result-row design.

Update both search surfaces:

- `SearchInputState`: run common mode during debounce; set `returnKeyType="search"`; run full mode from `onSubmitEditing` without merely dismissing the keyboard.
- `AddComponentSection`: add the same keyboard search action and common/full behavior.
- Continue using sequence guards so late responses cannot replace a newer query.
- Keep existing recents, loading, empty, manual-entry, partial, and unavailable states.
- Add `USDA Survey (FNDDS)` to result and review source labels.
- Update the privacy/service description to mention USDA Survey foods.

Submitting a full search should retain current common results while optional branded sources load, then atomically replace them with the merged ranked result. Do not clear the list or flash an empty state between modes.

## Database migration and backup compatibility

Raise `DATABASE_VERSION` from 6 to 7.

For fresh databases, add `Survey (FNDDS)` to the `food_logs.data_type` check constraint.

For version 6 databases, rebuild `food_logs` inside one exclusive transaction because SQLite cannot widen its check constraint in place:

1. Rename the current table to `food_logs_v6`.
2. Create the version 7 table with the same columns, foreign key, defaults, and the widened data-type constraint.
3. Copy every column explicitly, preserving IDs and timestamps.
4. Drop `food_logs_v6`.
5. Recreate `idx_food_logs_date`.
6. Set `PRAGMA user_version = 7` only after the copy and index creation succeed.

Do not change the backup manifest format. Current restore validation already accepts older database versions, restores the staged database, and calls `initDatabase`; therefore a restored version 6 backup should migrate through the same version 7 path.

Verification must cover:

- Existing version 6 food logs survive migration with identical IDs, macros, sources, meal links, and timestamps.
- A Survey food can be inserted after migration.
- A version 6 backup can be restored by version 7 and then backed up again.
- A failed migration leaves the original version 6 database intact through transaction rollback.

## Test and evaluation plan

Update the test script so service tests are included:

```json
"test": "tsx --test src/utils/*.test.ts src/services/*.test.ts"
```

Add deterministic tests for:

- USDA Survey, SR, Foundation, and Branded fixture parsing.
- Open Food Facts parsing and incomplete-record rejection.
- Alias expansion and provider-query rewriting.
- Singular/plural and preparation matching.
- Common-food priority for generic queries.
- Brand promotion only after an explicit full product query.
- A common and branded candidate tying on match class, with the branded candidate winning only when the submitted query contains both its brand and a product-name term.
- Personal-food priority for equivalent matches.
- Nutritionally different variants remaining separate.
- Similar cross-source records collapsing with alternate IDs retained.
- Stable ordering regardless of provider completion order.
- Common, full, partial, unavailable, cancellation, and cache-expiry behavior.

Add a developer-only live evaluation command. It must read the existing build-time USDA key, run sequentially to respect provider limits, print the first five results for every query, and produce the aggregate acceptance metrics. It must not run as part of `npm test`.

The evaluator must also report:

- Total USDA requests and requests per evaluated query.
- Remote cache hits and misses.
- The first and last observed USDA `X-RateLimit-Remaining` values when the header is available.
- Deduplication near misses: for candidate pairs whose largest macro difference is between 15% and 25%, print both candidates, all four percentage differences, and whether the 20% rule merged them.

Seed it with at least 50 queries spanning:

- Staples: rice, white rice, brown rice, bread, pasta, oatmeal.
- Proteins: egg, chicken breast, fried chicken, ground beef, pork chop, tuna, tofu.
- Produce: banana, apple, potato, tomato, broccoli, avocado.
- Dairy and fats: milk, cheddar cheese, yogurt, butter, peanut butter.
- Prepared foods: hamburger, pizza, pancakes, sandwich, fried rice, chicken soup.
- Beverages and snacks: coffee, orange juice, soda, potato chips, granola bar.
- Preparation distinctions: raw chicken breast, grilled chicken breast, boiled egg, scrambled egg, poached egg, toasted bread, baked potato.
- At least five explicit branded queries chosen from products confirmed to exist in the current USDA/OFF responses.

Every failed real-world query discovered during testing becomes a permanent evaluation case.

Required verification before handoff:

1. Install dependencies from the committed lockfile so the current expanded dependency set is available.
2. Run all automated tests.
3. Run `npm run typecheck` and distinguish any pre-existing unrelated failure from search changes.
4. Run the live search evaluation and record its metrics.
5. Run an Android Expo export.
6. Manually verify both standalone food search and add-component search on Android.

## Decision gate after the API trial

Do not build a catalog merely because search is network-backed.

Classify evaluation failures:

- Candidate exists in the fetched pool but ranks poorly: fix deterministic ranking.
- Candidate appears only under a known equivalent term: extend the alias table.
- Candidate is repeatedly absent from the 50-record common pool: a generated FNDDS/SR catalog becomes justified.
- Search quality passes but provider latency or rate limits make interaction unreliable: consider a generated catalog or a small compliant proxy.
- Search quality passes but the shipped USDA key cannot meet the provider's key-protection requirement: choose a proxy or generated catalog before public production.

USDA's per-IP request accounting reduces the chance that different users consume one shared request budget, but it does not make an embedded client key private or remove USDA's key-protection requirement.

If a catalog becomes necessary, reuse the parsing, normalization, alias, ranking, fixtures, and evaluation suite from this phase. Its purpose will be control over the candidate pool and production API compliance, not offline support.

## Explicit exclusions

- No changes to camera scanning, gallery scanning, meal description, or Gemini prompts.
- No AI calls for traditional food search.
- No new backend, authentication system, or paid nutrition provider.
- No full Open Food Facts download in this phase.
- No frontend redesign beyond the search submission behavior and FNDDS labels.

## References

- [USDA FoodData Central API guide](https://fdc.nal.usda.gov/api-guide/)
- [USDA FoodData Central API specification](https://fdc.nal.usda.gov/api-spec/fdc_api.html)
- [USDA data type documentation](https://fdc.nal.usda.gov/data-documentation/)
- [Open Food Facts API guidance and rate limits](https://openfoodfacts.github.io/openfoodfacts-server/api/)
