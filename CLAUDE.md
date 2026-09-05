---
ijfw_version: 1.3.2
ijfw_schema: 1
type: software
primary_type: software
secondary_types: []
confidence: 0.943
detected_at: 2026-08-01T06:44:21.319Z
signals:
  - kind: agents_md_frontmatter
    weight: 0.9
    value: software
  - kind: manifest
    weight: 0.9
    manifests: [package.json]
  - kind: dir_design
    weight: 0.4
    name: assets
  - kind: file_extension_ratio
    weight: 0.7
    domain: software
    ratio: 1
    count: 87
---
# AGENTS.md

Drop-in operating instructions for coding agents. Read this file before every task.

**Working code only. Finish the job. Plausibility is not correctness.**

This file follows the [AGENTS.md](https://agents.md) open standard (Linux Foundation / Agentic AI Foundation). Claude Code, Codex, Cursor, Windsurf, Copilot, Aider, Devin, Amp read it natively. For tools that look elsewhere, symlink:

```bash
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md GEMINI.md
```

---

## Agent skills

### Issue tracker

Issues are tracked in the `garettie/eatlog` GitHub repository. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Eatlog uses a single-context domain-doc layout. See `docs/agents/domain.md`.

---

## 0. Non-negotiables

These rules override everything else in this file when in conflict:

1. **No flattery, no filler.** Skip openers like "Great question", "You're absolutely right", "Excellent idea", "I'd be happy to". Start with the answer or the action.
2. **Disagree when you disagree.** If the user's premise is wrong, say so before doing the work. Agreeing with false premises to be polite is the single worst failure mode in coding agents.
3. **Never fabricate.** Not file paths, not commit hashes, not API names, not test results, not library functions. If you don't know, read the file, run the command, or say "I don't know, let me check."
4. **Stop when confused.** If the task has two plausible interpretations, ask. Do not pick silently and proceed.
5. **Touch only what you must.** Every changed line must trace directly to the user's request. No drive-by refactors, reformatting, or "while I was in there" cleanups.

---

## 1. Before writing code

**Goal: understand the problem and the codebase before producing a diff.**

- State your plan in one or two sentences before editing. For anything non-trivial, produce a numbered list of steps with a verification check for each.
- Read the files you will touch. Read the files that call the files you will touch. Claude Code: use subagents for exploration so the main context stays clean.
- Match existing patterns in the codebase. If the project uses pattern X, use pattern X, even if you'd do it differently in a greenfield repo.
- Surface assumptions out loud: "I'm assuming you want X, Y, Z. If that's wrong, say so." Do not bury assumptions inside the implementation.
- If two approaches exist, present both with tradeoffs. Do not pick one silently. Exception: trivial tasks (typo, rename, log line) where the diff fits in one sentence.

---

## 2. Writing code: simplicity first

**Goal: the minimum code that solves the stated problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code. No configurability, flexibility, or hooks that were not requested.
- No error handling for impossible scenarios. Handle the failures that can actually happen.
- If the solution runs 200 lines and could be 50, rewrite it before showing it.
- If you find yourself adding "for future extensibility", stop. Future extensibility is a future decision.
- Bias toward deleting code over adding code. Shipping less is almost always better.

The test: would a senior engineer reading the diff call this overcomplicated? If yes, simplify.

---

## 3. Surgical changes

**Goal: clean, reviewable diffs. Change only what the request requires.**

- Do not "improve" adjacent code, comments, formatting, or imports that are not part of the task.
- Do not refactor code that works just because you are in the file.
- Do not delete pre-existing dead code unless asked. If you notice it, mention it in the summary.
- Do clean up orphans created by your own changes (unused imports, variables, functions your edit made obsolete).
- Match the project's existing style exactly: indentation, quotes, naming, file layout.

The test: every changed line traces directly to the user's request. If a line fails that test, revert it.

---

## 4. Goal-driven execution

**Goal: define success as something you can verify, then loop until verified.**

Rewrite vague asks into verifiable goals before starting:

- "Add validation" becomes "Write tests for invalid inputs (empty, malformed, oversized), then make them pass."
- "Fix the bug" becomes "Write a failing test that reproduces the reported symptom, then make it pass."
- "Refactor X" becomes "Ensure the existing test suite passes before and after, and no public API changes."
- "Make it faster" becomes "Benchmark the current hot path, identify the bottleneck with profiling, change it, show the benchmark is faster."

For every task:

1. State the success criteria before writing code.
2. Write the verification (test, script, benchmark, screenshot diff) where practical.
3. Run the verification. Read the output. Do not claim success without checking.
4. If the verification fails, fix the cause, not the test.

---

## 5. Tool use and verification

- Prefer running the code to guessing about the code. If a test suite exists, run it. If a linter exists, run it. If a type checker exists, run it.
- Never report "done" based on a plausible-looking diff alone. Plausibility is not correctness.
- When debugging, address root causes, not symptoms. Suppressing the error is not fixing the error.
- For UI changes, verify visually: screenshot before, screenshot after, describe the diff.
- Use CLI tools (gh, aws, gcloud, kubectl) when they exist. They are more context-efficient than reading docs or hitting APIs unauthenticated.
- When reading logs, errors, or stack traces, read the whole thing. Half-read traces produce wrong fixes.

---

## 6. Session hygiene

- Context is the constraint. Long sessions with accumulated failed attempts perform worse than fresh sessions with a better prompt.
- After two failed corrections on the same issue, stop. Summarize what you learned and ask the user to reset the session with a sharper prompt.
- Use subagents (Claude Code: "use subagents to investigate X") for exploration tasks that would otherwise pollute the main context with dozens of file reads.
- When committing, write descriptive commit messages (subject under 72 chars, body explains the why). No "update file" or "fix bug" commits. No "Co-Authored-By: Claude" attribution unless the project explicitly wants it.

---

## 7. Communication style

- Direct, not diplomatic. "This won't scale because X" beats "That's an interesting approach, but have you considered...".
- Concise by default. Two or three short paragraphs unless the user asks for depth. No padding, no restating the question, no ceremonial closings.
- When a question has a clear answer, give it. When it does not, say so and give your best read on the tradeoffs.
- Celebrate only what matters: shipping, solving genuinely hard problems, metrics that moved. Not feature ideas, not scope creep, not "wouldn't it be cool if".
- No excessive bullet points, no unprompted headers, no emoji. Prose is usually clearer than structure for short answers.

---

## 8. When to ask, when to proceed

**Ask before proceeding when:**
- The request has two plausible interpretations and the choice materially affects the output.
- The change touches something you've been told is load-bearing, versioned, or has a migration path.
- You need a credential, a secret, or a production resource you don't have access to.
- The user's stated goal and the literal request appear to conflict.

**Proceed without asking when:**
- The task is trivial and reversible (typo, rename a local variable, add a log line).
- The ambiguity can be resolved by reading the code or running a command.
- The user has already answered the question once in this session.

---

## 9. Self-improvement loop

**This file is living. Keep it short by keeping it honest.**

After every session where the agent did something wrong:

1. Ask: was the mistake because this file lacks a rule, or because the agent ignored a rule?
2. If lacking: add the rule under "Project Learnings" below, written as concretely as possible ("Always use X for Y" not "be careful with Y").
3. If ignored: the rule may be too long, too vague, or buried. Tighten it or move it up.
4. Every few weeks, prune. For each line, ask: "Would removing this cause the agent to make a mistake?" If no, delete. Bloated AGENTS.md files get ignored wholesale.

Boris Cherny (creator of Claude Code) keeps his team's file around 100 lines. Under 300 is a good ceiling. Over 500 and you are fighting your own config.

---

## 10. Project context

**Fill this in per project. Keep it specific. Delete sections that don't apply.**

### Stack
- Language and version: TypeScript 5.9, React 19.1
- Framework(s): React Native 0.81 + Expo SDK 54 (managed workflow)
- Package manager: npm
- Runtime / deployment target: Android-first public release via Google Play, followed by iOS via the App Store
- Styling: NativeWind 4.2 (Tailwind CSS for React Native)
- Navigation: React Navigation 7 (native stack)
- Storage: expo-sqlite (local-first, on-device SQLite, no backend)
- Fonts: Onest (400/500/600/700) bundled via @expo-google-fonts/onest and expo-font
- Icons: @expo/vector-icons (MaterialIcons, MaterialCommunityIcons)

### Commands
- Install: `npm install`
- Build: `npx expo export --platform android --dev`
- Test (all): `env TMPDIR=/tmp npm test`
- Test (single file): `env TMPDIR=/tmp npx tsx --test path/to/file.test.ts`
- Lint: `TODO` (no linter configured)
- Dead-code check: `npm run fallow:dead-code` (known baseline may fail)
- Typecheck: `npx tsc --noEmit`
- Run locally: `npx expo start`

### Layout
- Source lives in: `src/` (screens, components, db, utils, navigation)
- Screens: `src/screens/` (OnboardingScreen, SetupCompleteScreen)
- Components: `src/components/` (Card, PrimaryButton, RulerSlider, TappableRow)
- Database: `src/db/database.ts` (expo-sqlite schema + queries)
- Utils: `src/utils/calculations.ts` (BMR, TDEE, macro targets)
- Navigation: `src/navigation/RootNavigator.tsx`
- Entry: `App.tsx`, `index.ts`
- Do not modify: `node_modules/`, `dist/`, `.expo/`

### Conventions specific to this repo
- Styling: NativeWind className strings (Tailwind syntax), M3 Expressive dark theme tokens in tailwind.config.js
- Component pattern: functional components, TypeScript interfaces for props
- State: React useState/useRef, no Redux/Zustand
- Navigation: typed routes via RootStackParamList
- Database: singleton profile row, auto-increment IDs, ISO date strings
- Naming: PascalCase components, camelCase functions/variables, kebab-case for M3 token suffixes

### Forbidden
- Do not use `StyleSheet.create` — use NativeWind classes exclusively
- Do not add backend/auth/network dependencies — this is local-first by design
- Do not substitute the tech stack (e.g., swap NativeWind for styled-components) without discussion
- iOS v1 source and release configuration are allowed; keep Health Connect Android-only and keep HealthKit/Apple Health outside v1

---

## 11. Project Learnings

**Accumulated corrections. This section is for the agent to maintain, not just the human.**

When the user corrects your approach, append a one-line rule here before ending the session. Write it concretely ("Always use X for Y"), never abstractly ("be careful with Y"). If an existing line already covers the correction, tighten it instead of adding a new one. Remove lines when the underlying issue goes away (model upgrades, refactors, process changes).

- Remote Gemini consent uses the shared full-screen onboarding/on-demand flow; persisted Okay consent must never reprompt unless the user withdraws it, decline keeps local Eatlog features usable, and the food-estimate service must fail closed before installation-token loading or `fetch`.

- NativeWind `space-y-*` bug out inside ScrollViews — use flex `gap-*` on wrapper `<View>` instead
- `react-native-date-picker` requires dev build, won't work with Expo Go — always confirm env constraints before installing native deps
- RulerSlider: decouple visual tick step from value step when small increments flood the UI — `TICK_STEP=1` for rendering, `step=0.1` for snapping
- PanResponder created in `useRef` avoids stale closures only if all props are read from refs, not captured at creation time
- `react-native-reanimated` is installed (planned for animations) but causes strict mode warnings when unused — `react-native-worklets` was removed as unneeded
- Expo config plugins in `app.json` must match installed packages — removing a package without removing its plugin crashes `expo export`
- Sheet openers that bypass the `entry` state (EntryBar buttons) must set `fromBar: true` in the sheet state — `forceClose` and every cancel gate in FoodSheetContent read it; the FAB's `openEntry` intentionally omits it (entry IS its start state)
- Undo for destructive deletes: capture the row(s) before `deleteFoodLog`/`deleteMeal`, then re-insert via `insertFoodLog`/`insertMeal` in the toast undo closure (no soft-delete needed; IDs may change, that's fine)
- Smooth transitions on toggles/rings/progress bars: use reanimated `useSharedValue` + `withTiming` on the UI thread (SVG ring via `Animated.createAnimatedComponent(Circle)` + `useAnimatedProps` on `strokeDashoffset`; bars via `useAnimatedStyle` width measured with `onLayout`; toggle pill slides via `translateX` = `val * (halfWidth - padding)`). NEVER use `key`-based remounts to trigger `FadeIn` re-entry — they flicker. Gate all `withTiming` with `reduced ? 0 : 250` (call `useReducedMotion()` in each animated component). `getDb()` must be promise-guarded (`_dbPromise`) to avoid the "Integer/NativeDatabase released" SQLite crash on concurrent first calls.
- Weight tracking is not shipped, but its phased plan is already defined: preferred-unit persistence, weight upsert and trend recomputation, FAB entry, dashboard states, Analytics, then persisted weekly adaptive recommendations.
- Android date selection uses imperative `DateTimePickerAndroid.open` with explicit actions: unbounded meal dates use the spinner, while bounded birthday and weight dates use the default native dialog because OEM spinners flicker at hard limits. Never combine `maximumDate` with spinner display. Keep native actions compact (`Today`, `Cancel`, `Set date`) for narrow OEM dialogs; show the weekday in the selected-date label. Diary allows future navigation, and JavaScript `ScrollView` wheels must not return.
- Weight-chart range switches must morph the existing SVG coordinate domain and geometry in place; never fade, slide, or remount the chart container.
- Diary day/month navigation must avoid artificial `requestAnimationFrame` delays: update selection/month and start cached or SQLite work in the same handler, reuse positional calendar/journal slots, synchronously reset reused Swipeables, and do not animate day/month transitions.
- API credentials are developer-provisioned at build time; never ask users to enter, view, or manage API keys in the app.
- The app has four tabs (Today, Diary, Analytics, Profile); the center Add control is a FAB trigger, not a fifth tab.
- The FAB entry sheet uses a hybrid hierarchy: primary Scan pill, paired flat Photo/Describe actions, grouped flat Quick log rows, and a separate flat Weight row; use tonal icon circles rather than rounded card containers for secondary actions, keep labels at `text-base` (16/22), and never flatten the layout into one vertical list.
- Treat source changes attributed to another active agent as out of scope for documentation-only audits; do not review, modify, or cite them.
- When Settings must match onboarding, reuse the same interactive controls and bounds/default behavior; do not substitute plain fields that only preload the same values.
- Bottom-sheet state changes use a 200ms shell, 90ms exit, and 150ms entrance; keep wrapper identity and sizing mode stable, extend the background beneath Gorhom's clipped container, retain the last measured compact detent while new content is unmeasured, defer imperative snapping until changed detents reach Gorhom's UI-thread state, and never size an async sheet from its loading skeleton.
- Logging consistency charts must use MacroFactor's rolling 30-day 10-column by 3-row block and fill the available chart width; never weekday-align, pad, or artificially width-cap them. Their visible summary is `n/7 this week`, never `n/30` or a percentage.
- The Today Analytics card shows only logging consistency; weight trend, starting weight, and history stay on the Analytics screen.
- Analytics must communicate outcomes through direct metrics, charts, and actions; keep calculation methodology off the screen and never use explanatory paragraphs for trend, energy, or adaptive states. Calories shows average intake versus the current target, never logging-coverage progress.
- The Analytics monthly calorie calendar is a weekly target-adherence view: show total calories plus signed deviation from target, never logging-coverage fractions or a legend, keep day selection as the detail disclosure, and use only the calorie/overflow blues for deviation emphasis rather than extra bars or good/bad colors.
- The Today dashboard calorie ring is the White Action exception: use `M3.primary` for progress and `M3.onSurface` for overflow; keep calorie blue on Analytics and calendar visuals.
- Keep the Analytics plan update card; on phones, show Food days and Weigh-ins side by side with Days covered full-width below, never three equal evidence columns.
- Typography uses named Onest 400/500/600/700 assets. NativeWind's web preflight does not set the native default, so every `text-*` size role must bind Onest Regular. Every Onest family utility must emit `fontWeight: 400` even for medium/semibold/bold files; otherwise Android searches for a variant of the already-weighted named asset and falls back to Roboto. Reserve `text-compact` (11/14) for dense chart, calendar, nutrition, and ruler metadata, never explanatory or actionable copy.
- Eatlog raster branding must derive from one canonical 1024×1024 flat-white egg mask; vary only platform-required padding/background, and update every legacy PNG alias with the same branding change.
- Direct pushes to GitHub SSH remotes do not require authenticated `gh`; use `git commit` and `git push` when explicitly requested, and reserve `gh` authentication for API or PR operations.
- Never treat a human-readable CSV export as a restorable backup; only `.eatlog-backup` and legacy `.marco-backup` archives containing `manifest.json` and `database.sqlite` can be restored.
- Cloudflare Workers Free plan cannot deploy a custom `limits` block; rely on its built-in CPU/subrequest limits unless the account is upgraded to Workers Paid.
- Worker tests must exercise at least one request without injected runtime dependencies; call Web API methods such as `crypto.randomUUID()` through their owning object, never as unbound function references.
- The Worker health endpoint is `/healthz`, never `/health`.
- Gemini Flash-Lite rejects `maxItems` in Eatlog's `responseSchema`; omit it from the provider schema and enforce `MAX_COMPONENTS` after response normalization.
- How Eatlog Works must keep research references visible inline; do not hide them behind an accordion or disclosure.
- When a user requests a complete Impeccable command set, load and execute every named command playbook; never substitute `polish` as an umbrella workflow.
- Food-estimation prompts must stay Worker-owned under a test-enforced request-size budget; clarification context sends only source text plus component names and grams. Gemini `servingLabel` names exactly one practical unit and `servingSizeGrams` is that unit's weight; counted labels must be normalized to a one-unit label and total consumed grams at the Worker boundary.
- Sharing is meal-only: open it from an unbadged meal media rail or the meal swipe action, switch card styles with an unlabeled horizontal pager plus dots, and keep the permanent Eatlog mark and export actions visible without vertical scrolling; there is no mark toggle.
- Share-card nutrition bars keep a thick rounded outer capsule; render proportional fill with an exact flat top and inherit only the capsule's rounded bottom through clipping—never fake rounded fill caps or liquid waves.
- Review-sheet component rows expose portion controls and calculated macros after one expansion, while editable nutrition stays behind a second explicit `Nutrition values` disclosure; keep food identity stable, do not repeat preparation metadata under the editable name, separate sections with tonal highlights and full-width dividers inside one rounded outer container, and keep expanded height in normal React Native layout without clipped Reanimated layout transitions or measurement-triggered auto-scroll.
- Expanded review section titles share the same title role; the shared white-thumb Servings/Grams toggle and amount editor stay in one equal-height row, the toggle takes remaining width, and the editor is one compact fixed-width text field with no steppers or height-changing subtext. Keep values centered independently of an integrated label-derived serving unit (`egg`, `slice`, `piece`, etc., with `srv` only as fallback) or `g` suffix, use canonical no-space units and a clear selected state for amount shortcuts, and show total grams rather than per-unit weight in multi-serving summaries.
- The meal-review footer keeps the compact date action and Breakfast/Lunch/Dinner/Snack selector visible together in one row; show `Today` or a short month/day date without a year.
- Owner and friend testing uses the standalone EAS `preview` APK named `Eatlog Preview` with package `com.sgaret.eatlog.preview` and channel `subscription-preview`; never use `assembleDebug` while `expo-dev-client` is installed because its launcher requires Metro. RevenueCat Test Store previews use the preview-only `subscriptionPreview` build type derived from `release`, with Gradle `debuggable false`, a preview-only manifest overlay setting `android:debuggable="true"`, debug signing, `matchingFallbacks = ['release']`, and React Native developer support forced off in the preview-generated `MainApplication`; a normal release APK with a `test_` key crashes by design. Isolate unfinished subscription work behind RevenueCat Test Store and a staging Worker, and never publish a native-dependent billing change to an older preview runtime through EAS Update. RevenueCat CustomerInfo is the device UI authority: automatic startup/foreground refreshes preserve the SDK cache, only explicit user refresh invalidates it, transient unavailable snapshots cannot demote unexpired paid access, and Worker refreshes may update only AI grants/usage—not the displayed plan.
- RevenueCat v1 Manok verification must accept its documented subscription identity fields (`original_app_user_id`, `original_purchase_date`, and `store_transaction_id`); never require the undocumented `original_transaction_id`, and keep the derived quota identity stable across renewals.
- Keep RevenueCat product identifiers canonical across the offering, app, and Worker: Manok is `eatlog_manok` and the lifetime Itik product is `eatlog_itik`.
- When the owner says no Android emulator is available, do not attempt to create one; inspect the APK and request a phone bug report if a runtime stack is required.
- @gorhom/bottom-sheet v5 on Android: never set `android_keyboardInputMode="adjustResize"` together with `keyboardBehavior="interactive"`; an internal guard (BottomSheet.js) forces `heightWithinContainer=0` and disables keyboard-driven sheet animations. Keep the default `adjustPan`.
- Never nest `BottomSheetScrollView` inside `BottomSheetView`: BottomSheetView's mount effect overrides the scrollable type to VIEW, turning vertical pans into sheet drags and killing content scroll. Only use BottomSheetView when dynamic sizing needs measurement and no scroll view is inside it; otherwise wrap in plain `Animated.View`.
- Play App access review demands free access behind any paywall: never answer "all functionality is available" or "reviewer can purchase" when paid features exist; ship a hidden reviewer-unlock gesture + code that grants a complimentary entitlement, and declare restricted functionality with exact mechanical steps.
- Public Eatlog copy must sound like the founder and website: lead with the `Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.` wordplay, use serious humor, and keep provider, infrastructure, policy, and form language out. The first-person `everything I need, nothing I don't` origin belongs in the README only; store copy must make narrow product claims and address the buyer directly.
- User-stated amounts in a meal title or description are portion instructions: they scale `estimatedGrams` and component portions and must never appear in `mealName` or a component name. Display normalization must preserve apostrophes, hyphens, and deliberate inner capitals (`McDonald's`, `Shakey's`); reserve lossy `[^a-z0-9]` stripping for matching keys, never for shown text.
- FoodEditorView edits buffer into `editDraft` and reach the meal only via its Save button (Save also registers the re-estimate undo); Back/hardware-back prompt `Discard changes?` when the buffer is dirty, and editor open/close must reuse the sheet-state exit/enter choreography (90ms `emphasizedAccelerate` out, 150ms `emphasizedDecelerate` in, offset ±20 + opacity) — never swap the editor and list views without it.
- SQLite `datetime('now')` values are UTC without a zone suffix; parse stored timestamps through `parseSqliteUtcTimestamp` before display or time arithmetic, while preserving timestamps that already carry `Z` or a numeric offset.
- Gemini refuses calls that egress from a territory it does not serve, and the Cloudflare colo a user reaches is not their choice: a Manila phone routed to HKG gets 400 `FAILED_PRECONDITION` on every model. A location refusal must retry the same model through the `wnam`-pinned `GeminiRelay` Durable Object, never advance the model list, since the refusal is about the caller's location and not the model.

---

## 12. How this file was built

This boilerplate synthesizes:
- Sean Donahoe's IJFW ("It Just F\*cking Works") principles: one install, working code, no ceremony.
- Andrej Karpathy's observations on LLM coding pitfalls (the four principles: think-first, simplicity, surgical changes, goal-driven execution).
- Boris Cherny's public Claude Code workflow (reactive pruning, keep it ~100 lines, only rules that fix real mistakes).
- Anthropic's official Claude Code best practices (explore-plan-code-commit, verification loops, context as the scarce resource).
- Community anti-sycophancy patterns (explicit banned phrases, direct-not-diplomatic).
- The AGENTS.md open standard (cross-tool portability via symlinks).

Read once. Edit sections 10 and 11 for your project. Prune the rest over time. This file gets better the more you use it.

<!-- IJFW-MEMORY-START (managed -- do not edit manually) -->
<ijfw-memory>
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
</ijfw-memory>

<ijfw-profile>
Your portable working profile (derived from what you've said/edited; style + expertise only):
style.formality: casual
style.energy: measured
style.terseness: moderate
style.emoji_use: rare
expertise.markdown: novice
expertise.typescript: novice
expertise.txt: novice
expertise.javascript: novice
</ijfw-profile>
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-AGENTS-START -->
No project agents yet. Run `ijfw team` to set them up.
<!-- IJFW-AGENTS-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->
