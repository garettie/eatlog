# Marco: MVP Completion Specification and Delivery Plan

> **Status:** code-audited 2026-07-29. The daily tracking loop is implemented. Profile/Settings, plan maintenance, data portability, scan failure recovery, and physical Android release verification remain before MVP sign-off.

## 1. Product Contract

Marco is an Android-only, local-first calorie and macro tracker for a single person per install. It starts with a Mifflin-St Jeor target, then provides a scanner-first food log, daily diary, weight analytics, and explicit weekly adaptive target reviews.

### User and operating model

- The app owner and a small friend group sideload an APK; there is no user account, app backend, or social graph.
- One device stores one person's profile, target history, meals, food logs, cached foods, and scan photos.
- Daily behavior: inspect Today, log by camera/gallery/description/search/manual entry, review or edit in Diary.
- Network is required only for Gemini estimation and remote food search. The rest of the product is local.
- The developer provisions Gemini and USDA credentials at build time. Users never enter, view, or manage API credentials.
- Profile replaces the current Sync tab. The app has four tabs: Today, Diary, Analytics, and Profile. The center Add FAB triggers entry and is not a tab. Backup, restore, export, and eventual cloud sync live under Profile > Data & Sync.

### Product promises

1. **Scanner-first:** camera, gallery, and meal description are the leading entry routes.
2. **Local ownership:** no login or cloud dependency; scan photos stay in app-private storage.
3. **Exact enough, always editable:** rulers provide coarse adjustments while direct numeric fields provide precise values.
4. **Premium means calm:** coherent Android behavior, Material 3 surfaces, real typography, purposeful motion, no gamification noise.
5. **Explicit adaptation:** the onboarding formula is a starting estimate; adaptive targets activate only after an eligible review is accepted.
6. **Maintainable plan:** profile, goal, units, and nutrition targets remain editable after onboarding.
7. **Recoverable ownership:** a user can back up, restore, export, or erase local data without an account.

### MVP release definition

MVP means the complete single-device product. It does not mean every planned integration.

- The core logging, diary, weight, analytics, and adaptive flows pass on a signed Android APK.
- Profile provides plan, preference, data, help, privacy, and About routes.
- Profile and target changes preserve history and commit atomically.
- Backup and restore include the database and referenced meal photos.
- Scan failures preserve context and offer useful recovery.
- Cloud multi-device sync, accounts, barcode capture, Health Connect, notifications, and iOS remain post-MVP.

## 2. Fixed Stack and Runtime Constraints

| Area | Current implementation |
| --- | --- |
| Framework | React Native 0.81, Expo SDK 54 managed workflow, TypeScript 5.9 |
| Target | Android APK through EAS Build; iOS is not supported |
| Navigation | React Navigation native stack with four bottom tabs plus a center Add FAB; Profile replaces Sync |
| Styling | NativeWind 4.2, `tailwind.config.js`, `src/theme/tokens.ts` |
| Motion | React Native Reanimated 4.1, with reduced-motion gates |
| Storage | `expo-sqlite` 16, on-device only |
| Sheets | `@gorhom/bottom-sheet` 5 |
| Food/AI | Gemini scan/description; local cache, USDA FoodData Central, Open Food Facts |
| Media | `expo-image-picker` capture/import; `expo-file-system` private meal-photo storage |
| Charts | Custom `react-native-svg` scale/trend chart with Gesture Handler and Reanimated |
| Fonts | Bundled Inter Regular/Medium/SemiBold/Bold via `expo-font` |
| Icons | Expo MaterialIcons and MaterialCommunityIcons |

Do not add auth, backend, network state unrelated to food search/AI, iOS-specific code, or a replacement styling/navigation stack without an explicit product decision.

Build-time API keys must come from the release environment or a local ignored config contract. Never render them, log them, include them in backup/export, or add credential fields to Profile. An APK cannot keep a bundled client secret from a determined extractor, so the sideloaded MVP must use provider restrictions, quotas, and rotation. A production-scale release requires a separate service architecture decision.

## 3. Persistence Model

### Current schema initialization

`initDatabase()` preserves existing data and applies schema changes through versioned, atomic migrations. A cold launch does not reset profile, logs, targets, meals, or cached data.

The current database version is 4. Version 2 added weight units, target weight, and pins; version 3 added adaptive reviews and indexes; version 4 added the Analytics explanation preference.

Meal photos are stored as app-private files. Startup cleanup deletes photo files not referenced by a `meals.photo_uri` row; deletes are intentionally not eager so toast undo can restore a meal without losing its image in the current session.

### Tables

```sql
CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('male','female')),
  height_cm REAL NOT NULL,
  birth_date TEXT NOT NULL,
  activity_level TEXT NOT NULL CHECK (activity_level IN
    ('sedentary','light','moderate','active','very_active')),
  goal_type TEXT NOT NULL CHECK (goal_type IN ('cut','maintain','bulk')),
  goal_rate_kg_per_week REAL NOT NULL,
  protein_preference TEXT NOT NULL CHECK (protein_preference IN
    ('low','moderate','high','extra_high')) DEFAULT 'moderate',
  weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg','lb')),
  target_weight_kg REAL,
  analytics_intro_dismissed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE weight_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date TEXT NOT NULL UNIQUE,
  scale_weight_kg REAL NOT NULL,
  trend_weight_kg REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  log_date TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'snack' CHECK (meal_type IN
    ('breakfast','lunch','dinner','snack')),
  photo_uri TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE food_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('usda','off','manual','scan','describe')),
  source_food_id TEXT,
  meal TEXT NOT NULL DEFAULT 'snack' CHECK (meal IN
    ('breakfast','lunch','dinner','snack')),
  meal_id INTEGER REFERENCES meals(id),
  brand TEXT,
  data_type TEXT,
  preparation TEXT,
  grams_logged REAL,
  serving_size_g REAL,
  serving_label TEXT,
  calories_per_100g REAL,
  protein_g_per_100g REAL,
  carbs_g_per_100g REAL,
  fat_g_per_100g REAL,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE food_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalizedName TEXT NOT NULL,
  brand TEXT,
  preparation TEXT,
  calories_per_100g REAL NOT NULL,
  protein_g_per_100g REAL NOT NULL,
  carbs_g_per_100g REAL NOT NULL,
  fat_g_per_100g REAL NOT NULL,
  serving_size_g REAL,
  serving_label TEXT,
  source TEXT NOT NULL CHECK (source IN ('scan','describe')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE daily_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_date TEXT NOT NULL,
  tdee_estimate REAL NOT NULL,
  target_calories REAL NOT NULL,
  target_protein_g REAL NOT NULL,
  target_fat_g REAL NOT NULL,
  target_carbs_g REAL NOT NULL,
  calculation_method TEXT NOT NULL CHECK (calculation_method IN
    ('initial_estimate','adaptive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The live schema also contains `pinned_foods` and `adaptive_reviews`. `src/db/database.ts` is the source of truth for their full definitions.

### Food and meal semantics

- A standalone `food_logs` row has `meal_id = NULL`.
- A scanner/description/recent-meal review writes one `meals` row and one or more linked component `food_logs` rows.
- A scan/photo is stored on the meal group, never duplicated to each component.
- Diary uses a stored thumbnail when `photo_uri` exists; otherwise `foodIcon(name)` selects a verified MaterialCommunityIcons fallback from the food name.
- Logged totals are persisted beside the per-100g nutrition snapshot, so portion editing is a local recalculation rather than a re-search.

### Planned schema version 5

MVP plan editing requires target provenance beyond the current two-value constraint.

```text
calculation_method =
  initial_estimate
  profile_recalculation
  manual
  adaptive
```

SQLite cannot widen the existing `CHECK` constraint in place. Migration 5 must:

1. Create a replacement `daily_targets_v5` table with all current columns and the expanded check.
2. Copy every current row without changing IDs or timestamps.
3. Replace the old table inside one exclusive transaction.
4. Recreate target indexes and foreign-key relationships.
5. Set `PRAGMA user_version = 5` only after the copy and integrity checks succeed.

Add transaction-level database operations:

- `updateProfileAndPlan(profilePatch, target)` updates the singleton profile, inserts a target effective today, and supersedes pending reviews based on the previous plan.
- `updateProfilePresentation(profilePatch)` changes display name or units without inserting a target when no calculation input changed.
- `resetAllLocalData()` clears database-owned records and referenced meal photos, then reinitializes an empty current-version database.
- Backup operations must close or checkpoint WAL state before copying and must reopen a valid database after restore.

Do not add a generic key/value settings table for choices the MVP does not expose. Weight unit remains on `profile`; height presentation derives from the same Metric/Imperial choice.

## 4. Current User Flows

### 4.1 Onboarding: shipped

Six steps establish the initial profile:

1. Biological sex, optional display name, and birth date through an app-owned month/day/year selector.
2. Metric/imperial unit choice, editable height and starting weight with ruler assistance.
3. Activity level.
4. Cut, maintain, or bulk; target weight and target-rate controls for cut/bulk.
5. Protein preference.
6. A reduced-motion-aware calculation sequence saves the profile, initial weight row, and `initial_estimate` target; completion reveals calorie/macro targets and scanner-first next action.

Height, starting weight, and target weight are always directly editable. The ruler is a coarse controller only: height moves at 8px per unit; tenth-step weight values move at 20px per unit. Rulers expose Android adjustable accessibility actions.

### 4.2 Today: shipped

- Date/goal header and optional adaptive-progress chip.
- Calorie ring with a measured consumed/remaining toggle; the thumb waits for actual layout measurement before rendering.
- Protein/carbs/fat rails with named colors and darker excess overlays.
- Last logged item shortcut or scanner-first empty state.
- Weight surface using the last 30 calendar days, calendar-accurate scale/trend paths, today's/latest reading, target goal, and weight-entry shortcut.

### 4.3 Diary: shipped

- Month navigation plus scrollable day strip with daily calorie completion rings.
- Daily macro rail.
- Breakfast, Lunch, Snack, and Dinner headers maintain the same shape whether populated or empty. Empty headers are inert and reserve the totals slot.
- A hairline divider follows every period header.
- Every actual food and grouped meal is its own inset rounded card; names may wrap to two lines and kcal occupies a fixed right column.
- Swipe right actions: edit and delete. Delete captures the original records and offers undo.
- Grouped meals expand to reveal icon-bearing components and can be edited in the review sheet.
- Diary loading must preserve the one-database-queue rule that avoids Android `NativeStatement` bridge races.

### 4.4 Food entry sheet: shipped

`FoodSheetContent` owns the state machine:

| State | Purpose |
| --- | --- |
| `entry` | Camera, describe, gallery, search, and recent-meal routes |
| `scanning` | Camera/gallery estimation wait state |
| `permission-denied` | Camera recovery path |
| `describe` | Natural-language meal input |
| `review` | Multi-component meal/scan review, portions, macros, logging |
| `search` | Local cache + USDA + Open Food Facts search |
| `recent-foods` | Searchable pinned history with grouped meals and standalone foods |
| `single-food-review` | Serving/grams review for one search result |
| `manual-input` | Direct totals fallback |
| `weight-input` | Today/backdated scale-weight insert or update with preferred unit |

The Android Back button walks the sheet-state history before closing. A discard guard protects edits. Entry Bar routes that begin outside `entry` use force-close behavior so cancel returns cleanly to the app.

### 4.5 Analytics: shipped

- 1M/3M/6M/1Y weight ranges.
- Scale, trend, goal line, range change, weekly rate, and latest readings.
- Average intake and logging coverage exclude missing food dates.
- Current expenditure and calorie targets.
- Goal-rate progress classification.
- Persisted weekly recommendation states: collecting, ready, accepted/kept, and next review.
- Dismissible explanation for trend weight and explicit Accept/Keep target decisions.

### 4.6 Profile/Settings: remaining MVP

`Sync` currently renders `PlaceholderScreen`. Replace that route and icon with a Profile destination backed by a nested native stack.

#### Profile home

Display:

- Initials and display name.
- Current goal, target weight, and planned weekly rate.
- Current calories and protein/carbs/fat.
- Target source and effective date.
- Adaptive review status or next review date.

Groups and rows:

| Group | Rows |
| --- | --- |
| Plan | Personal details; Goal and rate; Nutrition targets |
| Preferences | Units; AI and food sources |
| Data & Sync | Create/restore backup; Export data; Delete all data |
| Help & About | How Marco works; Privacy and data sources; About |

Keep groups to four rows or fewer. Current values appear in row subtitles. Long or consequential edits use full-screen stack routes, not bottom sheets.

#### Personal details

Editable fields:

- Display name.
- Sex used by Mifflin-St Jeor.
- Birth date.
- Height.
- Activity level.

Saving display name alone changes the singleton profile. Saving sex, birth date, height, or activity opens the shared plan preview because these values affect BMR/TDEE.

Current weight does not live in this form. Weight history remains the source of current scale/trend weight and stays editable through weight check-ins.

#### Goal and rate

- Reuse cut, maintain, and bulk choices from onboarding.
- Reuse the bounded weekly rate control.
- Show target weight for cut/bulk; maintenance uses the current trend/scale weight as the default.
- Prefill all values from `profile`.
- Continue goes to a Current/Proposed plan preview.

#### Nutrition targets

Two modes:

1. **Calculated:** derive targets from current profile inputs, latest trend weight or latest scale weight, and the existing allocator.
2. **Custom:** edit calories, protein, carbs, and fat directly.

Custom validation:

- Calories and macros must be finite and positive.
- Use the same practical upper bounds as the logging and target domain; reject values that cannot represent a daily plan.
- Show macro-implied energy (`protein*4 + carbs*4 + fat*9`) beside entered calories.
- If entered calories and macro-implied energy differ materially, require the user to correct them before Save. Use one documented tolerance in code and tests.

Plan preview:

- Show Current and Proposed calories/macros with the target source and effective date.
- State that food history and prior day targets do not change.
- `Save plan` writes the profile and target in one transaction.
- Insert `profile_recalculation` or `manual`; do not mutate an existing target row.
- Supersede a pending adaptive review based on evidence before the new plan.
- Start later adaptive evidence no earlier than this effective date.

#### Units

- Offer Metric and Imperial.
- Store canonical height/weight in metric and convert only display/input.
- A unit change never inserts a target and never rewrites weight history.
- Update every weight and height surface after save, including Today, Analytics, onboarding-derived Profile rows, and weight entry.

#### AI and food sources

- Show read-only availability for Gemini estimation, USDA FoodData Central, and Open Food Facts.
- Explain that camera/gallery photos or meal descriptions go to Gemini only when the user invokes those actions.
- Explain that food queries go to enabled remote food databases.
- Never show API key fields, values, copy actions, or credential management.
- Missing developer configuration disables only the dependent source and presents a specific recovery path.

#### Data & Sync

**Create backup**

- Produce one versioned `.marco-backup` archive.
- Include `manifest.json`, a consistent SQLite database copy, and every meal photo referenced by that copy.
- Manifest fields: backup format version, app version/build, database version, creation time, file hashes, row counts, and photo count.
- Do not include API keys, logs, caches that contain secrets, or temporary files.
- Share or save through an Android system document surface.

**Restore backup**

1. Pick a `.marco-backup` file.
2. Parse and validate the manifest before touching live data.
3. Verify format/database compatibility, hashes, required files, and archive size limits.
4. Show backup date, source version, row counts, and photo count.
5. Create a safety backup of current data.
6. Restore into a staging location, run SQLite integrity and foreign-key checks, then swap it into place.
7. Roll back to current data on any failure and report that nothing changed.
8. Restart app data state and route to Today after success.

The archive implementation must handle a realistic photo library without loading the entire backup into JavaScript memory. Prove the chosen Expo-compatible archive and document-picker path before committing to a package.

**Export data**

- Export separate UTF-8 CSV files for food logs, meals/components, weight history, and target history.
- Include canonical units plus display-friendly unit columns where useful.
- Escape commas, quotes, and newlines correctly.
- Export is human-readable and is not accepted by Restore.

**Delete all data**

- Explain that profile, targets, logs, cached foods, adaptive reviews, and saved meal photos will be removed.
- Require two explicit confirmations.
- Close/checkpoint the database, delete owned files, initialize a clean current-version database, and replace navigation with onboarding.
- Do not delete external backup or CSV files.

**Cloud sync**

Cloud multi-device sync remains post-MVP. Do not render a disabled or `In development` control. When implemented, add it inside Data & Sync after identity, encryption, conflict resolution, offline queue, and recovery rules exist.

#### Help, privacy, and About

- Task-based help: Initial targets, Trend weight, Adaptive reviews, Food estimates, Editing, and Backups.
- Privacy: what stays local, what leaves the device, which provider receives it, and when.
- About: app version, build number, database version, data sources, open-source licenses, and privacy statement.

## 5. Food Data and Math

### 5.1 Scan, description, search, and manual paths

- `scanFood(imageBase64)` sends a camera/gallery image to Gemini and returns a meal name plus components.
- `describeMeal(text)` sends a natural-language meal description to Gemini.
- `clarifyMeal()` re-estimates an edited meal name and can include the original scan image while that sheet session remains active.
- Scan/description results are cached locally as normalized per-100g items.
- `searchFood(query)` combines local cache, USDA generic/branded results, and Open Food Facts results; it deduplicates/ranks usable results. Search is a working fallback, not deferred.
- Manual entries write user-entered totals directly. Per-100g fields and grams may be null.
- Gemini and USDA credentials are developer-provisioned at build time and omitted from backup/export. Users do not configure them.

All non-manual nutrition resolves to per-100g values scaled by a grams value:

```text
calories  = calories_per_100g  * grams_logged / 100
protein_g = protein_g_per_100g * grams_logged / 100
carbs_g   = carbs_g_per_100g   * grams_logged / 100
fat_g     = fat_g_per_100g     * grams_logged / 100
```

Known serving simplification: milliliters are treated as grams for portion calculation. This is an intentional personal-tracker trade-off.

### 5.1.1 Scan failure recovery: remaining MVP

Camera/gallery cancellation may return to the previous entry state. Configuration, timeout, provider, parsing, and connection failures may not.

For a failed estimate:

- Preserve the selected image and intended diary date for the active sheet session.
- Show a plain-language reason category without exposing provider payloads or credentials.
- Offer Retry as the primary action.
- Offer Search foods, Describe instead, and Enter manually as labeled fallbacks.
- Keep Android Back and discard behavior intact.
- Announce the failure and busy state to accessibility services.
- Log technical detail only in development, with request bodies, images, keys, and user descriptions redacted.

Add deterministic tests for missing build configuration, timeout, non-2xx response, invalid JSON/schema, empty components, cancellation, retry success, and fallback routing.

### 5.2 Initial target calculation: shipped

```text
BMR male   = 10*weight_kg + 6.25*height_cm - 5*age + 5
BMR female = 10*weight_kg + 6.25*height_cm - 5*age - 161

activity: sedentary 1.2, light 1.375, moderate 1.55,
          active 1.725, very_active 1.9
TDEE = BMR * activity_multiplier

weekly_adjustment = goal_rate_kg_per_week * 7700
target_calories = TDEE + weekly_adjustment / 7
```

Protein is goal-dependent: cut 2.1g/kg, maintain 1.8g/kg, bulk 1.7g/kg; preference adjusts by -0.2/0/+0.2/+0.4g/kg with a 1.2g/kg floor. Fat is 25% of target calories; carbs fill the remainder. If remaining carbs would fall below 50g, carbs clamp to 50g and calorie total is recomputed from the macro sum.

### 5.3 Trend and adaptive calculation: shipped

The implemented algorithm uses deterministic three-decimal EWMA recomputation after every same-date or backdated save:

```text
trend_weight[today] = 0.15 * scale_weight[today]
                    + 0.85 * most_recent_trend_weight

weight_change_kg = trend_weight[window_end] - trend_weight[window_start]
energy_change_kcal = weight_change_kg * 7700
avg_daily_imbalance = energy_change_kcal / elapsed_calendar_days
raw_tdee = avg_daily_intake - avg_daily_imbalance
new_tdee = 0.7 * raw_tdee + 0.3 * previous_tdee
```

Implemented guardrails:

- Inclusive 14-day window, at least ten food-logged dates, four weights, early/late endpoint coverage, and at least seven endpoint days.
- Average intake only across days with food logs; never treat missing logs as zero.
- Clamp week-over-week TDEE change to ±10%.
- Floor expenditure and targets at `1.2 * BMR` from current trend weight.
- Never silently overwrite a target. Present previous/proposed calories and macros; Accept inserts an `adaptive` target, Keep Current inserts nothing.

## 6. Design and Interaction Contract

`DESIGN.md` is the visual authority. Runtime values live in `tailwind.config.js`, `src/theme/tokens.ts`, and `src/theme/motion.ts`.

### Non-negotiable visual rules

- Material 3 dark tonal stack only: no cream/sand neutral surfaces, gradients, glass, or card shadows.
- Inter Regular/Medium/SemiBold/Bold are real bundled files; Tailwind weight classes map to those files to avoid Android faux bold.
- Radii: 12px fields, 16px diary entry cards, 24px screen cards, full pills for actions and segmented controls.
- Numeric values use tabular numerals.
- Protein is rose, carbs green, fat gold, calories blue, expenditure lavender. These are semantic roles, not decoration.
- Primary actions are white, near-black text, full pill, with restrained press feedback.
- Selected segmented state is `surface-container-highest`; the dashboard consumed/remaining toggle is the white-primary exception.
- Diary photo rails are flush to the left edge of their own clipped entry card. Do not place scan media inside a padded avatar container.
- Bottom tabs are Today, Diary, Analytics, and Profile. The center Add FAB opens entry without navigation to a fifth tab. Sync is not a top-level destination.
- Profile rows show their current value, use at least 64dp height, and open dedicated edit screens.
- Current/Proposed plan previews reuse the adaptive recommendation comparison pattern.
- Destructive data actions alone use Error Coral; backup, restore, and export remain neutral until success/failure feedback.

### Motion and Android behavior

- Use 200ms/300ms/400ms timing with the shared M3 easing vocabulary.
- Gate all timing and entering/exiting animation through reduced-motion behavior.
- Avoid key-remount reveal flicker; animate values or styles directly.
- Honor Android Back in sheets and avoid vertical-scroll capture from horizontal ruler drags.
- Minimum Android touch target is 48dp with at least 8dp separation where controls are adjacent.
- Full-screen Profile forms use native-stack Back behavior. Dialogs interrupt only for restore, reset, or another irreversible decision.
- Save, backup, restore, export, reset, and scan recovery expose busy/success/error accessibility state.

## 7. Current-State Review

### Product and UX assessment

| Heuristic | Score | Main gap |
| --- | ---: | --- |
| Visibility of status | 3/4 | Camera/gallery estimation can fail without a preserved explanation and retry state. |
| Real-world match | 3/4 | TDEE and adaptive criteria need a permanent help surface. |
| Control and freedom | 2/4 | Users cannot edit their profile/plan or manage owned data. |
| Consistency | 3/4 | Profile now completes the tab shell; its future detail routes remain to be implemented. |
| Error prevention | 2/4 | No backup, service-readiness contract, or safe plan-change preview exists. |
| Recognition | 3/4 | Profile exposes the current plan, but its detail routes remain to be implemented. |
| Efficiency | 3/4 | Entry accelerators are strong; plan and data management remain rigid. |
| Minimalist design | 3/4 | Profile avoids dead navigation, though its unavailable actions remain read-only rows. |
| Error recovery | 2/4 | Several flows recover well; scan and app-level storage failures do not. |
| Help | 1/4 | One Analytics explanation exists; calculation, data use, backup, and About do not. |
| **Total** | **25/40** | **Acceptable core; incomplete ownership and release recovery.** |

### Automated and source evidence

- `npm run typecheck`: passes on 2026-07-29.
- `npm test`: 36 tests pass across calculations, calendar behavior, weight trend/units, and adaptive recommendations.
- `npx expo export --platform android --dev`: passes with 1,768 bundled modules when Metro uses a writable temp directory.
- Coverage gap: no database migration, service, navigation, component, backup, or end-to-end tests.
- Impeccable detector: 33 documentation drift findings. Thirty-two are intentional 10px compact metadata uses and one is the Inter Medium navigation role; `DESIGN.md` now declares both.
- `src/navigation/TabNavigator.tsx` routes the fourth tab to the nested Profile stack; `AddEntry` only implements the center FAB trigger.
- `src/components/sheet-states/FoodSheetContent.tsx` can return from a failed camera/gallery estimate without a user-facing failure state.
- `app.json` disables predictive Back and requests `RECORD_AUDIO`, although the audited source has no audio feature.
- `src/config/api.ts` is ignored and contains build-time service configuration; a clean build needs a checked-in no-secret contract and release provisioning instructions.
- Runtime visual QA remains pending. Repository PNG files are historical references and contain mock icon-font output, so they cannot sign off the current React Native UI.

## 8. Remaining MVP Backlog

| ID | Priority | Feature | Depends on | Done when |
| --- | --- | --- | --- | --- |
| MVP-01 | Complete | Profile navigation and summary | Current DB reads | Sync is gone; Profile and Today avatar open a useful summary with correct current values. |
| MVP-02 | P1 | Profile and goal editing | MVP-01, DB transaction API | Users can update personal details and goal/rate through validated, prefilled screens. |
| MVP-03 | P1 | Calculated/custom target management | Schema v5, MVP-02 | Current/Proposed preview commits target history atomically and preserves prior days. |
| MVP-04 | P1 | Units preference | MVP-01 | Metric/Imperial updates all height/weight presentation without changing canonical data. |
| MVP-05 | P1 | Scan configuration and recovery | Release config contract | Missing config and provider failures keep context and offer retry/fallback actions. |
| MVP-06 | P1 | Backup and restore | Stable schema v5 | A complete archive round-trips profile, targets, logs, reviews, pins, cache, meals, and photos with rollback. |
| MVP-07 | P1 | CSV export and full reset | MVP-06 file flows | Users can export readable history and reset safely back to onboarding. |
| MVP-08 | P2 | Help, privacy, sources, About | MVP-01, release config | Users can inspect calculations, network data use, build/database version, and licenses. |
| MVP-09 | P1 | Android release hardening | MVP-01 through MVP-08 | Tests, migrations, permissions, Back, accessibility, fresh/upgrade APK, and device matrix pass. |

## 9. Delivery Plan

### Phase 1: Profile shell and navigation

**Status: Complete (2026-07-29).**

Implementation:

1. Add a Profile native stack with `ProfileHome` and typed routes for the planned child screens.
2. Replace the Sync tab name, icon, listener, and `PlaceholderScreen` render.
3. Load profile, current target, latest weight, and adaptive status through serialized reads.
4. Build the summary card and four row groups from shared tokens/components.
5. Make the Today initials avatar navigate to Profile.
6. Remove `PlaceholderScreen` if no route uses it.

Verification:

- Existing Today, Diary, and Analytics tab state remains intact; Add FAB behavior remains unchanged.
- Android Back exits child routes to Profile, then follows normal tab/app behavior.
- Empty/missing-profile and read-error states have labeled recovery.
- Profile rows use correct current values and 48dp touch targets.

### Phase 2: Plan persistence and editing

**Status: Implemented.**

Implementation:

1. Add schema migration 5 and target provenance types.
2. Add `updateProfilePresentation` and `updateProfileAndPlan` transaction operations.
3. Extract reusable profile/goal controls from onboarding only where reuse reduces duplicate behavior; do not refactor unrelated onboarding code.
4. Build Personal details, Goal and rate, Nutrition targets, and Plan preview routes.
5. Reuse current calculation utilities and Analytics Current/Proposed presentation.
6. Define one custom calorie-to-macro tolerance and enforce it in shared validation.
7. Supersede stale pending reviews and constrain later evidence to the new plan effective date.
8. Bump the shared data version after save so Today, Diary, Analytics, and Profile refresh.

Verification:

- Migration fixtures cover empty v4, populated v4, and current v5 databases.
- Transaction failure leaves both profile and target history unchanged.
- Display-name and unit-only saves insert no target.
- Formula-input, goal, and custom-target saves insert one correct target.
- Historical diary targets remain stable.
- Pending review invalidation and later eligibility boundaries pass deterministic tests.

### Phase 3: Units and service behavior

Implementation:

1. Add Metric/Imperial Profile UI using current `weight_unit` as the persisted system choice.
2. Apply presentation conversion to height and every weight surface.
3. Define a no-secret build configuration module that compiles with unavailable services.
4. Provision real keys through local/EAS release configuration, never through Profile.
5. Add read-only service availability and privacy/source copy.
6. Add camera/gallery error state and retry/fallback routing.
7. Redact sensitive provider request data from release logs.

Verification:

- Repeated unit switching produces no canonical data drift.
- Missing Gemini disables camera/describe estimation with a specific explanation; manual, recent, local cache, and available remote search still work.
- Missing USDA leaves local cache and Open Food Facts usable.
- Camera cancel differs from estimation failure.
- Timeout, provider error, bad schema, retry success, and fallback routing pass tests.

### Phase 4: Data & Sync

Implementation:

1. Prove the archive, document picker, and Android sharing approach with a database plus at least 100 representative photos.
2. Add backup manifest creation, WAL-safe database copy, photo collection, hashing, progress, and system save/share.
3. Add restore selection, manifest preview, compatibility validation, safety backup, staged integrity checks, atomic swap, rollback, and app-state restart.
4. Add RFC 4180-compatible CSV exports for food, meals/components, weights, and targets.
5. Add two-stage reset and return to onboarding.
6. Keep cloud sync absent. Reserve its future location in the route model and documentation only.

Verification:

- Empty, normal, large-photo, missing-photo, corrupt, truncated, wrong-hash, older-compatible, and newer-incompatible archives produce defined results.
- Round-trip comparison checks row counts, representative values, target IDs, review links, photo hashes, and SQLite integrity.
- Interrupted restore retains the original live data.
- CSV tests cover commas, quotes, newlines, Unicode, null fields, and large histories.
- Reset removes database-owned files and leaves external exports untouched.

### Phase 5: Help, privacy, and About

Implementation:

1. Add task-based help articles from the accepted calculation and interaction contracts.
2. Add a provider-by-provider privacy/data-use view.
3. Add app version, build, database version, licenses, and data-source details.
4. Link contextual help from Analytics, scan errors, Nutrition targets, and Data & Sync without duplicating long copy.

Verification:

- Copy matches the shipped formulas, eligibility gates, providers, and backup format.
- All routes work offline.
- Text remains usable with Android font scaling and TalkBack reading order.

### Phase 6: Release hardening

Implementation and checks:

1. Remove the unused `RECORD_AUDIO` permission.
2. Enable predictive Back only after the sheet, dialog, and nested Profile navigation matrix passes; otherwise document the exact blocker before release.
3. Review and remove unused native/runtime dependencies after import and APK checks.
4. Add database/service/integration coverage required by phases 2 through 4.
5. Run typecheck, tests, Android export, and a fresh EAS APK.
6. Install fresh and upgrade builds on physical Android hardware.
7. Capture current runtime screenshots for Today, Diary, entry/review, Analytics, Profile, plan preview, and Data & Sync.
8. Test TalkBack, font scaling, reduced motion, keyboard/IME, offline behavior, denied permissions, low storage, interrupted backup/restore, and process restart.

Release sign-off requires zero P0/P1 defects in the matrix. P2 issues need an explicit owner and post-release disposition.

## 10. Verification Commands and Device Matrix

### Automated commands

```bash
npm install
npm test
npm run typecheck
npx expo export --platform android --dev
eas build -p android
```

No lint command is configured. Add one only as a separate engineering decision; do not claim lint coverage until it exists.

### Required database cases

- Fresh current-version install.
- Upgrade from populated schema versions 1, 2, 3, and 4.
- Failed migration rollback.
- Concurrent first database access.
- Backdated weight recomputation.
- Profile recalculation, manual target, adaptive accept/keep, and pending-review supersession.
- Backup/restore and reset at current schema version.

### Required interaction cases

- Onboarding validation, calculation, save failure, and completion.
- Today loading/error/empty/populated/overflow.
- Camera, gallery, describe, search, manual, recents, pin, edit, delete/undo, grouped meal, and backdated logging.
- Camera denied, missing configuration, offline, timeout, provider failure, and retry.
- Weight insert/update/backdate, jump warning, unit conversion, date selector, keyboard, and undo.
- Analytics empty/partial/ready/stale/accept/keep and every range.
- Profile summary, each edit route, plan preview, unit switch, service disclosure, help, and About.
- Backup, restore preview, corrupt archive, rollback, export, reset, and process restart.
- System Back/predictive Back, TalkBack, 200% font scale, reduced motion, and navigation-bar insets.

## 11. Explicitly Post-MVP

- Cloud multi-device sync and conflict resolution.
- Authentication, accounts, and shared profiles.
- Barcode camera scanning.
- Health Connect and wearables.
- Push reminders or notifications.
- iOS, tablets, and expanded-width navigation.
- Social features, coach messaging, and gamification.
- Light theme, dynamic color, and localization.

Cloud sync belongs under Profile > Data & Sync when it ships. It never returns as a standalone bottom tab.
