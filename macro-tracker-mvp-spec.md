# Marco — Current MVP Specification

> **Status:** implementation-accurate as of 2026-07-28. This document separates shipped behavior from planned adaptive features. It supersedes the original greenfield MVP brief.

## 1. Product Contract

Marco is an Android-only, local-first calorie and macro tracker for a single person per install. It starts with a Mifflin-St Jeor target, then provides a premium scanner-first food log and daily diary. The intended long-term differentiator is adaptive expenditure derived from actual intake and trend weight; the adaptive recalculation/check-in loop is not implemented yet.

### User and operating model

- The app owner and a small friend group sideload an APK; there is no account, server, or social graph.
- One device stores one person's profile, target history, meals, food logs, cached foods, and scan photos.
- Daily behavior: inspect Today, log by camera/gallery/description/search/manual entry, review or edit in Diary.
- Network is required only for Gemini estimation and remote food search. The rest of the product is local.

### Product promises

1. **Scanner-first:** camera, gallery, and meal description are the leading entry routes.
2. **Local ownership:** no login or cloud dependency; scan photos stay in app-private storage.
3. **Exact enough, always editable:** rulers provide coarse adjustments while direct numeric fields provide precise values.
4. **Premium means calm:** coherent Android behavior, Material 3 surfaces, real typography, purposeful motion, no gamification noise.
5. **Honest status:** the onboarding formula is a starting estimate. Do not imply adaptive recalculation is already active.

## 2. Fixed Stack and Runtime Constraints

| Area | Current implementation |
| --- | --- |
| Framework | React Native 0.81, Expo SDK 54 managed workflow, TypeScript 5.9 |
| Target | Android APK through EAS Build; iOS is not supported |
| Navigation | React Navigation native stack plus five-item bottom tabs |
| Styling | NativeWind 4.2, `tailwind.config.js`, `src/theme/tokens.ts` |
| Motion | React Native Reanimated 4.1, with reduced-motion gates |
| Storage | `expo-sqlite` 16, on-device only |
| Sheets | `@gorhom/bottom-sheet` 5 |
| Food/AI | Gemini scan/description; local cache, USDA FoodData Central, Open Food Facts |
| Media | `expo-image-picker` capture/import; `expo-file-system` private meal-photo storage |
| Charts | `react-native-gifted-charts` trend line |
| Fonts | Bundled Inter Regular/Medium/SemiBold/Bold via `expo-font` |
| Icons | Expo MaterialIcons and MaterialCommunityIcons |

Do not add auth, backend, network state unrelated to food search/AI, iOS-specific code, or a replacement styling/navigation stack without an explicit product decision.

## 3. Persistence Model

### Important current caveat

`initDatabase()` currently drops and recreates the schema at app initialization. This is active development behavior, not a production persistence model. It resets profile, logs, targets, meals, and cached data after a cold launch. Before durable dogfooding, replace this with `CREATE TABLE IF NOT EXISTS` plus versioned migrations.

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

### Food and meal semantics

- A standalone `food_logs` row has `meal_id = NULL`.
- A scanner/description/recent-meal review writes one `meals` row and one or more linked component `food_logs` rows.
- A scan/photo is stored on the meal group, never duplicated to each component.
- Diary uses a stored thumbnail when `photo_uri` exists; otherwise `foodIcon(name)` selects a verified MaterialCommunityIcons fallback from the food name.
- Logged totals are persisted beside the per-100g nutrition snapshot, so portion editing is a local recalculation rather than a re-search.

## 4. Current User Flows

### 4.1 Onboarding — shipped

Six steps establish the initial profile:

1. Biological sex, optional display name, birth date.
2. Metric/imperial unit choice, editable height and starting weight with ruler assistance.
3. Activity level.
4. Cut, maintain, or bulk; target weight and target-rate controls for cut/bulk.
5. Protein preference.
6. A reduced-motion-aware calculation sequence saves the profile, initial weight row, and `initial_estimate` target; completion reveals calorie/macro targets and scanner-first next action.

Height, starting weight, and target weight are always directly editable. The ruler is a coarse controller only: height moves at 8px per unit; tenth-step weight values move at 20px per unit. Rulers expose Android adjustable accessibility actions.

### 4.2 Today — shipped

- Date/goal header and optional adaptive-progress chip.
- Calorie ring with a measured consumed/remaining toggle; the thumb waits for actual layout measurement before rendering.
- Protein/carbs/fat rails with named colors.
- Last logged item shortcut or scanner-first empty state.
- Weight trend surface using the most recent 30 logs. It is display-only until daily weigh-in entry is built.

### 4.3 Diary — shipped

- Month navigation plus scrollable day strip with daily calorie completion rings.
- Daily macro rail.
- Breakfast, Lunch, Snack, and Dinner headers maintain the same shape whether populated or empty. Empty headers are inert and reserve the totals slot.
- A hairline divider follows every period header.
- Every actual food and grouped meal is its own inset rounded card; names may wrap to two lines and kcal occupies a fixed right column.
- Swipe right actions: edit and delete. Delete captures the original records and offers undo.
- Grouped meals expand to reveal icon-bearing components and can be edited in the review sheet.
- Diary loading serializes SQLite reads to avoid Android `NativeStatement` bridge races.

### 4.4 Food entry sheet — shipped

`FoodSheetContent` owns the state machine:

| State | Purpose |
| --- | --- |
| `entry` | Camera, describe, gallery, search, and recent-meal routes |
| `scanning` | Camera/gallery estimation wait state |
| `permission-denied` | Camera recovery path |
| `describe` | Natural-language meal input |
| `review` | Multi-component meal/scan review, portions, macros, logging |
| `search` | Local cache + USDA + Open Food Facts search |
| `single-food-review` | Serving/grams review for one search result |
| `manual-input` | Direct totals fallback |

The Android Back button walks the sheet-state history before closing. A discard guard protects edits. Entry Bar routes that begin outside `entry` use force-close behavior so cancel returns cleanly to the app.

### 4.5 Placeholder routes — intentionally unfinished

- **Analytics:** tab exists, content is placeholder.
- **Sync:** tab exists, content is placeholder; no cloud synchronization exists.
- **Settings and weekly check-in:** no finished user route.

## 5. Food Data and Math

### 5.1 Scan, description, search, and manual paths

- `scanFood(imageBase64)` sends a camera/gallery image to Gemini and returns a meal name plus components.
- `describeMeal(text)` sends a natural-language meal description to Gemini.
- `clarifyMeal()` re-estimates an edited meal name and can include the original scan image while that sheet session remains active.
- Scan/description results are cached locally as normalized per-100g items.
- `searchFood(query)` combines local cache, USDA generic/branded results, and Open Food Facts results; it deduplicates/ranks usable results. Search is a working fallback, not deferred.
- Manual entries write user-entered totals directly. Per-100g fields and grams may be null.

All non-manual nutrition resolves to per-100g values scaled by a grams value:

```text
calories  = calories_per_100g  * grams_logged / 100
protein_g = protein_g_per_100g * grams_logged / 100
carbs_g   = carbs_g_per_100g   * grams_logged / 100
fat_g     = fat_g_per_100g     * grams_logged / 100
```

Known serving simplification: milliliters are treated as grams for portion calculation. This is an intentional personal-tracker trade-off.

### 5.2 Initial target calculation — shipped

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

### 5.3 Trend and adaptive calculation — planned, not shipped

The intended algorithm remains:

```text
trend_weight[today] = 0.15 * scale_weight[today]
                    + 0.85 * most_recent_trend_weight

weight_change_kg = trend_weight[window_end] - trend_weight[window_start]
energy_change_kcal = weight_change_kg * 7700
avg_daily_imbalance = energy_change_kcal / 14
raw_tdee = avg_daily_intake - avg_daily_imbalance
new_tdee = 0.7 * raw_tdee + 0.3 * previous_tdee
```

Required guardrails before implementation:

- 14-day window, at least four trailing-week weight logs, and at least four food-logged days.
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

### Motion and Android behavior

- Use 200ms/300ms/400ms timing with the shared M3 easing vocabulary.
- Gate all timing and entering/exiting animation through reduced-motion behavior.
- Avoid key-remount reveal flicker; animate values or styles directly.
- Honor Android Back in sheets and avoid vertical-scroll capture from horizontal ruler drags.
- Minimum touch target is 44dp; standard Android interactive controls are 48dp.

## 7. Engineering and Release Checklist

### Commands

```bash
npm install
npx tsc --noEmit
npx expo export --platform android --dev
npx expo start
eas build -p android
```

### Before durable dogfooding

1. Replace destructive database initialization with migrations.
2. Add daily weight-entry flow and EWMA write path.
3. Implement adaptive recalculation and accept/keep check-in.
4. Exercise scan, gallery, describe, search, manual, edit, delete/undo, Back, keyboard, and reduced-motion paths on physical Android hardware.
5. Build and install a fresh APK after any native dependency/config change.

### Explicitly deferred

Barcode scanning, iOS, Health Connect/wearables, authentication, backend/cloud sync, push notifications, social features, export/backup, analytics content, and settings content remain out of scope for this MVP increment.
