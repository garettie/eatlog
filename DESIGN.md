---
name: Marco
description: Local-first adaptive macro tracking with scanner-first food logging.
colors:
  surface: "#111318"
  surface-container-lowest: "#0c0e13"
  surface-container-low: "#191c20"
  surface-container: "#1d2024"
  surface-container-high: "#282a2f"
  surface-container-highest: "#33353a"
  on-surface: "#e2e2e9"
  on-surface-variant: "#c4c6d0"
  placeholder: "#9aa0aa"
  outline: "#44474f"
  outline-variant: "#2b2d35"
  primary: "#ffffff"
  on-primary: "#0f1117"
  protein: "#f2b7c6"
  carbs: "#b5e3c4"
  fat: "#e5c36c"
  calories: "#a0cafd"
  expenditure: "#d0bcff"
  error: "#ffb4ab"
  error-container: "#93000a"
typography:
  display:
    fontFamily: "Inter-Bold"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 40
  headline:
    fontFamily: "Inter-Bold"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 29
  title:
    fontFamily: "Inter-SemiBold"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 20
  body:
    fontFamily: "Inter-Regular"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 20
  label:
    fontFamily: "Inter-SemiBold"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 16
rounded:
  input: "12px"
  card: "16px"
  surface: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "16px"
  card:
    backgroundColor: "{colors.surface-container}"
    rounded: "{rounded.surface}"
    padding: "20px"
  entry-card:
    backgroundColor: "{colors.surface-container}"
    rounded: "{rounded.card}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.input}"
    padding: "12px 16px"
  selected-chip:
    backgroundColor: "{colors.surface-container-highest}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.pill}"
---

# Design System: Marco

## Overview

**Creative North Star: "The Adaptive Training Instrument"**

Marco is a serious, calm Android training tool. Its dark Material 3 surface stack keeps the user focused on energy, macros, and trend data rather than decorative fitness theatrics. Information is compact but breathable: large tabular figures establish the current state, while toned surfaces and hairline borders establish hierarchy without shadows.

The system is scanner-first. The most delightful visual moment is a real meal photo when one exists; otherwise food-relevant Material Community icons preserve semantic recognition. Motion confirms state, navigation, selection, and calculation. It never exists as ambient decoration.

**Key Characteristics:**
- Tonal dark Material 3 layering, not gradients or glass.
- Real Inter weights, tabular numbers, and clear numeric hierarchy.
- Scanner/photo media is meaningful; icons are a robust offline fallback.
- Rounded surfaces with hairline boundaries, not floating shadow stacks.
- Android-native bottom sheets, Back behavior, 48dp touch targets, and reduced-motion support.

**The Scanner-First Rule.** Camera capture, gallery import, and meal description are the primary entry routes. Search and manual entry remain capable fallbacks, never the visual center of the product.

## Colors

Marco uses a near-black neutral stack for structure and reserves named macro colors for nutritional meaning only.

### Primary
- **White Action**: primary actions, selected dashboard state, and the active FAB.
- **Calorie Blue**: calorie progress and calendar completion rings.

### Secondary
- **Protein Rose**: protein labels, pills, and progress.
- **Carb Green**: carbohydrate labels, pills, and progress.
- **Fat Gold**: fat labels, pills, and progress.
- **Expenditure Lavender**: TDEE, trend weight, and adaptive-engine signals.

### Tertiary
- **Error Coral**: destructive actions and recoverable error messaging.

### Neutral
- **Surface Stack**: five tonal surface levels establish containment and elevation without shadows.
- **Ink and Muted Ink**: primary text is high-contrast; secondary text remains readable, never ghosted.
- **Placeholder Gray**: placeholders stay distinct from entered values while retaining AA contrast.

**The Nutrient Meaning Rule.** Protein is rose, carbs are green, fat is gold, and expenditure is lavender on every screen. Never reuse these colors as decoration or generic success/error states.

## Typography

**Display Font:** Inter-Bold
**Body Font:** Inter-Regular
**Label Font:** Inter-SemiBold

**Character:** Inter is disciplined, legible, and data-forward. Real bundled family files are mandatory; Android must not synthesize faux bold. Numeric readouts use tabular figures so live values never shift surrounding layout.

### Hierarchy
- **Display** (700, 36px, 40px): editable measurement values and one-time target reveals.
- **Headline** (700, 24px, 29px): onboarding, completion, and screen-level emphasis.
- **Title** (600, 16px, 20px): card titles, meal names, and navigation labels.
- **Body** (400, 14px, 20px): explanatory copy and supporting metadata.
- **Label** (600, 12px, 16px): controls, macros, and compact state labels; use `10px` only for ruler bounds and compact nutrition details.

**The Stable Figure Rule.** Calories, grams, dates, trend weights, and editable measurement values always use tabular numerals. Do not introduce proportional numerals into live numeric UI.

## Elevation

Marco is flat by default. Depth comes from the surface stack, hairline outline-variant borders, and nesting discipline; it does not use drop shadows on cards. A real meal photo may occupy a flush edge rail inside its clipped entry card, but it does not float above the interface.

**The Tonal Elevation Rule.** Use a higher surface token to distinguish an active or selected element. Never add a shadow to compensate for weak hierarchy.

## Components

### Buttons
- **Shape:** fully rounded pill.
- **Primary:** white fill with near-black text; standard vertical padding is 16px.
- **Press state:** modest opacity or scale feedback only; primary buttons use a brief scale-down.
- **Loading:** replace label/icon with an activity indicator; disable interaction.

### Chips
- **Style:** compact rounded pills; macro pills use their named nutrient color at low-opacity background.
- **State:** selected segmented states use the highest surface; unselected states are ghosted on the track. Dashboard’s consumed/remaining toggle is the deliberate white-primary exception.

### Cards / Containers
- **Corner Style:** screen cards use the surface radius; diary entries use the card radius.
- **Background:** surface-container with an outline-variant hairline when independently actionable.
- **Internal Padding:** 20px by default; 24px on high-importance onboarding and completion surfaces.
- **Diary:** meal-period headers are plain rows; every actual food or meal group is its own clipped entry card. Scanned meal photos are flush left rails; icons are the fallback.

### Inputs / Fields
- **Standard fields:** surface-container-high, input radius, outline-variant hairline, readable placeholder color.
- **Measurement fields:** centered, borderless display-scale Inter values with a compact unit. They remain directly editable and are paired with a ruler for coarse adjustment.
- **Focus:** retain native focus and full-select numeric content on tap. Never add a decorative fake input state.

### Navigation
- **Bottom navigation:** five destinations on compact Android, center white FAB for the one primary entry action.
- **Sheets:** use `@gorhom/bottom-sheet` with M3 handle, tonal surface, Back handling, discard guard, and interactive keyboard behavior.

### Signature Components
- **Calorie Ring and Toggle:** white ring on tonal track, numeric center, and a measured two-segment consumed/remaining thumb that never renders from a fallback width.
- **Ruler Slider:** horizontal-only gesture capture; height uses 8px per unit and tenths use 20px per unit; direct entry is always available; adjustable accessibility actions increment/decrement by the configured step.

## Do's and Don'ts

### Do:
- **Do** use `surface-container` for cards, `surface-container-high` for fields/tracks, and `surface-container-highest` for selected internal states.
- **Do** use 12px inputs, 16px entry cards, 24px screen cards, and full pills for actions/segmented controls.
- **Do** gate every Reanimated timing/entering motion through reduced-motion behavior; normal transitions stay in the 200–400ms range.
- **Do** keep diary food names semantic: show a stored scan thumbnail when available, otherwise use the deterministic food icon map.
- **Do** reserve a fixed right-side numeric column in diary entry rows; names wrap to two lines rather than colliding with kcal figures.
- **Do** use the same scanner-first entry vocabulary across Dashboard, Diary Entry Bar, and Food Sheet.

### Don't:
- **Don't** add confetti, streaks, badges, mascot language, or gamification noise.
- **Don't** use cream/sand backgrounds, warm-tinted generic SaaS neutrals, or generic dashboard gradients.
- **Don't** add drop shadows, glassmorphism, gradient text, colored side-stripe borders, or hero-metric SaaS templates.
- **Don't** hide complexity behind a mascot or casual coach-bot copy; Marco is precise and transparent.
- **Don't** make barcode camera scanning the primary interaction.
- **Don't** create per-screen component styles. Reuse Card, PrimaryButton, segmented controls, macro pills, and sheet vocabulary.
