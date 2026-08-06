# Product

> **Phase 3 status:** Implemented (2026-07-29).

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

The app owner and a small group of friends who sideload the APK. Personal use: one phone equals one person's data. The daily job is to check calorie/macro progress, log food with the least friction possible, and eventually calibrate targets against real weight trends. There are no shared accounts, social features, or cloud identities.

## Product Purpose

Eatlog is a local-first calorie and macro tracker built around adaptive truth: targets can move from the starting calculator estimate to evidence-based weekly recommendations from logged intake and trend weight. The implemented product delivers the starting plan, scanner-first meal logging, diary review, daily weight check-ins, Analytics, and Accept/Keep adaptive reviews.

The MVP is complete when users can also maintain the plan after onboarding, recover or export owned data, understand remote service use, and finish the daily loop on a verified Android APK. Profile is the fourth tab; backup, restore, export, and future sync live under Profile > Data & Sync. The center Add control remains a FAB trigger, not a tab.

## Positioning

MacroFactor-class premium UX at sideloaded-MVP scale. The differentiator is a fast scanner-first log flow: point the camera at a meal, review the components and portion, and log it. Real scan photos in the diary make that history feel personal; deterministic food icons make every non-photo entry immediately recognizable. Premium feel comes from cohesive Android-native behavior, honest calculations, and deliberate motion, not gamification.

## Operating Context

Daily: open Today to glance at consumed versus remaining calories and macros, log food or weight from the central sheet, then review weight, energy, progress, and weekly recommendations in Analytics. Review the Diary by day, adjust portions, delete with undo, or repeat a pinned/recent food or meal.

Occasional: open Profile to change personal details, goals, targets, or units; create or restore a backup; export history; read calculation and privacy information; or reset the app. Users do not manage API credentials. The developer provisions Gemini and USDA credentials for each build.

## Current-State Assessment

| Area | State | MVP assessment |
| --- | --- | --- |
| Onboarding and initial targets | Implemented | Strong first-run flow; needs an edit path and physical-device verification. |
| Today | Implemented | Coherent daily summary with useful empty, loading, and error states. |
| Food entry | Implemented with a release gap | Multiple fast paths work in source; camera/gallery estimation can fail without a preserved error and retry state. |
| Diary | Implemented | Backdating, grouped meals, editing, delete/undo, photos, and empty states are present. |
| Weight and Analytics | Implemented | Range charting and adaptive reviews are substantial; plan-change semantics still need definition. |
| Profile and Settings | Partially implemented | Profile plan editing and versioned targets are available. Data & Sync actions and help/detail routes remain. |
| Data ownership | Missing | No backup, restore, portable export, or full reset exists. |
| Cloud sync | Not implemented | Post-MVP. Its eventual home is Profile > Data & Sync, not a top-level tab. |
| Release readiness | Partial | TypeScript and 36 pure utility tests pass. Migration, camera, backup, accessibility, Back, and APK checks still require hardware coverage. |

### Design health

The implemented core scores **25/40, Acceptable** against Nielsen's usability heuristics. The product-specific visual language and daily loop are strong. Missing Profile editing, weak scan failure recovery, no data portability, and almost no permanent help keep it below release quality.

## Capabilities and Constraints

**Working:**
- Six-step onboarding with direct editable/ruler-assisted body measurements, initial Mifflin-St Jeor BMR/TDEE calculation, calorie/macro target creation, and a reduced-motion-aware calculation/completion flow.
- Today dashboard: calorie ring, consumed/remaining toggle, macro rails with overflow, latest-food shortcut, scanner-first empty state, and calendar-accurate scale/trend/goal weight display.
- Central entry bottom sheet: camera scan, gallery scan, natural-language description, local/USDA/Open Food Facts search, manual entry, searchable pinned recents, daily/backdated weight entry, component review/edit/remove/undo, portion controls, meal assignment, and Android Back/discard behavior.
- Gemini vision/text meal estimation returning a named meal and per-100g component nutrition; clarification can re-estimate an edited scan/description.
- On-device SQLite profile, food log, meal, target, food-cache, weight-log, pin, and adaptive-review records with sequential non-destructive migrations.
- Diary: calendar strip, overflow-aware daily macro rail, consistent meal-period headers, standalone food and grouped-meal cards, real scan thumbnails, food-relevant icon fallback, expandable components, aligned edit/delete swipe actions, and undo.
- Analytics: 1M/3M/6M/1Y weight ranges, scale and EWMA trend charting, intake coverage, expenditure/target context, goal-rate progress, and persisted weekly Accept/Keep recommendations.
- Material 3 Expressive dark system in NativeWind; real bundled Onest 400/500/600/700 files; tabular figures; shared Card, PrimaryButton, segmented controls, bottom sheets, macro pills, and ruler slider.
- Purposeful Reanimated motion with reduced-motion handling; precise accessible ruler controls; Android bottom navigation with one central entry FAB.

**Automated evidence as of 2026-07-29:** `npm run typecheck` passes. `npm test` passes 36 calculation, calendar, weight, unit, and adaptive recommendation tests when the test runner can create its local IPC socket. `npx expo export --platform android --dev` completes when Metro receives a writable temp directory. No database, service, navigation, component, or end-to-end tests exist yet.

**MVP gaps:** complete backup/restore; CSV export; reset; service/privacy disclosures; calculation help; scan failure recovery; migration/integration tests; physical Android release matrix.

**Post-MVP:** cloud multi-device sync; barcode camera scanning; Health Connect/wearables; iOS; auth/accounts; notifications; social features; coach messaging; light theme; localization.

**Hard constraints:** Android-only Expo managed workflow and EAS APK distribution; local-first/no backend; canonical app data remains on-device unless the user exports a file; Onest remains bundled; scanner is the primary path; no silent system-font fallback; no per-screen visual restyling outside the shared component vocabulary. Users never enter, view, or manage API keys.

## MVP Completion Contract

The release candidate must satisfy all of these outcomes:

1. A returning user can change profile, goal, rate, target weight, units, and nutrition targets without repeating onboarding.
2. Every calculation-affecting save shows the proposed calories and macros before commit, writes profile and target history atomically, and leaves historical diary data unchanged.
3. A user can create a restorable backup, validate and restore it, export readable history, and erase all local data through guarded flows.
4. Camera/gallery scan failures explain the problem and preserve a retry, search, describe, or manual fallback.
5. Profile explains calculation, adaptive eligibility, network data use, version/build information, and data sources without exposing credentials.
6. Cloud sync does not occupy a top-level tab or appear as a dead control. Its future entry point sits inside Data & Sync.
7. A fresh install, an upgrade from database version 4, backup/restore, and the core logging matrix pass on a physical Android device and a signed APK.

## Profile and Settings Scope

Profile is an operating surface, not a list of speculative toggles. Keep each group to four rows or fewer and open dedicated edit screens for consequential changes.

### Profile summary

- Initials, display name, current goal and planned weekly rate.
- Current calories and protein/carbs/fat.
- Target source: initial estimate, profile recalculation, manual, or adaptive.
- Adaptive status or next review date.
- The avatar on Today opens Profile as a shortcut.

### Plan

- **Personal details:** display name, sex used for the formula, birth date, height, activity.
- **Goal and rate:** cut, maintain, or bulk; target weight; weekly rate.
- **Nutrition targets:** calculated or custom calories and macros, source, and effective date.
- Calculation-affecting changes open a review screen. Save updates the singleton profile and inserts a new target effective that day in one transaction.
- Unit-only changes convert presentation and preserve canonical values.
- A profile recalculation or manual target supersedes a pending review based on the old plan. New adaptive evidence cannot start before that plan change.

### Preferences

- Metric or imperial measurement display.
- Read-only AI and food-source status, network-use disclosure, and privacy copy.
- Developer-provisioned credentials stay outside the UI.
- Do not add appearance, reminder, notification, or other inert settings during MVP.

### Data & Sync

- **Create backup:** database, schema/app manifest, and referenced meal photos.
- **Restore backup:** validate compatibility, create a safety backup, restore atomically, and report the result.
- **Export data:** readable CSV history for food, weight, and targets. Export is not a restore format.
- **Delete all data:** destructive confirmation, remove database-owned photos, reset storage, and return to onboarding.
- **Cloud sync:** post-MVP. Add it to this screen only after identity, conflict, encryption, offline queue, and recovery behavior are specified.

### Help and About

- How initial targets, trend weight, and adaptive reviews work.
- Why scan results are estimates and how to edit them.
- Which data stays local and which queries/photos go to Gemini, USDA, or Open Food Facts.
- App version, build, database version, licenses, and concise privacy information.

## Target and History Rules

- Extend target provenance from `initial_estimate | adaptive` to `initial_estimate | profile_recalculation | manual | adaptive`.
- Use the latest trend weight, or latest scale weight when no trend exists, to preview a recalculated plan.
- Validate custom target values and show the energy implied by protein, fat, and carbohydrate before Save.
- Insert target history; never mutate a historical `daily_targets` row.
- Keep food logs, weight logs, and historical day targets unchanged after profile or plan edits.
- Supersede any pending adaptive review whose evidence predates a manual or profile-driven plan change.

## Brand Commitments

**Name:** Eatlog.

**Voice:** Precise, premium, confident. The product speaks like a serious training instrument, not a coach-bot. Copy is concise, direct, and transparent about estimates and adaptation.

**Visual commitment:** Material 3 Expressive dark surfaces, Onest, meaningful nutrient color, hairline outlines, tonal elevation without card shadows, `rounded-3xl` screen surfaces, `rounded-2xl` diary entry cards, and `rounded-full` actions. Real scan media is flush inside its meal card; semantic icons are the fallback. Motion is responsive and reduced-motion safe.

**Anti-references:**
- Over-decorated fitness apps with gamification noise: confetti, streaks, badges, mascots, and fake celebration.
- Generic SaaS dashboards with cream/sand backgrounds, warm-tinted neutrals, gradient text, hero metrics, or floating glass cards.
- Apps that hide complexity behind friendly mascots or casual filler.
- Barcode-camera-first trackers that make UPC capture the primary interaction.
- AI slop: generic, cheap, pasted-together UI; all motion and layout must have an interaction purpose.

## Evidence on Hand

- `macro-tracker-mvp-spec.md`: current implementation/spec contract.
- `DESIGN.md` and `.impeccable/design.json`: current visual system and machine-readable design tokens.
- `dynamic_macro_tracker_material_3_expressive_ui.html`: original Material 3 reference; source values only, not a literal current-screen contract.
- `tailwind.config.js`, `src/theme/tokens.ts`, and `src/theme/motion.ts`: normative runtime design tokens.
- `src/services/foodScan.ts` and `src/services/foodSearch.ts`: live scan, description, cache, USDA, and Open Food Facts logic.
- `src/db/database.ts`, `src/utils/calculations.ts`, `src/utils/foodIcons.ts`, and `src/utils/mealPhotos.ts`: current local persistence, target math, media, and diary semantics.
- No testimonials, customer counts, benchmarks, press, or external traction exist. Do not fabricate them.

## Product Principles

1. **Form and function together.** Every surface and transition must make logging, reviewing, or understanding data easier.
2. **Scanner-first, fallback-complete.** Camera/gallery scan and description lead; search and manual entry are credible recovery paths.
3. **Adaptive truth, explicitly controlled.** The initial formula remains useful; weekly evidence can propose new targets, but only Accept changes target history.
4. **Local ownership.** The device owns the data. No login, account, backend, or forced network dependency outside food search/AI estimation.
5. **One component vocabulary.** A selected state, card, button, numeric figure, macro color, and sheet should mean the same thing everywhere.
6. **No jank.** Animate state, never decoration; preserve scroll gestures, Android Back behavior, and reduced-motion alternatives.

## Accessibility & Inclusion

- WCAG AA-oriented contrast: high-contrast primary text and a dedicated readable placeholder color.
- Real Onest family files at readable product sizes; the semantic 11px `text-compact` role is reserved for dense chart, calendar, nutrition, and ruler metadata.
- Android touch targets are at least 48dp.
- Reduced motion is wired through animated components; it removes timing rather than hiding content.
- Ruler controls expose adjustable accessibility actions and direct editable values.
- Meal and food names wrap rather than collide with fixed tabular calorie columns.
- Profile settings use labeled rows with current values; consequential edits open full screens with clear Back, Cancel, and Save behavior.
- Backup, restore, reset, and target changes announce progress and completion to accessibility services.
