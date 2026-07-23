# Adaptive Calorie Tracker — MVP Spec (Local-First)

## 1. What this app is

A local-first calorie/macro tracker that estimates the user's true daily
energy expenditure (TDEE) from their own logged food intake and weight-trend
data, and adjusts calorie and macro targets weekly so they stay accurate as
the user's body and habits change. First user is the app owner; a small
group of friends will sideload the same app after it works for him. Each
install is fully independent — there is no shared account or server.

**Explicitly out of scope for this build:**
- Barcode **camera** scanning (this is a UI/hardware feature — using the
  phone's camera to read a UPC. Food **search** against USDA/Open Food Facts,
  covered in section 5, is a different feature and *is* in scope. Camera
  scanning can be added later against the same data sources without any
  rework of section 5.)
- iOS build (the framework choice below keeps this open later, but do not
  build or test for iOS now)
- Health Connect / wearable sync
- Any kind of login, account, or server — see section 2
- Push notifications
- Social features, sharing, friend feeds, favorites/recents list (a natural
  future addition given the schema in section 5, but not in this build)

## 2. Tech stack (fixed — do not substitute without discussion)

- **App framework:** React Native + Expo (managed workflow), TypeScript
- **Storage:** **Local-first, on-device SQLite** via `expo-sqlite`. No
  backend, no auth, no login screen. One phone = one person's data. This
  removes an entire category of things that break in a first app (auth
  flows, network error states on every screen, permission policies) and
  matches the actual use case — there's no need for cross-device sync or a
  central view of friends' data.
  - Trade-off worth knowing: if a phone is lost or the app is uninstalled,
    that data is gone — nothing is backed up anywhere. Not solved in this
    build; a "export my data to a file" button is the cheap fix, worth
    considering for a later version.
- **Styling:** NativeWind (Tailwind syntax for React Native) — lets the
  agent port classes from the reference mockup almost directly instead of
  hand-translating everything into `StyleSheet` objects.
- **Navigation:** React Navigation (native stack)
- **Charts:** `react-native-gifted-charts` for the weight trend line
- **Fonts:** Inter (400/500/600/700), bundled via `expo-font`. Do not rely
  on the system default font — Inter is not preinstalled on Android and a
  silent fallback is a common way these builds end up looking generic.
- **Icons:** `@expo/vector-icons` (`MaterialIcons` / `MaterialCommunityIcons`
  — already bundled with Expo, zero extra setup). The mockup uses Google's
  Material Symbols Outlined font, which is not directly usable in React
  Native the way it is on web (it's a variable font relying on CSS
  `font-variation-settings`, which RN text doesn't support). Map each icon
  used in the mockup to the closest name in MaterialIcons /
  MaterialCommunityIcons — many names match exactly (`add`, `sync`, `check`,
  `info`), others need the nearest visual equivalent in the same family
  (e.g. `monitoring` → something like `show-chart` or `insights`). Visual
  closeness is the goal; exact font-axis replication is not worth chasing.
- **Food database access:** direct calls from the device to the USDA
  FoodData Central API and the Open Food Facts API (see section 5). No
  backend proxy for this MVP scale.
  - Known trade-off: the USDA API key will be embedded client-side in the
    app bundle. Fine for a sideloaded app shared with a few friends; not a
    pattern to carry into anything public-facing later.
- **Build/distribution:** Expo EAS Build → installable Android APK,
  sideloaded (no Play Store submission needed for MVP)

## 3. Data model (on-device SQLite)

No `user_id` anywhere — each install has exactly one user, so every table is
implicitly scoped to "this phone."

```sql
-- profile: singleton row, exactly one per install, created during onboarding
CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('male','female')),
  height_cm REAL NOT NULL,
  birth_date TEXT NOT NULL,               -- ISO date string
  activity_level TEXT NOT NULL CHECK (activity_level IN
    ('sedentary','light','moderate','active','very_active')),
  goal_type TEXT NOT NULL CHECK (goal_type IN ('cut','maintain','bulk')),
  goal_rate_kg_per_week REAL NOT NULL,    -- negative for cut, 0 for maintain, positive for bulk
  protein_preference TEXT NOT NULL CHECK (protein_preference IN
    ('low','moderate','high','extra_high')) DEFAULT 'moderate',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- weight_logs: at most one row per calendar day
CREATE TABLE weight_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date TEXT NOT NULL UNIQUE,          -- ISO date
  scale_weight_kg REAL NOT NULL,
  trend_weight_kg REAL NOT NULL,          -- computed via EWMA, see section 4.1
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- food_logs: many rows per day. See section 5 for how the *_per_100g
-- and grams_logged fields get populated.
CREATE TABLE food_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('usda','off','manual')),
  source_food_id TEXT,                    -- fdcId or OFF product code; null for manual
  grams_logged REAL,                      -- null for manual entries
  calories_per_100g REAL,                 -- null for manual entries
  protein_g_per_100g REAL,
  carbs_g_per_100g REAL,
  fat_g_per_100g REAL,
  calories REAL NOT NULL,                 -- always the actual logged totals
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- daily_targets: one row per recalculation, history preserved
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

## 4. The algorithm (this is the actual product — implement exactly)

### 4.1 Trend weight (EWMA smoothing)

On each new weight log:
```
if no previous trend_weight exists:
    trend_weight[today] = scale_weight[today]
else:
    alpha = 0.15
    trend_weight[today] = alpha * scale_weight[today] + (1 - alpha) * trend_weight[most_recent_prior_day]
```
If a day is missed, trend_weight simply carries forward unchanged until the
next weigh-in — do not update it on days with no scale reading.

### 4.2 Initial target (Day 1, before enough adaptive data exists)

Mifflin-St Jeor for starting BMR:
```
if sex == male:   BMR = 10*weight_kg + 6.25*height_cm - 5*age + 5
if sex == female: BMR = 10*weight_kg + 6.25*height_cm - 5*age - 161
```
Activity multipliers: sedentary=1.2, light=1.375, moderate=1.55, active=1.725, very_active=1.9
```
TDEE_initial = BMR * activity_multiplier
target_calories_initial = TDEE_initial + goal_adjustment   (goal_adjustment: section 4.4)
```
Store this as a `daily_targets` row with `calculation_method = 'initial_estimate'`
immediately after onboarding.

### 4.3 Adaptive recalculation (weekly, rolling)

**Minimum data required before switching to adaptive mode:**
- At least 14 days since the first log, **and**
- At least 4 weight logs in the trailing 7-day window, **and**
- At least 4 days with food logged in the trailing 7-day window

If unmet, keep the current target and show how many more days/logs are needed.

**Calculation** (trailing 14-day window):
```
weight_change_kg = trend_weight[window_end] - trend_weight[window_start]
energy_change_kcal = weight_change_kg * 7700
avg_daily_imbalance = energy_change_kcal / 14

avg_daily_intake = sum(calories logged in window) / (days with at least one food log in window)
// average only over days that actually have logs, never treat an unlogged day as zero

raw_tdee_estimate = avg_daily_intake - avg_daily_imbalance
```
**Smooth the estimate:**
```
new_tdee = 0.7 * raw_tdee_estimate + 0.3 * previous_tdee
```
**Clamp weekly change** to at most ±10% of the previous TDEE. **Safety
floor:** `new_tdee` and the resulting `target_calories` must never drop
below `1.2 * BMR` (recomputed from current trend weight).

### 4.4 Targets: calories, protein, fat, carbs

```
weekly_kcal_adjustment = goal_rate_kg_per_week * 7700
goal_adjustment = weekly_kcal_adjustment / 7
target_calories = tdee_estimate + goal_adjustment
```
Protein (goal-dependent, per kg of trend weight, adjusted by preference):
```
base_g_per_kg:  cut: 2.1      maintain: 1.8      bulk: 1.7
preference_offset:  low: -0.2   moderate: 0   high: +0.2   extra_high: +0.4
adjusted_g_per_kg = max(base_g_per_kg + preference_offset, 1.2)
target_protein_g = trend_weight_kg * adjusted_g_per_kg
```
Fat, then carbs fill the remainder (the same convention MacroFactor and
most serious trackers use):
```
target_fat_g = (target_calories * 0.25) / 9        // 25% of calories, 9 kcal/g
remaining_kcal = target_calories - (target_protein_g * 4) - (target_fat_g * 9)
target_carbs_g = remaining_kcal / 4                 // 4 kcal/g
```
**Edge case to handle explicitly:** if `remaining_kcal` comes out negative
(possible at low calorie targets with high protein needs), clamp
`target_carbs_g` to a floor of 50g and let `target_calories` be recomputed
as the actual sum of protein+fat+carbs kcal, rather than forcing the
original number and producing negative carbs.

### 4.5 The weekly check-in flow

Never silently overwrite the target. When a new calculation is ready
(section 4.3 conditions newly met, >= 7 days since the last `daily_targets`
row):
1. Compute the new values as above.
2. Show previous -> proposed for calories and each macro.
3. "Accept" -> insert a new `daily_targets` row (`calculation_method = 'adaptive'`).
4. "Keep Current" -> insert nothing; re-offer with fresh numbers next week.

## 5. Food database & serving sizes

### 5.1 Core principle: normalize everything to per-100g

Both USDA and Open Food Facts report nutrition per 100g natively. If the
app's internal math *only ever* works in "per-100g scaled by grams eaten,"
every unit — grams, servings, cups, pieces — becomes just a different way
of arriving at a gram number before one single calculation runs. This is
the decision that keeps the feature from turning into a pile of
unit-specific special cases.

### 5.2 Two sources, not merged

On search, query both APIs in parallel and show two labeled result
sections: **"Whole & Generic Foods (USDA)"** and **"Packaged Products (Open
Food Facts)."** Do not attempt to cross-match or dedupe between them — that
kind of matching is genuinely hard to get right and not worth the fragility
here. Let the user pick the better match when both return something.

- **USDA FoodData Central** — best for whole/generic ingredients (raw
  chicken, rice, fruit). Free, requires a free `api.data.gov` API key
  (one-time signup, no payment), 1,000 requests/hour. Nutrition lives in a
  `foodNutrients` array keyed by nutrient ID: `1008`=energy(kcal),
  `1003`=protein, `1005`=carbs, `1004`=fat — all per 100g.
- **Open Food Facts** — best for local/packaged/branded products. Free, no
  API key required at all. Nutrition lives in a `nutriments` object with
  self-explanatory per-100g keys: `energy-kcal_100g`, `proteins_100g`,
  `carbohydrates_100g`, `fat_100g`.
  - **Known gotcha:** a barcode/search miss still returns HTTP 200 with
    `status: 0` in the body, not a 404 — the check must be on that field,
    not the HTTP status code.

**Defensive rule (non-negotiable):** if any of the four required fields
(calories, protein, carbs, fat) is missing from a result, treat that item
as unusable — hide or grey it out. Never default a missing value to 0;
that silently corrupts every calculation downstream of it.

### 5.3 Resolving any unit down to grams

Every logged item resolves to exactly one number, `grams_logged`, via one
of two paths:

1. **Direct grams entry** — always available as a fallback/override,
   regardless of source.
2. **A discrete serving with a known gram weight** — if the source
   provides one:
   - USDA Branded Foods: `servingSize` + `servingSizeUnit` directly.
   - USDA Foundation/SR Legacy foods: a `foodPortions` array of household
     measures (e.g. "1 medium" -> `gramWeight: 118`) — use the first entry
     present as the quick-select option.
   - Open Food Facts: `serving_quantity`, a pre-parsed numeric gram value,
     *when OFF successfully parsed one*. Do not attempt to parse the
     free-text `serving_size` string yourself (e.g. `"1 bar (40 g)"`) —
     fragile, unnecessary work. If `serving_quantity` is absent, the item
     is grams-only; skip the serving quick-select for it.
   - `grams_logged = default_serving_grams x quantity`, where quantity is
     a simple stepper (x1, x2, x3...) next to the serving chip.

**Volume units (ml, cups, tbsp):** use the standard simplification every
mainstream tracker uses — 1ml ~= 1g. It's imprecise for things like oil or
honey, but avoids needing a density table per ingredient, and is accurate
enough for a personal tracker.

This covers grams, servings, and volume/count units uniformly — there is no
separate code path needed per unit type, only per how the source expressed
its serving (if at all).

### 5.4 Final computation and storage

```
calories  = calories_per_100g  * (grams_logged / 100)
protein_g = protein_g_per_100g * (grams_logged / 100)
carbs_g   = carbs_g_per_100g   * (grams_logged / 100)
fat_g     = fat_g_per_100g     * (grams_logged / 100)
```
Store **both** the per-100g snapshot and the computed totals in
`food_logs` (section 3). This small redundancy buys two things: the
dashboard just sums the totals columns directly (fast, no re-derivation),
and editing a logged amount later ("actually 150g not 100g") is a local
recalculation with no re-search or network call needed.

For manual entries (`source = 'manual'`): the per-100g fields and
`grams_logged` stay null; the user's typed totals go straight into the
totals columns.

## 6. Design system — match the reference mockup exactly

The attached file `dynamic_macro_tracker_material_3_expressive_ui_1_.html`
is the **visual source of truth**. Treat it as the spec for colors,
spacing, shapes, and component patterns — not a paragraph description of
it. Any prose summary of a design is a lossy translation of a file that
already has the literal values in it.

**Important — ignore the mockup's outer demo chrome.** The HTML file is a
*showcase* of 7 screens side by side in a browser: it includes a top header
with a mode switcher ("Canvas / Interactive Simulator"), a screen jump-to
dropdown, and a fake phone status bar (time, wifi, battery icons) drawn
inside each `phone-frame` div. **None of that is real app UI** — it's
presentation scaffolding for viewing the mockup on a desktop screen. Only
the actual content *inside* each phone frame (the cards, tiles, and
components) should be built. The real app runs full-screen on an actual
phone, which already has its own status bar.

**Design tokens — lift this into `tailwind.config.js` for NativeWind
verbatim:**
```js
theme: {
  extend: {
    fontFamily: { sans: ['Inter', 'sans-serif'] },
    colors: {
      m3: {
        surface: '#111318',
        'surface-container-lowest': '#0c0e13',
        'surface-container-low': '#191c20',
        'surface-container': '#1d2024',
        'surface-container-high': '#282a2f',
        'surface-container-highest': '#33353a',
        'on-surface': '#e2e2e9',
        'on-surface-variant': '#c4c6d0',
        outline: '#44474f',
        'outline-variant': '#2b2d35',
        primary: '#ffffff',
        'on-primary': '#0f1117',
        'primary-container': '#282a31',
        'on-primary-container': '#ffffff',
        secondary: '#bfc6dc',
        'on-secondary': '#293042',
        'secondary-container': '#3f4759',
        'on-secondary-container': '#dbe2f9',
        tertiary: '#debcdf',
        'on-tertiary': '#402843',
        'tertiary-container': '#573e5c',
        'on-tertiary-container': '#fbd7fc',
        error: '#ffb4ab',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',
        protein: '#f2b7c6',
        'protein-container': '#4f2532',
        carbs: '#a0cafd',
        'carbs-container': '#1d3550',
        fat: '#e5c36c',
        'fat-container': '#453812',
        expenditure: '#d0bcff'
      }
    }
  }
}
```

**Recurring component patterns to build once and reuse everywhere** (never
restyle a card per-screen — this consistency is what makes the mockup read
as one system rather than seven separately-designed screens):
- **Card**: `bg-m3-surface-container`, `rounded-3xl`, hairline
  `border border-m3-outline-variant/30`, no drop shadows.
- **Progress bar** (energy budget, macro bars): `bg-m3-surface-container-highest`
  track, filled with the relevant tonal color, fully `rounded-full`.
- **Primary button**: white fill, black text, `rounded-full`, `active:scale-95`
  press feedback.
- **Numeric figures** (calories, macros, weight): tabular/monospaced number
  styling so digits don't jiggle the layout as they change — this is the
  `num-tabular` class in the mockup.

**Build order and review checkpoint:** build the Today/Dashboard screen
first — it contains the widest variety of components in one place (cards,
tonal macro tiles, progress bars, bottom nav). Compare it against the
mockup's Screen 01 before building anything else, then instruct explicitly:
every other screen reuses these exact components, no new patterns invented
per-screen. Catching drift here costs one screen's worth of rework instead
of seven.

## 7. Screens (MVP — seven screens, no login)

1. **Onboarding** (first run only) — sex, height, birth date, starting
   weight, activity level, goal type, target weekly rate, protein
   preference. On submit: creates the `profile` row, first `weight_logs`
   row, and initial `daily_targets` row (section 4.2).
2. **Today / Dashboard** — target vs. consumed calories, remaining,
   protein/carbs/fat progress tiles, trend weight card, "Log Weight" and
   "Add Food" buttons, banner when a weekly check-in is ready.
3. **Add Food** — search bar querying USDA + OFF in parallel (section 5),
   two labeled result sections, tap a result -> serving/grams picker ->
   confirm -> saved to `food_logs`. Manual-entry fallback for anything not
   found.
4. **Food Diary** — list of a given day's `food_logs`, editable date
   picker, edit/delete per entry, running totals at top.
5. **Log Weight & Trend** — numeric scale-weight input (triggers EWMA,
   section 4.1), line chart of scale weight (dots) vs. trend weight
   (smooth line) over the last 30 days.
6. **Weekly Check-In** — appears only when eligible (section 4.5): previous
   -> proposed calories/macros, Accept / Keep Current.
7. **Settings** — edit goal type, weekly rate, activity level.

(Screens 6 and 7 can be combined with adjacent screens if simpler to
build — not a hard requirement to keep them fully separate.)

## 8. Build notes for the coding agent

- Target Android only, via Expo's managed workflow (`eas build -p android`
  -> installable APK, no native toolchain setup required).
- No backend, no `.env` secrets beyond the USDA API key (see section 2's
  trade-off note on embedding it client-side for this sideloaded-app scale).
- No offline support needed for the food-search step specifically (it needs
  connectivity); everything else (dashboard, diary, weight log, targets) is
  fully local and works offline by nature of SQLite.
- Recommended build order: Onboarding -> Dashboard (with design-system
  checkpoint, section 6) -> Add Food + Diary -> Weight & Trend -> Weekly
  Check-In -> Settings.
