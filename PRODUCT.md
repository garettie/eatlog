# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

The app owner and a small group of friends who sideload the APK. Personal use: one phone equals one person's data. The daily job is to check calorie/macro progress, log food with the least friction possible, and eventually calibrate targets against real weight trends. There are no shared accounts, social features, or cloud identities.

## Product Purpose

Marco is a local-first calorie and macro tracker built around adaptive truth: targets can move from the starting calculator estimate to explicit, evidence-based weekly recommendations from logged intake and trend weight. The current product delivers the starting plan, scanner-first meal logging, diary review, daily weight check-ins, Analytics, and Accept/Keep adaptive reviews.

## Positioning

MacroFactor-class premium UX at sideloaded-MVP scale. The differentiator is a fast scanner-first log flow: point the camera at a meal, review the components and portion, and log it. Real scan photos in the diary make that history feel personal; deterministic food icons make every non-photo entry immediately recognizable. Premium feel comes from cohesive Android-native behavior, honest calculations, and deliberate motion, not gamification.

## Operating Context

Daily: open Today to glance at consumed versus remaining calories and macros, log food or weight from the central sheet, then review weight, energy, progress, and weekly recommendations in Analytics. Review the Diary by day, adjust portions, delete with undo, or repeat a pinned/recent food or meal.

## Capabilities and Constraints

**Working:**
- Six-step onboarding with direct editable/ruler-assisted body measurements, initial Mifflin-St Jeor BMR/TDEE calculation, calorie/macro target creation, and a reduced-motion-aware calculation/completion flow.
- Today dashboard: calorie ring, consumed/remaining toggle, macro rails with overflow, latest-food shortcut, scanner-first empty state, and calendar-accurate scale/trend/goal weight display.
- Central entry bottom sheet: camera scan, gallery scan, natural-language description, local/USDA/Open Food Facts search, manual entry, searchable pinned recents, daily/backdated weight entry, component review/edit/remove/undo, portion controls, meal assignment, and Android Back/discard behavior.
- Gemini vision/text meal estimation returning a named meal and per-100g component nutrition; clarification can re-estimate an edited scan/description.
- On-device SQLite profile, food log, meal, target, food-cache, weight-log, pin, and adaptive-review records with sequential non-destructive migrations.
- Diary: calendar strip, overflow-aware daily macro rail, consistent meal-period headers, standalone food and grouped-meal cards, real scan thumbnails, food-relevant icon fallback, expandable components, aligned edit/delete swipe actions, and undo.
- Analytics: 4W/3M/6M weight ranges, scale and EWMA trend charting, intake coverage, expenditure/target context, goal-rate progress, and persisted weekly Accept/Keep recommendations.
- Material 3 Expressive dark system in NativeWind; real bundled Inter 400/500/600/700 files; tabular figures; shared Card, PrimaryButton, segmented controls, bottom sheets, macro pills, and ruler slider.
- Purposeful Reanimated motion with reduced-motion handling; precise accessible ruler controls; Android bottom navigation with one central entry FAB.

**Verification caveat:** automated pure tests, TypeScript, Expo config, and Android export cover the implementation; migration and interaction flows still require the physical-device matrix before release sign-off.

**Not implemented yet:** settings; Sync tab content; cloud/export backup; barcode camera scanning; Health Connect/wearable integration; iOS build; auth/accounts; notifications; social features.

**Hard constraints:** Android-only Expo managed workflow and EAS APK distribution; local-first/no backend; all app data remains on-device; Inter must remain bundled; scanner is the primary path; no silent system-font fallback; no per-screen visual restyling outside the shared component vocabulary.

## Brand Commitments

**Name:** Internal codename "Marco"; no committed user-facing product name.

**Voice:** Precise, premium, confident. The product speaks like a serious training instrument, not a coach-bot. Copy is concise, direct, and transparent about estimates and adaptation.

**Visual commitment:** Material 3 Expressive dark surfaces, Inter, meaningful nutrient color, hairline outlines, tonal elevation without card shadows, `rounded-3xl` screen surfaces, `rounded-2xl` diary entry cards, and `rounded-full` actions. Real scan media is flush inside its meal card; semantic icons are the fallback. Motion is responsive and reduced-motion safe.

**Anti-references:**
- Over-decorated fitness apps with gamification noise: confetti, streaks, badges, mascots, and fake celebration.
- Generic SaaS dashboards with cream/sand backgrounds, warm-tinted neutrals, gradient text, hero metrics, or floating glass cards.
- Apps that hide complexity behind friendly mascots or casual filler.
- Barcode-camera-first trackers that make UPC capture the primary interaction.
- AI slop: generic, cheap, pasted-together UI; all motion and layout must have an interaction purpose.

## Evidence on Hand

- `macro-tracker-mvp-spec.md` — current implementation/spec contract.
- `DESIGN.md` and `.impeccable/design.json` — current visual system and machine-readable design tokens.
- `dynamic_macro_tracker_material_3_expressive_ui_1_.html` — original Material 3 reference; source values only, not a literal current-screen contract.
- `tailwind.config.js`, `src/theme/tokens.ts`, and `src/theme/motion.ts` — normative runtime design tokens.
- `src/services/foodScan.ts` and `src/services/foodSearch.ts` — live scan, description, cache, USDA, and Open Food Facts logic.
- `src/db/database.ts`, `src/utils/calculations.ts`, `src/utils/foodIcons.ts`, and `src/utils/mealPhotos.ts` — current local persistence, target math, media, and diary semantics.
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
- Real Inter family files at readable product sizes; `text-[10px]` is reserved for compact nutrition/ruler metadata.
- Touch targets are at least 44dp, generally 48dp for Android controls.
- Reduced motion is wired through animated components; it removes timing rather than hiding content.
- Ruler controls expose adjustable accessibility actions and direct editable values.
- Meal and food names wrap rather than collide with fixed tabular calorie columns.
