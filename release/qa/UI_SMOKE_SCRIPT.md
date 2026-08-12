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
- Meal-sharing photos: synthetic square, portrait, landscape, panorama, and rotated-orientation fixtures with no real person, location, or health information

No real person, meal, photo, or health record may be used.

## Core smoke flow

1. Install fresh and launch. Complete About You, Height & Weight, Activity Level, Goal & Target Rate, and Protein Preference with the seed above. Select Calculate, review the result, then select Use these starting targets.
   Expected: onboarding completes without clipping or keyboard obstruction; Today opens with zero intake and the calculated target. Kill and reopen the app; the profile remains.
2. On Today, open the center Add control. Select Search foods, then Enter manually. Enter the synthetic rice bowl and select Log Entry.
   Expected: the entry appears once; Today calories and macros increase by the entered values; the Add sheet closes. Capture Today.
3. Open Diary and select today. Open the synthetic entry, change its amount, and save.
   Expected: the entry and day totals update once. Swipe the entry to delete it, then use Undo in the toast.
   Expected: the entry disappears, Undo restores it, and totals return without duplication. Repeat delete without Undo and verify it stays deleted.
4. Add the synthetic rice bowl and synthetic toast as one meal with a synthetic photo, and add a photo-less meal plus a standalone food. Move between adjacent days and months, then return to today.
   Expected: selection, date header, entries, and totals remain aligned; no stale row flashes or delayed transition appears. Capture Diary.
5. Tap the photo meal’s image rail, which has no overlaid Share badge.
   Expected: Share meal opens directly with a 9:16 Photo preview. Position dots, the Eatlog mark control, Save image, and Share are visible together without vertical scrolling. Android Back returns to Diary. Capture the default composer.
6. Swipe the preview left and right through Photo, Framed, and Nutrition.
   Expected: horizontal paging snaps to one style at a time, the active dot follows the visible card, and no style names appear in the interface. Photo and Framed use their intended cover crop without stretching; Nutrition keeps the meal title and nutrition legible. Toggle the Eatlog mark off and on and verify the visible preview updates. Capture each style.
7. Return to Diary and swipe both the photo meal and the photo-less meal.
   Expected: Share appears immediately left of far-right Delete, both actions are 72dp wide, and selecting Share resets the row before opening that meal directly. Both meal media rails remain tappable without an overlaid Share badge. The photo-less meal opens the Nutrition card with Save image and Share enabled. Standalone foods remain Delete-only and expose no Share action. Capture both swipe actions and the photo-less fallback.
8. Save each selected style, repeating at least one save.
   Expected: permission is requested only after Save image; a visible and announced `Share image saved.` confirmation appears; the composer stays open; each PNG is 1080 by 1920, upright, uses the intended crop, and contains no source location, camera model, original filename, or capture timestamp metadata.
9. Select Share, open the native share sheet for at least two available targets, then cancel it. Repeat once.
   Expected: the selected card is attached as PNG, no Photos permission is requested, cancellation returns to the same composer/style without success or error copy, and no stale busy state remains.
10. Remove or invalidate a synthetic meal photo after its URI is stored, then open Share from its media rail and swipe action.
    Expected: the composer announces `Meal photo unavailable. Using the nutrition card.`, shows the inline fallback status, renders Nutrition with the deterministic food icon, and keeps Save image and Share enabled. Capture the fallback state.
11. Repeat every meal style and the photo-less fallback offline, with reduced motion, in portrait and landscape, with the largest supported text, and with TalkBack or VoiceOver.
    Expected: no network request is needed; Today, the Diary day header, Analytics, and standalone foods expose no Share action; safe areas, horizontal adjustment semantics, focus order, disabled/loading/busy states, and persistent footer actions remain usable.
12. Open Add → Log weight. Enter `65.0 kg`, select today’s date, and save.
   Expected: the weight is saved once. Reopen the same date, change to `65.1 kg`, and update.
   Expected: one row remains for the date and Analytics reflects the update.
13. Open Analytics and visit each available range or segment.
   Expected: logging consistency, calorie history, weight state, and plan state render without invalid numbers, overlap, or stale data. Empty or insufficient-evidence states are direct and actionable. Capture Analytics.
14. Open Profile. Visit Personal details, Goal and rate, Nutrition targets, Units, How Eatlog works, Privacy, About, Licenses and attributions, Backup and restore, and Export data.
   Expected: every back action returns correctly; long copy scrolls; links appear only when valid release URLs are configured; no placeholder contact or URL appears. On iOS, no Health Connect control or wording appears. On Android, Health Connect appears only in its Android locations.
15. Open Privacy.
   Expected: local storage, remote Scan/Describe, USDA, explicit Open Food Facts search, installation-token/IP rate limiting, backup/export, and deletion behavior match the release policy. Ordinary logging screens contain no recurring privacy paragraph.
16. Create a CSV export and dismiss or save the share sheet as directed by the platform run.
   Expected: cancellation does not claim a completed export. A saved archive contains readable CSV files and is rejected if selected as a restore source.
17. Create an `.eatlog-backup`; first run with no meal photo, then with at least two synthetic meal photos where the device case permits.
    Expected: cancellation during a cancellable stage reports cancellation. A completed archive previews the correct row/photo counts and restores only after both confirmations.
18. Restore the backup, then verify Today, Diary, Analytics, Profile, weights, targets, and photos.
    Expected: restored values match the source; no prior-device Health Connect sync state is active. Run the corrupt and rollback cases from `DEVICE_MATRIX.md` before signing off.
19. Open Profile → Delete all data. Cancel each confirmation once, then repeat and complete deletion.
    Expected: cancellation preserves all data. Completion returns Eatlog to onboarding and removes profile, logs, weights, targets, reviews, and meal photos. iOS shows no Health Connect wording; Android reports its Health Connect cleanup result accurately.

## Visual and accessibility pass

Repeat the core flow with the largest supported text size, screen reader enabled, reduced motion enabled, and both the smallest and largest target phones.

- Expected: text does not disappear behind controls; critical actions remain reachable by scrolling; labels and focus order describe the control and current state; touch targets are at least 48 points/dp where designed; keyboard focus does not hide active fields.
- Expected: sheets respect the home indicator/navigation area; swipe-back, Android Back, backdrop taps, and discard gates do not lose edits silently.
- Expected: long Unicode food names, five-digit calorie totals, loading, empty, error, offline, and rate-limit states remain readable.
- Expected: share controls expose Back/Close, horizontal adjustable preview semantics, Eatlog mark state, Save image, Share, swipe Share/Delete, disabled, loading, and busy semantics; the exported card remains 9:16 regardless of device orientation or font scale.

## Evidence record

For each run, store:

- release commit and binary version/build;
- device model, OS/API, display size, locale, and text-size setting;
- start/end time and tester;
- pass/fail for each numbered step;
- real screenshot paths;
- issue IDs and severity;
- backup source platform/version/schema, destination platform/version/schema, and before/after photo counts;
- default composer, Photo, Framed, Nutrition, swipe-action, and missing-photo fallback screenshot paths;
- generated PNG dimensions, orientation, metadata-inspection result, and tested share targets.

This repository has no executable device or existing UI automation harness in the current environment. The automated UI box stays unchecked until this script is run with captured evidence or a verified lightweight harness is added.
