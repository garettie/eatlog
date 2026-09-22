import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const reviewStateSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/ReviewState.tsx'),
  'utf8',
);
const tabNavigatorSource = readFileSync(
  resolve(testDirectory, './TabNavigator.tsx'),
  'utf8',
);
const portionStepperSource = readFileSync(
  resolve(testDirectory, '../components/PortionStepper.tsx'),
  'utf8',
);
const segmentedControlSource = readFileSync(
  resolve(testDirectory, '../components/SegmentedControl.tsx'),
  'utf8',
);
const mealPhotoEditorSource = readFileSync(
  resolve(testDirectory, '../components/MealPhotoEditor.tsx'),
  'utf8',
);
const macroSummaryCardSource = readFileSync(
  resolve(testDirectory, '../components/MacroSummaryCard.tsx'),
  'utf8',
);
const mealSelectorSource = readFileSync(
  resolve(testDirectory, '../components/MealSelector.tsx'),
  'utf8',
);
const mealPortionSelectorSource = readFileSync(
  resolve(testDirectory, '../components/MealPortionSelector.tsx'),
  'utf8',
);
const mealReviewSource = readFileSync(
  resolve(testDirectory, '../utils/mealReview.ts'),
  'utf8',
);
const singleFoodReviewSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/SingleFoodReviewState.tsx'),
  'utf8',
);
const addComponentViewSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/AddComponentView.tsx'),
  'utf8',
);
const viewTransitionSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/useViewTransition.ts'),
  'utf8',
);

test('the review sheet corrects a food in a focused editor, not an inline expansion', () => {
  // The editor is an internal view of ReviewState, not a sheet state or an in-row form.
  assert.match(reviewStateSource, /const \[editingId, setEditingId\] = useState/);
  assert.match(reviewStateSource, /function FoodEditorView/);
  assert.match(reviewStateSource, /<FoodEditorView/);
  assert.match(reviewStateSource, /const openEditor = useCallback/);
  assert.match(reviewStateSource, /const requestCloseEditor = useCallback/);
  // The old inline-expansion machinery is gone.
  assert.doesNotMatch(reviewStateSource, /expandedIds/);
  assert.doesNotMatch(reviewStateSource, /nutritionExpandedIds/);
  assert.doesNotMatch(reviewStateSource, /const isExpanded =/);
});

test('editor edits buffer until Save and Back asks before discarding', () => {
  // Edits land in a draft; the meal only changes on Save.
  assert.match(reviewStateSource, /const \[editDraft, setEditDraft\] = useState/);
  assert.match(reviewStateSource, /const \[editorOpen, setEditorOpen\] = useState/);
  assert.match(reviewStateSource, /const saveEditor = useCallback/);
  assert.match(reviewStateSource, /title="Save changes"/);
  // Back goes through the same discard prompt as pan-down dismissal.
  assert.match(reviewStateSource, /showDialog\(\{\s*title: "Discard changes\?",\s*message: "Your edits will be lost\."/);
  // Open/close reuse the sheet-state exit/enter choreography.
  assert.match(reviewStateSource, /useViewTransition<ReviewView>/);
  assert.match(viewTransitionSource, /emphasizedAccelerate/);
  assert.match(viewTransitionSource, /emphasizedDecelerate/);
  assert.match(viewTransitionSource, /const EXIT_MS = DURATION\.exit/);
  assert.match(viewTransitionSource, /const ENTER_MS = DURATION\.enter/);
});

test('one transition drives every internal view, and it knows its direction', () => {
  // Forward views leave left and arrive from the right; going back reverses both.
  assert.match(viewTransitionSource, /isForward\?: \(from: T, to: T\) => boolean/);
  assert.match(viewTransitionSource, /enterOffsetRef\.current = forward \? OFFSET : -OFFSET/);
  assert.match(viewTransitionSource, /forward \? -OFFSET : OFFSET/);
  // Reduced motion commits immediately, with no offset to animate.
  assert.match(viewTransitionSource, /if \(reducedMotion\) \{[\s\S]*?setRendered\(target\);/);
  assert.match(reviewStateSource, /const reviewViewIsForward = \(_from: ReviewView, to: ReviewView\) => to !== "list"/);
  assert.match(addComponentViewSource, /const addPageIsForward = \(_from: AddPage, to: AddPage\) => to !== "search"/);
});

test('adding a food is a page of its own, not an inline menu in the review sheet', () => {
  // The row opens the add view; the old in-place mode switcher is gone.
  assert.match(reviewStateSource, /const openAddFood = useCallback/);
  assert.match(reviewStateSource, /<AddComponentView/);
  assert.doesNotMatch(reviewStateSource, /AddComponentSection/);
  assert.match(reviewStateSource, /accessibilityLabel="Add food"/);
  // Search is the root page; describing and manual entry are pages, not tabs.
  assert.match(addComponentViewSource, /type AddPage = "search" \| "describe" \| "manual"/);
  assert.match(addComponentViewSource, /useViewTransition<AddPage>/);
  assert.match(addComponentViewSource, /title="Add food"/);
  assert.match(addComponentViewSource, /title="Estimate"/);
});

test('the add flow guards typed drafts on Back, hardware Back, and sheet dismissal', () => {
  assert.match(addComponentViewSource, /const requestBack = useCallback/);
  assert.match(
    addComponentViewSource,
    /showDialog\(\{\s*title: "Discard changes\?",\s*message: "Your edits will be lost\."/,
  );
  assert.match(addComponentViewSource, /BackHandler\.addEventListener\(\s*"hardwareBackPress"/);
  assert.match(addComponentViewSource, /discardGuard\.register\(/);
  assert.match(addComponentViewSource, /<SheetBackButton onPress=\{requestBack\} \/>/);
});

test('hardware Back closes the editor before it pops the sheet', () => {
  assert.match(
    reviewStateSource,
    /BackHandler\.addEventListener\("hardwareBackPress"/,
  );
  // Registered only while a food is open so it wins over the sheet's own handler.
  assert.match(reviewStateSource, /if \(!editorOpen\) return;\n\t\tconst subscription = BackHandler/);
  assert.match(reviewStateSource, /<SheetBackButton onPress=\{onGoBack\} \/>/);
  assert.match(reviewStateSource, /<SheetBackButton onPress=\{onClose\} \/>/);
});

test('compact food rows open the editor and carry no per-row remove', () => {
  assert.match(reviewStateSource, /onPress=\{\(\) => openEditor\(comp, idx\)\}/);
  assert.match(reviewStateSource, /name="chevron-right"/);
  // The calorie figure shows once, in the collapsed row (not duplicated in the editor).
  assert.equal(reviewStateSource.match(/\{cal\} kcal/g)?.length, 1);
  // Remove lives only in the editor now.
  assert.equal(reviewStateSource.match(/>\s*Remove food\s*<\/Text>/g)?.length, 1);
  assert.match(reviewStateSource, />\s*Foods\s*<\/Text>/);
});

test('the photo band and combined totals rail replace the thumb card and plain summary', () => {
  assert.match(reviewStateSource, /<MealPhotoEditor[\s\S]*?layout="band"/);
  assert.match(reviewStateSource, /<MacroSummaryCard[\s\S]*?variant="rail"/);
  assert.match(macroSummaryCardSource, /variant !== "rail"/);
  // The rail carries the numbers only. A food-count line under them restated what the
  // list already shows, and per-food problems are called out on their own rows.
  assert.doesNotMatch(reviewStateSource, /summarizeReviewStatus|railStatus/);
  assert.doesNotMatch(macroSummaryCardSource, /status/);
  assert.match(mealPhotoEditorSource, /layout\?: 'card' \| 'band'/);
  assert.match(mealPhotoEditorSource, /if \(layout === 'band'\)/);
});

test('the editor keeps identity stable and defers editable nutrition behind one disclosure', () => {
  assert.match(reviewStateSource, /value=\{component\.food\.name\}/);
  assert.match(reviewStateSource, /kcal \/ 100 g/);
  assert.match(reviewStateSource, /accessibilityState=\{\{ expanded: nutritionExpanded \}\}/);
  assert.match(reviewStateSource, /<DisclosureChevron expanded=\{nutritionExpanded\} \/>/);
  assert.match(reviewStateSource, />\s*Nutrition values\s*<\/Text>/);
  assert.match(reviewStateSource, /min-w-\[132px\] flex-1/);
});

test('renamed and low-confidence foods surface a persistent attention band with a nutrition decision', () => {
  assert.match(reviewStateSource, /nutritionAcknowledged/);
  assert.match(reviewStateSource, /Nutrition based on \{component\.originalName\.trim\(\)\}/);
  assert.match(reviewStateSource, />\s*Keep values\s*<\/Text>/);
  assert.match(reviewStateSource, /hasUnreviewedNutrition/);
  assert.match(reviewStateSource, /const showAttentionBand = lowConfidence \|\| nameChanged/);
});

test('the log blocker points at the specific food that needs attention', () => {
  assert.match(reviewStateSource, /const firstOffendingIdx = components\.findIndex/);
  assert.match(
    reviewStateSource,
    /openEditor\(components\[firstOffendingIdx\], firstOffendingIdx\)/,
  );
  assert.match(reviewStateSource, /title=\{editMealId \? "Update meal" : "Log meal"\}/);
});

test('editor content is laid out in normal flow, not clipped by measured animation', () => {
  const editor = reviewStateSource.slice(
    reviewStateSource.indexOf('function FoodEditorView'),
  );
  assert.doesNotMatch(editor, /LinearTransition/);
  assert.doesNotMatch(editor, /pendingScrollIdRef|scrollViewRef\.current\?\.scrollTo/);
  assert.doesNotMatch(editor, /layout=\{/);
});

test('meal destination stays visible in one compact row', () => {
  assert.match(reviewStateSource, /const compactLogDateLabel/);
  assert.match(reviewStateSource, /effectiveLogDate === today/);
  assert.match(reviewStateSource, /month: "short"/);
  assert.match(reviewStateSource, /day: "numeric"/);
  assert.match(reviewStateSource, /<MealSelector[\s\S]*compact[\s\S]*disabled=\{logging\}/);
  assert.doesNotMatch(reviewStateSource, /destinationEditorVisible/);
  assert.match(mealSelectorSource, /compactLabel: 'Bfast'/);
  assert.match(mealSelectorSource, /compact \? m\.compactLabel : m\.label/);
});

test('every nonempty meal exposes a full-plate portion selector by default', () => {
  assert.match(
    reviewStateSource,
    /if \(!components\.length\) return null;[\s\S]*?kind: 'plate',[\s\S]*?servesTotal: 1/,
  );
  assert.match(reviewStateSource, /\{portionScale \? \([\s\S]*?<MealPortionSelector/);
  assert.match(mealPortionSelectorSource, /scale\.kind === 'plate'/);
  assert.match(mealPortionSelectorSource, /\{ value: 1, label: 'All' \}/);
  assert.match(mealPortionSelectorSource, /\{ value: 0\.5, label: 'Half' \}/);
  assert.match(mealPortionSelectorSource, /\{ value: 0\.25, label: 'Quarter' \}/);
});

test('a single food counts in its own serving even when the estimate returned a division', () => {
  // A packaged label reports its container yield ("67 scoops per tub") as a division;
  // that must never override the one food's own scoop count and show "67 of 67".
  assert.match(
    reviewStateSource,
    /const singleServing = useMemo\(\(\) => \{\s*if \(components\.length !== 1\) return null;/,
  );
  assert.match(
    reviewStateSource,
    /if \(singleServing\) return \{ kind: 'count'[\s\S]*?\}\s*;\s*if \(division\) return scaleFromDivision/,
  );
  assert.match(
    reviewStateSource,
    /const portionCount = singleServing\s*\?[\s\S]*?selection\.grams \/ singleServing\.grams/,
  );
});

test('the disclosure chevron animates transform-only and reduced-motion safe', () => {
  assert.match(reviewStateSource, /function DisclosureChevron/);
  assert.match(reviewStateSource, /duration: reducedMotion \? 0 : 250/);
  assert.match(reviewStateSource, /transform: \[\{ rotate: `\$\{rotation\.value\}deg` \}\]/);
});

test('review dismissal keeps discard protection for direct entry flows', () => {
  assert.match(tabNavigatorSource, /sheet\.stateKey !== 'review'/);
});

test('tapping a diary meal opens its review sheet without an animation-frame handoff', () => {
  const openEditMealSource = tabNavigatorSource.slice(
    tabNavigatorSource.indexOf('const openEditMeal'),
    tabNavigatorSource.indexOf('const resetToEntry'),
  );

  assert.match(openEditMealSource, /stateKey: 'review'/);
  assert.match(openEditMealSource, /describeResult: result/);
  assert.doesNotMatch(openEditMealSource, /requestAnimationFrame/);
});

test('disclosures announce state and Undo respects accessibility timing', () => {
  assert.match(reviewStateSource, /announceForAccessibility/);
  assert.match(reviewStateSource, /getRecommendedTimeoutMillis\(UNDO_TIMEOUT_MS\)/);
  assert.match(reviewStateSource, /accessibilityRole="header"/);
  assert.match(mealPhotoEditorSource, /accessibilityState=\{\{ disabled: busy \|\| disabled, busy \}\}/);
});

test('the portion amount editor lays value and unit as flex siblings, never overlapping', () => {
  assert.match(portionStepperSource, /flex-1 min-w-0 h-full text-center/);
  assert.match(portionStepperSource, /ml-1 shrink-0/);
  assert.match(portionStepperSource, /\{servingIndicator\}/);
  assert.match(portionStepperSource, />\s*g\s*<\/Text>/);
  // The old absolute overlay that let long values slide under the unit is gone.
  assert.doesNotMatch(portionStepperSource, /relative w-full h-full items-center justify-center/);
  assert.doesNotMatch(portionStepperSource, /absolute right-2/);
});

test('portion mode and amount editor share one contrasting control row', () => {
  assert.match(portionStepperSource, /flex-row items-center/);
  assert.match(portionStepperSource, /<View className="flex-1 min-w-0">/);
  assert.match(portionStepperSource, /tone="inset"/);
  assert.match(segmentedControlSource, /tone === 'inset'/);
  assert.match(segmentedControlSource, /bg-m3-surface-container border-m3-outline-variant\/50/);
  assert.match(portionStepperSource, /const editorInvalid/);
  assert.match(portionStepperSource, /w-\[104px\] shrink-0/);
  assert.match(portionStepperSource, /h-\[52px\] bg-m3-surface-container rounded-xl/);
  assert.doesNotMatch(portionStepperSource, /onServingsDelta|formatServingSummary/);
});

test('per-food review status stays on the food rows, with no summary line', () => {
  assert.match(mealReviewSource, /export function componentReviewStatus/);
  assert.doesNotMatch(mealReviewSource, /summarizeReviewStatus|No foods yet/);
  // Collapsed-portion behaviour stays covered by utils/portionSummary.test.ts.
  assert.match(mealReviewSource, /Math\.abs\(servings - 1\) < 0\.001 \? serving\.grams : grams/);
});

test('single-food review guards edits against dismissal and matches the meal footer', () => {
  assert.match(singleFoodReviewSource, /discardGuard\.register/);
  assert.match(singleFoodReviewSource, /dirtyRef\.current && !loggedRef\.current/);
  assert.match(singleFoodReviewSource, /<MealDateView/);
  assert.match(singleFoodReviewSource, /<MealSelector\s+value=\{meal\}\s+compact/);
  // The direct-entry force-close path must not bypass the discard guard here.
  assert.match(
    tabNavigatorSource,
    /sheet\.stateKey !== 'single-food-review'/,
  );
});

test('sheet decisions use the in-sheet dialog, never a native alert', () => {
  const sheetSources = [
    '../components/sheet-states/ReviewState.tsx',
    '../components/sheet-states/AddComponentView.tsx',
    '../components/sheet-states/WeightInputState.tsx',
    '../components/sheet-states/FoodSheetContent.tsx',
    '../components/sheet-states/useDiscardGuard.ts',
    '../components/MealPhotoEditor.tsx',
  ].map((path) => readFileSync(resolve(testDirectory, path), 'utf8'));
  for (const source of sheetSources) {
    assert.doesNotMatch(source, /Alert\.alert/);
  }
  // The sheet hosts the dialog, and hardware Back dismisses it before anything else.
  const sheetSource = readFileSync(resolve(testDirectory, '../components/Sheet.tsx'), 'utf8');
  const dialogSource = readFileSync(resolve(testDirectory, '../components/SheetDialog.tsx'), 'utf8');
  assert.match(sheetSource, /<SheetDialogOverlay host=\{dialog\} \/>/);
  assert.match(dialogSource, /BackHandler\.addEventListener\('hardwareBackPress'/);
});
