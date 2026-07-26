# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

The app owner and a small group of friends who sideload the APK. Personal use, one phone = one person's data. Context: checking daily macros, logging food via the camera, tracking weight trends. No shared accounts or social features.

## Product Purpose

A local-first, premium calorie/macro tracker that estimates a user's true daily energy expenditure (TDEE) from their own logged food intake and weight-trend data, then adjusts calorie and macro targets weekly so they stay accurate as the user's body and habits change. The primary food-entry path is AI meal scanning (camera or text description via Gemini); direct USDA/Open Food Facts search is deferred to a later build as a harder, separate task. No backend, no auth — fully on-device via SQLite.

## Positioning

MacroFactor-class premium UX at sideloaded-MVP scale. The differentiator is adaptive truth: targets derived from your own intake and weight trend, not a static formula — paired with the lowest-friction logging surface in the category (point the camera at a meal, confirm, done). Premium feel, cohesive motion, and zero AI slop distinguish it from gamified fitness apps and from generic trackers that bolt a scanner onto a search-first flow.

## Operating Context

Daily use: open the app to glance at calories/macros remaining, log a meal by scanning it (camera) or describing it (text), optionally weigh in. Weekly: a check-in surfaces when enough adaptive data exists, proposing updated targets the user accepts or keeps. All flows fully offline except the scan step itself. Phone is the only device; data lives on it and nowhere else.

## Capabilities and Constraints

**Working:** AI food scanning (Gemini vision, `scanFood`) and meal description (Gemini text, `describeMeal`) producing per-100g nutrition and component breakdown; manual food entry; on-device SQLite profile, weight logs, food logs, and daily-target history; EWMA trend-weight smoothing (alpha = 0.15); Mifflin-St Jeor initial BMR/TDEE; weekly adaptive recalculation (14-day window, smoothing, ±10% clamp, 1.2*BMR floor); weekly check-in accept/keep flow; Material 3 Expressive dark design system in NativeWind tokens; bottom-tab navigation.

**Explicitly deferred:** USDA/Open Food Facts search (`searchFood` code exists but the database path is not the primary MVP surface and is deferred as a harder separate task), barcode camera scanning, iOS build, Health Connect/wearable sync, any login/account/server, push notifications, social/sharing/favorites/recents persistence as a feature surface, cloud backup.

**Hard constraints:** Android-only via Expo managed workflow + EAS Build (sideloaded APK); USDA API key embedded client-side is acceptable at this scale; Inter 400/500/600/700 bundled via `expo-font` (no silent system fallback); Material 3 Expressive dark theme tokens lifted verbatim from the reference mockup into `tailwind.config.js`; component patterns (Card, Progress bar, Primary button, tabular-numeric figures) built once and reused across every screen — no per-screen restyling.

## Brand Commitments

**Name:** Internal codename "Marco"; no committed user-facing product name yet.
**Voice:** Precise, premium, confident — no mascots, no casual filler, no gamification badges or streaks. The product speaks like a serious training partner, not a coach-bot.
**Visual commitment:** Material 3 Expressive dark theme, Inter typography, tonal macro color system (protein/carbs/fat/expenditure), hairline-bordered surface-container cards with no drop shadows, `rounded-3xl` shapes, `rounded-full` buttons, tabular-numeric figures so digits don't jiggle. Cohesive design language and transitions everywhere — same component vocabulary on every screen.
**Anti-references:**
- Over-decorated fitness apps with gamification noise (confetti, streaks, badges everywhere)
- Generic SaaS dashboards with cream/sand backgrounds and warm-tinted neutrals
- Apps that hide complexity behind friendly mascots or casual copy
- Barcode-camera-first trackers that make UPC scanning the primary interaction
- AI slop — generic AI-generated UI that looks undifferentiated, cheap, or pasted-together; motion and layout must read as deliberately crafted, not defaulted

## Evidence on Hand

- `macro-tracker-mvp-spec.md` — authoritative product spec (algorithm, schema, screens, design tokens, build notes)
- `dynamic_macro_tracker_material_3_expressive_ui_1_.html` — visual source of truth (Material 3 Expressive dark mockup, 7 screens); outer demo chrome is presentation scaffolding, not app UI
- `tailwind.config.js` — M3 tokens lifted from the mockup, in use
- `src/services/foodScan.ts` — working Gemini-based scanner
- `src/services/foodSearch.ts` — USDA/OFF search code present (deferred surface, not primary MVP path)
- `src/db/database.ts`, `src/utils/calculations.ts` — algorithm and schema implemented per spec
- Real user: the app owner (dogfooding); a small friend group is the eventual sideload audience
- **Do not fabricate:** testimonials, customer counts, benchmarks, press, or any external traction — none exists for this sideloaded personal MVP

## Product Principles

1. **Form and function, together.** The app is a delight to use, but every motion and surface serves the function — logging food, tracking macros, tracking weight. No noise that gets in the way of the function.
2. **Premium UX, competitive with MacroFactor.** Slick animations, a unified and cohesive design language, smooth transitions, deliberate craft. No AI slop, no generic templates, no "good enough for an MVP" visual compromises.
3. **Scanner-first logging.** The camera (and text description) is the primary entry path — the lowest-friction way to log a meal. Database search is a later addition, not the center of the product.
4. **Adaptive truth from your own data.** Targets adjust weekly from your actual intake and weight trend, not a static formula. Trust through transparency: show how the calculation works, don't hide the algorithm.
5. **Consistent component vocabulary.** Same patterns reused across every screen. The system reads as one designed product, not seven separately-styled screens.

## Accessibility & Inclusion

- WCAG AA contrast ratios on all text
- Inter font at readable sizes — titles `text-xl`, inputs `text-sm` to `text-lg`, labels `text-sm`, minimum `text-[10px]` (ruler bounds only)
- Touch targets minimum 44x44px
- Reduced motion support via React Native Reanimated (planned, not yet wired)