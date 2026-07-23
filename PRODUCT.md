# Product

## Register

product

## Users

The app owner and a small group of friends who sideload the APK. Personal use, one phone = one person's data. Context: checking daily macros, logging food, tracking weight trends. No shared accounts or social features.

## Product Purpose

Local-first adaptive calorie/macro tracker that estimates true daily energy expenditure from logged food intake and weight-trend data, then adjusts targets weekly. No backend, no auth — fully on-device via SQLite.

## Brand Personality

Precise, clean, effective.

## Anti-references

- Over-decorated fitness apps with gamification noise (confetti, streaks, badges everywhere)
- Generic SaaS dashboards with cream/sand backgrounds and warm-tinted neutrals
- Apps that hide complexity behind friendly mascots or casual copy
- Barcode-camera-first trackers that make scanning the primary interaction

## Design Principles

1. Data over decoration — every element earns its place through utility
2. Progressive disclosure — reveal complexity only when the user needs it
3. Consistent component vocabulary — same patterns reused across every screen
4. Trust through transparency — show how calculations work, don't hide the algorithm

## Accessibility & Inclusion

- WCAG AA contrast ratios on all text
- Inter font at readable sizes (no text below 10px equivalent)
- Touch targets minimum 44x44px
- Reduced motion support via React Native Reanimated
