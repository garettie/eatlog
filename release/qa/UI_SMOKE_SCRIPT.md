# Eatlog release UI smoke script

Use a release-candidate binary. Record the commit, app version/build, platform/OS, device model, screen size, and result for every run. Capture real screenshots from the running app at the marked points; do not use mockups or generated UI.

## Synthetic seed

- Name: `Release Tester`
- Birth date: `1990-02-03`
- Sex: Female
- Height: `165 cm`
- Starting weight: `65.0 kg`
- Activity: Moderate
- Goal: Maintain
- Protein preference: Moderate
- Manual food: `Synthetic rice bowl`, `500 kcal`, `25 g` protein, `70 g` carbs, `13 g` fat
- Second food: `Synthetic toast`, `120 kcal`, `4 g` protein, `20 g` carbs, `3 g` fat

No real person, meal, photo, or health record may be used.

## Core smoke flow

1. Install fresh and launch. Complete About You, Height & Weight, Activity Level, Goal & Target Rate, and Protein Preference with the seed above. Select Calculate, review the result, then select Use these starting targets.
   Expected: onboarding completes without clipping or keyboard obstruction; Today opens with zero intake and the calculated target. Kill and reopen the app; the profile remains.
2. On Today, open the center Add control. Select Search foods, then Enter manually. Enter the synthetic rice bowl and select Log Entry.
   Expected: the entry appears once; Today calories and macros increase by the entered values; the Add sheet closes. Capture Today.
3. Open Diary and select today. Open the synthetic entry, change its amount, and save.
   Expected: the entry and day totals update once. Swipe the entry to delete it, then use Undo in the toast.
   Expected: the entry disappears, Undo restores it, and totals return without duplication. Repeat delete without Undo and verify it stays deleted.
4. Add the synthetic rice bowl and synthetic toast again so Diary contains data. Move between adjacent days and months, then return to today.
   Expected: selection, date header, entries, and totals remain aligned; no stale row flashes or delayed transition appears. Capture Diary.
5. Open Add → Log weight. Enter `65.0 kg`, select today’s date, and save.
   Expected: the weight is saved once. Reopen the same date, change to `65.1 kg`, and update.
   Expected: one row remains for the date and Analytics reflects the update.
6. Open Analytics and visit each available range or segment.
   Expected: logging consistency, calorie history, weight state, and plan state render without invalid numbers, overlap, or stale data. Empty or insufficient-evidence states are direct and actionable. Capture Analytics.
7. Open Profile. Visit Personal details, Goal and rate, Nutrition targets, Units, How Eatlog works, Privacy, About, Licenses and attributions, Backup and restore, and Export data.
   Expected: every back action returns correctly; long copy scrolls; links appear only when valid release URLs are configured; no placeholder contact or URL appears. On iOS, no Health Connect control or wording appears. On Android, Health Connect appears only in its Android locations.
8. Open Privacy.
   Expected: local storage, remote Scan/Describe, USDA, explicit Open Food Facts search, installation-token/IP rate limiting, backup/export, and deletion behavior match the release policy. Ordinary logging screens contain no recurring privacy paragraph.
9. Create a CSV export and dismiss or save the share sheet as directed by the platform run.
   Expected: cancellation does not claim a completed export. A saved archive contains readable CSV files and is rejected if selected as a restore source.
10. Create an `.eatlog-backup`; first run with no meal photo, then with at least two synthetic meal photos where the device case permits.
    Expected: cancellation during a cancellable stage reports cancellation. A completed archive previews the correct row/photo counts and restores only after both confirmations.
11. Restore the backup, then verify Today, Diary, Analytics, Profile, weights, targets, and photos.
    Expected: restored values match the source; no prior-device Health Connect sync state is active. Run the corrupt and rollback cases from `DEVICE_MATRIX.md` before signing off.
12. Open Profile → Delete all data. Cancel each confirmation once, then repeat and complete deletion.
    Expected: cancellation preserves all data. Completion returns Eatlog to onboarding and removes profile, logs, weights, targets, reviews, and meal photos. iOS shows no Health Connect wording; Android reports its Health Connect cleanup result accurately.

## Visual and accessibility pass

Repeat the core flow with the largest supported text size, screen reader enabled, reduced motion enabled, and both the smallest and largest target phones.

- Expected: text does not disappear behind controls; critical actions remain reachable by scrolling; labels and focus order describe the control and current state; touch targets are at least 48 points/dp where designed; keyboard focus does not hide active fields.
- Expected: sheets respect the home indicator/navigation area; swipe-back, Android Back, backdrop taps, and discard gates do not lose edits silently.
- Expected: long Unicode food names, five-digit calorie totals, loading, empty, error, offline, and rate-limit states remain readable.

## Evidence record

For each run, store:

- release commit and binary version/build;
- device model, OS/API, display size, locale, and text-size setting;
- start/end time and tester;
- pass/fail for each numbered step;
- real screenshot paths;
- issue IDs and severity;
- backup source platform/version/schema, destination platform/version/schema, and before/after photo counts.

This repository has no executable device or existing UI automation harness in the current environment. The automated UI box stays unchecked until this script is run with captured evidence or a verified lightweight harness is added.
