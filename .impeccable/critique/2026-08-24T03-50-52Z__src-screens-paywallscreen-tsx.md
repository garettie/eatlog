---
target: billing/paywall screen
total_score: 25
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
timestamp: 2026-08-24T03-50-52Z
slug: src-screens-paywallscreen-tsx
---
⚠️ DEGRADED: single-context (sub-agents not authorized; user requested no questions)

# Billing and paywall screen critique

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Loading, purchase, current-plan, and recovery states are visible, but feedback is scattered across the full scroll instead of staying with the decision it affects. |
| 2 | Match System / Real World | 2/4 | “AI actions,” “clarifications,” “Store connection unavailable,” and the exposed Support ID make the screen read like billing documentation. |
| 3 | User Control and Freedom | 3/4 | Close, restore, refresh, production subscription management, and preview tier switching exist, but the actions are split across distant sections. |
| 4 | Consistency and Standards | 3/4 | The screen follows Eatlog’s dark Material surface and typography system, but it recreates cards and buttons instead of consistently using shared components. |
| 5 | Error Prevention | 3/4 | Invalid purchases are disabled and store failure is handled, but selected, current, active, and unavailable states compete inside the same plan cards. |
| 6 | Recognition Rather Than Recall | 3/4 | Plan choices and billing cadence are visible, but generic calendar/infinity icons do not help users build recognition around Pugo, Manok, and Itik. |
| 7 | Flexibility and Efficiency | 2/4 | Two purchase paths are available, but the primary action can sit beneath error copy while restore, refresh, compare, quota, support, and legal controls lengthen the journey. |
| 8 | Aesthetic and Minimalist Design | 1/4 | The page repeats the same facts across current plan, two large cards, a five-row table, an AI-limits card, and usage cards. |
| 9 | Error Recovery | 3/4 | Retry and restore are actionable and local data is protected, but duplicated recovery controls make the next best action less obvious. |
| 10 | Help and Documentation | 2/4 | Trial, quota, legal, and support details are present, but they are written and positioned as reference material rather than timely help. |
| **Total** |  | **25/40** | **Acceptable — safe mechanics, weak purchase hierarchy and product voice** |

## Design Specificity Verdict

**LLM assessment:** The tier names are unmistakably Eatlog, but almost everything around them is category-interchangeable subscription UI: generic calendar and infinity glyphs, oversized rounded rectangles, a SaaS comparison table, quota documentation, and a support block. An unrelated AI utility could replace the names and ship the composition unchanged. The missed opportunity is obvious: Pugo, Manok, and Itik already supply a memorable local vocabulary, yet the interface does not turn that vocabulary into recognition, tone, or a clearer choice.

**Deterministic scan:** The required detector returned `[]`: **0 rule findings** in `src/screens/PaywallScreen.tsx`. That clean result supports the source review’s positive mechanical findings—labeled controls, explicit disabled/busy states, accessible radio semantics, and adequate touch targets. It does not evaluate hierarchy, duplicated information, emotional fit, product voice, or whether the tier iconography is generic. There were no detector false positives.

**Visual overlays:** No reliable browser overlay is available. This is a native React Native surface and this session exposes no mutable browser canvas or Android device automation. No live server was started. The visual assessment uses the two supplied physical-device screenshots plus the current source and design system.

## Overall Impression

The screen is honest about price, trial, local-data safety, and recovery. It still feels like a requirements document rendered as cards. The single biggest opportunity is to make the top viewport do the whole job: understand the plans, choose one, and buy—with deeper policy and support details kept subordinate.

## What’s Working

- **The purchase contract is transparent.** Store-localized price, monthly versus lifetime cadence, trial eligibility, renewal, and current access are all represented instead of being hidden behind vague marketing.
- **Failure does not threaten owned data.** Expired, revoked, malformed, and unavailable states explicitly preserve local logging and data; retry and restore remain reachable.
- **Basic native interaction hygiene is sound.** Plan options expose radio semantics, busy actions are guarded, close and legal links are labeled, and primary/secondary controls meet the Android touch-target floor.

## Cognitive Load

**High: 5 of 8 checklist failures.** Single focus, chunking, visual hierarchy, one-thing-at-a-time, and progressive disclosure fail. Grouping, minimal plan choices, and basic recognition pass.

The user must process at least six competing chunks across the journey: current status, paid-plan explanation, two option cards, purchase/error action, comparison table, quota policy, purchase recovery, and support/legal material. The comparison table and AI-limits block repeat facts that should already be legible in the plan cards, so scrolling adds reading without adding decision value.

## Emotional Journey

- **Entry:** “Logging, targets, and backups stay free” creates useful reassurance, but the large current-plan card spends most of the first viewport confirming what the user already knows.
- **Decision:** The two giant cards and radio buttons make the choice explicit, yet their generic icons and repeated prose make both plans feel administrative rather than desirable or distinct.
- **Valley:** Store errors, footnotes, a large retry button, a comparison table, quotas, restore/refresh, and Support ID turn a simple upgrade into troubleshooting before commitment.
- **End:** Purchase and restoration feedback is responsible, but there is no concise confidence-building close. The final impression is legal/support boilerplate rather than “I chose the plan that fits me.”

## Priority Issues

### 1. [P1] The purchase decision is buried in a reference page

**What:** Current plan, paid-plan prose, two large plan cards, trial footnote, error card, CTA, comparison table, quota policy, usage, recovery, support, and legal links form one uninterrupted scroll.

**Why it matters:** A one-handed user cannot understand and complete the primary action in one focused viewport. Every repeated explanation reduces confidence instead of adding it.

**Fix:** Make current status a compact line, keep the two plan choices concise, place one contextual CTA immediately after them, merge common paid benefits into a short list, and move quota/support details into a quiet secondary section.

**Suggested command:** `$impeccable distill`

### 2. [P1] The tier presentation wastes Eatlog’s strongest naming idea

**What:** Pugo, Manok, and Itik are represented by a premium badge, calendar, and infinity icon. The plan cards differ mostly by billing copy.

**Why it matters:** Generic symbols make the plans harder to remember and leave the screen visually interchangeable with any subscription product.

**Fix:** Give each tier a restrained, consistent bird mark—quail for Pugo, chicken for Manok, duck for Itik—and pair each with a one-line role: free logbook, flexible monthly access, or lifetime access.

**Suggested command:** `$impeccable shape`

### 3. [P1] Copy speaks like implementation documentation

**What:** “AI actions,” “clarifications,” “Store connection unavailable,” “The store confirms eligibility,” and the preview-only cancellation explanation describe system mechanics rather than user intent.

**Why it matters:** Users must translate internal concepts during a payment decision. The technical tone clashes with the memorable Filipino tier names and Eatlog’s precise but human voice.

**Fix:** Use direct task language: “Scan or describe meals,” “Targets that adjust with your trend,” “We couldn’t reach the store,” and “In this preview, choosing Itik switches your test plan.” Keep exact quota figures available but secondary.

**Suggested command:** `$impeccable clarify`

### 4. [P2] Recovery actions compete instead of forming one path

**What:** “Retry plans,” “Refresh plan,” “Restore purchases,” “Manage subscription,” and purchase-state messages appear in separate sections.

**Why it matters:** On a slow or interrupted connection, users have to decide which recovery control applies and may repeat actions unnecessarily.

**Fix:** Put store retry beside the store error, keep restore as the single purchase-recovery action, show management only for active production subscriptions, and demote ordinary status refresh from the primary journey.

**Suggested command:** `$impeccable harden`

### 5. [P2] Visual hierarchy is flat and over-contained

**What:** Nearly every concept gets its own rounded rectangle at similar weight, while color is limited to white selection and coral failure.

**Why it matters:** Nothing except the oversized CTA establishes a strong reading order. The interface feels assembled from reusable cards rather than authored as one decision surface.

**Fix:** Use containment only for selectable plans and live status, introduce restrained tier-specific color inside the bird marks, rely on dividers and spacing for secondary facts, and keep one white primary action.

**Suggested command:** `$impeccable colorize`

## Persona Red Flags

### Casey — distracted, one-handed mobile user

- The primary purchase action can move below store-error content, while restore and refresh sit much farther down the page.
- The first viewport spends substantial space on the current Pugo state before presenting both choices.
- The screen requires extended reading and scrolling for a two-option decision.

### Riley — deliberate stress tester

- A store outage exposes selected plan cards, a large retry action, and later refresh/restore actions without clearly distinguishing price reload from entitlement recovery.
- “Current,” selected radio state, active-plan labels, unavailable price, and disabled purchase state can coexist and look contradictory.
- Preview-specific tier switching is explained as Test Store implementation behavior instead of a clear, scoped testing action.

### Jordan — confused first-timer

- “AI actions” and “clarifications” do not map naturally to scanning or describing food.
- The comparison table repeats facts but does not explain which paid plan fits a monthly versus long-term commitment.
- Generic calendar and infinity symbols provide no clue why the tiers are called Pugo, Manok, and Itik.

## Minor Observations

- The header copy says targets stay free while adaptive recommendations are shown as paid; the distinction needs sharper wording.
- The trial asterisk and separate eligibility sentence create legal-note energy even when the store can state eligibility directly.
- The full Support ID is visually prominent for information most users need only during support contact.
- “Eatlog” repeats before every tier name even though the entire screen is already inside Eatlog.
- The detector’s clean result is useful but narrow: static accessibility patterns are stronger than the screen’s information architecture.

## Questions to Consider

- What can disappear before a user loses any information needed to choose and pay?
- Can the first viewport communicate “free logbook, monthly flexibility, lifetime ownership” without a comparison table?
- How much product character can the birds add while still feeling like a serious training instrument rather than mascots?
