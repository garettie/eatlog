import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	AccessibilityInfo,
	ActivityIndicator,
	Alert,
	BackHandler,
	Pressable,
	Text,
	View,
} from "react-native";
import {
	BottomSheetScrollView,
	BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, {
	FadeIn,
	FadeInUp,
	FadeOutDown,
	runOnJS,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

import { type MealType, saveMealWithComponents } from "../../db/database";
import type { FoodResult } from "../../services/foodSearch";
import type {
	ComponentClarificationInput,
	DescribeResult,
	EstimateContextComponent,
	MealClarificationInput,
} from "../../services/foodScan";
import { defaultMealForNow } from "../../utils/calculations";
import { useToday } from "../../hooks/useToday";
import { useDiscardGuardContext } from "./useDiscardGuard";
import SheetBackButton from "./SheetBackButton";
import AddComponentSection from "../AddComponentSection";
import MealSelector from "../MealSelector";
import PortionStepper from "../PortionStepper";
import PrimaryButton from "../PrimaryButton";
import DateSelector from "../DateSelector";
import MealPhotoEditor from "../MealPhotoEditor";
import MacroSummaryCard from "../MacroSummaryCard";
import {
	formatLogDateLabel,
	isoFromDate,
	parseLocalISO,
	todayISO,
} from "../../utils/calendar";
import { M3 } from "../../theme/tokens";
import { EASING } from "../../theme/motion";
import { useRemoteEstimateConsent } from "../../context/RemoteEstimateConsentContext";
import { useEntitlement } from "../../context/EntitlementContext";
import { PAID_ACCESS_UNAVAILABLE_MESSAGE } from "../../services/billing.types";
import type { ClarificationOutcome } from "./FoodSheetContent";
import { formatPortionLabel } from "../../utils/portionLabels";
import {
	buildFoodAmountOptions,
	selectFoodAmount,
	selectedServing,
	servingsForSelection,
	setGramsAmount,
	setPortionMode,
	setServingAmount,
	type FoodAmountOption,
	type PortionMode,
} from "../../utils/portionSelection";
import {
	acknowledgeComponentNutrition,
	applyUndo,
	componentNameChanged,
	componentReviewStatus,
	computeMealTotals,
	describeLogBlocker,
	formatCollapsedPortion,
	isLoggingBlocked,
	removeComponentAt,
	renameComponent,
	replaceComponent,
	setComponentPer100g,
	summarizeReviewStatus,
	toEditable,
	toEstimateContext,
	UNDO_TIMEOUT_MS,
	type EditableComponent,
	type UndoAction,
} from "../../utils/mealReview";

function DisclosureChevron({ expanded }: { expanded: boolean }) {
	const reducedMotion = useReducedMotion();
	const rotation = useSharedValue(expanded ? 180 : 0);

	useEffect(() => {
		rotation.value = withTiming(expanded ? 180 : 0, {
			duration: reducedMotion ? 0 : 250,
			easing: EASING.emphasized,
		});
	}, [expanded, reducedMotion, rotation]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${rotation.value}deg` }],
	}));

	return (
		<Animated.View style={animatedStyle} pointerEvents="none">
			<MaterialIcons name="expand-more" size={20} color={M3.onSurfaceVariant} />
		</Animated.View>
	);
}


interface ReviewStateProps {
	result: DescribeResult | null;
	/** Existing or captured meal photo to persist with the meal. */
	photoUri?: string | null;
	onLogComplete: (info: {
		mealId: number;
		logIds: number[];
		meal: MealType;
		name: string;
		calories: number;
		wasUpdate: boolean;
		logDate: string;
	}) => void;
	onClarify: (input: MealClarificationInput) => Promise<ClarificationOutcome<DescribeResult>>;
	onClarifyComponent: (input: ComponentClarificationInput) => Promise<ClarificationOutcome<FoodResult>>;
	editMealId?: number | null;
	initialMeal?: MealType | null;
	/** Diary date to write to (backfill); null = today. Preserves the original date when editing a meal. */
	logDate?: string | null;
	onGoBack: () => boolean;
}

function MacroTextInput({
	value,
	label,
	onValueChange,
}: {
	value: number;
	label: string;
	onValueChange: (value: number) => void;
}) {
	const [draft, setDraft] = useState(String(value));
	const normalizedDraft = draft.trim().replace(",", ".");
	const parsedDraft = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizedDraft)
		? Number(normalizedDraft)
		: null;
	const draftInvalid = parsedDraft == null || !Number.isFinite(parsedDraft);

	useEffect(() => {
		setDraft(String(value));
	}, [value]);

	return (
		<BottomSheetTextInput
			value={draft}
			onChangeText={(text) => {
				setDraft(text);
				const normalized = text.trim().replace(",", ".");
				if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return;
				const nextValue = Number(normalized);
				if (Number.isFinite(nextValue)) onValueChange(nextValue);
			}}
			onBlur={() => {
				if (draft === "" || draftInvalid) setDraft(String(value));
			}}
			keyboardType="numeric"
			maxLength={7}
			accessibilityLabel={label}
			accessibilityHint={
				draftInvalid
					? "Invalid value. Enter zero or a positive number."
					: "Enter zero or a positive number"
			}
			className={`min-h-[48px] bg-m3-surface-container text-m3-on-surface text-base font-medium tabular-nums rounded-xl px-3 py-3 border text-center ${draftInvalid ? "border-m3-error" : "border-m3-outline-variant/50"}`}
		/>
	);
}

export default function ReviewState({
	result,
	photoUri,
	onLogComplete,
	onClarify,
	onClarifyComponent,
	editMealId,
	initialMeal,
	logDate: logDateProp,
	onGoBack,
}: ReviewStateProps) {
	const { requestConsent } = useRemoteEstimateConsent();
	const { ensurePaidAccess } = useEntitlement();
	const navigation = useNavigation<any>();
	const [mealName, setMealName] = useState(result?.mealName ?? "");
	const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(
		photoUri ?? null,
	);
	const [components, setComponents] = useState<EditableComponent[]>(() =>
		(result?.components ?? []).map(toEditable),
	);
	// The focused editor is an internal view of this component, not a sheet state. Edits
	// buffer into `editDraft` and only reach the meal on Save; `editorOpen` is the
	// transition target while `renderedEditorView` is the committed view, so open/close
	// can run the same exit/enter choreography every sheet state uses.
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingIndex, setEditingIndex] = useState(-1);
	const [editDraft, setEditDraft] = useState<EditableComponent | null>(null);
	const [editorOpen, setEditorOpen] = useState(false);
	const [renderedEditorView, setRenderedEditorView] = useState<"list" | "editor">(
		"list",
	);
	const [nutritionExpanded, setNutritionExpanded] = useState(false);
	const editorDirtyRef = useRef(false);
	const redoneInEditorRef = useRef(false);
	const preRedoDraftRef = useRef<EditableComponent | null>(null);
	const enteringEditorViewRef = useRef(false);
	const editorTransitionRequestRef = useRef(0);
	const editorOffset = useSharedValue(0);
	const editorOpacity = useSharedValue(1);
	const [meal, setMeal] = useState<MealType>(
		() => initialMeal ?? defaultMealForNow(),
	);
	const [logDate, setLogDate] = useState(() => logDateProp ?? todayISO());
	const [dateSelectorVisible, setDateSelectorVisible] = useState(false);
	const [logging, setLogging] = useState(false);
	const [logError, setLogError] = useState<string | null>(null);
	const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
	const [clarifying, setClarifying] = useState(false);
	const [clarifyError, setClarifyError] = useState<string | null>(null);
	const [clarifyingComponentId, setClarifyingComponentId] = useState<
		string | null
	>(null);
	const [componentClarifyError, setComponentClarifyError] = useState<{
		id: string;
		message: string;
	} | null>(null);

	const dirtyRef = useRef(false);
	const loggedRef = useRef(false);
	const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const undoGenerationRef = useRef(0);
	const originalMealNameRef = useRef(result?.mealName ?? "");
	const previousResultRef = useRef(result);
	const discardGuard = useDiscardGuardContext();
	const reducedMotion = useReducedMotion();
	const insets = useSafeAreaInsets();
	const today = useToday();
	const logDateOverrideRef = useRef(false);
	const effectiveLogDate = logDateOverrideRef.current
		? logDate
		: (logDateProp ?? today);
	const compactLogDateLabel =
		effectiveLogDate === today
			? "Today"
			: parseLocalISO(effectiveLogDate).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				});
	const hasInvalidComponentName = components.some(
		(component) => !component.food.name.trim(),
	);
	const hasUnreviewedNutrition = components.some(
		(component) => componentNameChanged(component) && !component.nutritionAcknowledged,
	);
	const hasInvalidPortion = components.some(
		(component) => !component.portionValid,
	);
	const loggingBlocked =
		components.length === 0 ||
		!mealName.trim() ||
		hasInvalidComponentName ||
		hasUnreviewedNutrition ||
		hasInvalidPortion;
	const blockedReason = components.length === 0
		? "Add a food before logging."
		: !mealName.trim()
			? "Name this meal before logging."
			: hasInvalidComponentName
				? "Name every food before logging."
				: hasUnreviewedNutrition
					? "Review nutrition for renamed foods."
					: hasInvalidPortion
						? "Enter a valid portion for every food."
						: null;

	useEffect(() => {
		logDateOverrideRef.current = false;
		setLogDate(logDateProp ?? today);
	}, [logDateProp]);

	useEffect(() => {
		if (previousResultRef.current === result) return;
		previousResultRef.current = result;
		if (result) {
			originalMealNameRef.current = result.mealName;
			setMealName(result.mealName);
			setComponents(result.components.map(toEditable));
			setEditingId(null);
			setEditDraft(null);
			setEditingIndex(-1);
			setEditorOpen(false);
			setRenderedEditorView("list");
			enteringEditorViewRef.current = false;
			editorOffset.value = 0;
			editorOpacity.value = 1;
			setNutritionExpanded(false);
			editorDirtyRef.current = false;
			redoneInEditorRef.current = false;
			preRedoDraftRef.current = null;
			dirtyRef.current = false;
			loggedRef.current = false;
			setUndoAction(null);
		}
	}, [result, editorOffset, editorOpacity]);

	useEffect(() => {
		setSelectedPhotoUri(photoUri ?? null);
	}, [editMealId, photoUri]);

	useEffect(() => {
		const unregister = discardGuard.register(
			() => dirtyRef.current && !loggedRef.current,
			() => {
				dirtyRef.current = false;
				loggedRef.current = false;
			},
		);
		return unregister;
	}, [discardGuard]);

	useEffect(
		() => () => {
			undoGenerationRef.current += 1;
			if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
		},
		[],
	);

	const showUndo = useCallback((action: UndoAction) => {
		const generation = ++undoGenerationRef.current;
		if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
		setUndoAction(action);
		const scheduleTimeout = (timeout: number) => {
			if (generation !== undoGenerationRef.current) return;
			if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
			undoTimerRef.current = setTimeout(() => {
				if (generation !== undoGenerationRef.current) return;
				undoTimerRef.current = null;
				setUndoAction(null);
			}, timeout);
		};
		scheduleTimeout(UNDO_TIMEOUT_MS);
		void AccessibilityInfo.getRecommendedTimeoutMillis(UNDO_TIMEOUT_MS)
			.then((timeout) => {
				if (timeout > UNDO_TIMEOUT_MS) scheduleTimeout(timeout);
			})
			.catch(() => {});
	}, []);

	const totalMacros = useMemo(() => {
		let cal = 0,
			pro10 = 0,
			carb10 = 0,
			fat10 = 0,
			totalGrams = 0;
		for (const comp of components) {
			const ratio = comp.selection.grams / 100;
			cal += Math.round(comp.per100g.calories * ratio);
			pro10 += Math.round(comp.per100g.protein * ratio * 10);
			carb10 += Math.round(comp.per100g.carbs * ratio * 10);
			fat10 += Math.round(comp.per100g.fat * ratio * 10);
			totalGrams += comp.selection.grams;
		}
		return {
			calories: cal,
			protein: pro10 / 10,
			carbs: carb10 / 10,
			fat: fat10 / 10,
			totalGrams: Math.round(totalGrams),
		};
	}, [components]);

	const updateGrams = useCallback((grams: number) => {
		editorDirtyRef.current = true;
		setEditDraft((draft) =>
			draft ? { ...draft, selection: setGramsAmount(draft.selection, grams) } : draft,
		);
	}, []);


	const updateServingsFromText = useCallback((value: number) => {
		editorDirtyRef.current = true;
		setEditDraft((draft) =>
			draft
				? {
						...draft,
						selection: setServingAmount(
							draft.selection,
							value,
							selectedServing(draft.food, draft.selection),
						),
					}
				: draft,
		);
	}, []);

	const updateName = useCallback((name: string) => {
		editorDirtyRef.current = true;
		setLogError(null);
		setComponentClarifyError(null);
		setEditDraft((draft) =>
			draft
				? {
						...draft,
						food: { ...draft.food, name, normalizedName: name.toLowerCase() },
						nutritionAcknowledged:
							name.trim().toLowerCase() === draft.originalName.trim().toLowerCase(),
					}
				: draft,
		);
	}, []);

	const acknowledgeNutrition = useCallback(() => {
		editorDirtyRef.current = true;
		setEditDraft((draft) =>
			draft ? { ...draft, nutritionAcknowledged: true } : draft,
		);
	}, []);

	const openEditor = useCallback((component: EditableComponent, index: number) => {
		setEditingIndex(index);
		setEditingId(component.food.id);
		setEditDraft(component);
		editorDirtyRef.current = false;
		redoneInEditorRef.current = false;
		preRedoDraftRef.current = null;
		setNutritionExpanded(false);
		setEditorOpen(true);
		AccessibilityInfo.announceForAccessibility(
			`Editing ${component.food.name.trim() || "unnamed food"}`,
		);
	}, []);

	const updateUnitMode = useCallback((mode: PortionMode) => {
		editorDirtyRef.current = true;
		setEditDraft((draft) =>
			draft
				? {
						...draft,
						selection: setPortionMode(
							draft.selection,
							mode,
							selectedServing(draft.food, draft.selection),
						),
					}
				: draft,
		);
	}, []);

	const updateAmount = useCallback((option: FoodAmountOption) => {
		editorDirtyRef.current = true;
		setEditDraft((draft) =>
			draft
				? {
						...draft,
						selection: selectFoodAmount(draft.selection, option),
						portionValid: true,
					}
				: draft,
		);
	}, []);

	const updatePortionValidity = useCallback((valid: boolean) => {
		setEditDraft((draft) => {
			if (!draft || draft.portionValid === valid) return draft;
			return { ...draft, portionValid: valid };
		});
	}, []);

	const updatePer100g = useCallback(
		(field: keyof EditableComponent["per100g"], value: number) => {
			editorDirtyRef.current = true;
			const rounded =
				field === "calories" ? Math.round(value) : Math.round(value * 10) / 10;
			setEditDraft((draft) =>
				draft ? { ...draft, per100g: { ...draft.per100g, [field]: rounded } } : draft,
			);
		},
		[],
	);

	const removeComponent = useCallback(
		(idx: number) => {
			const component = components[idx];
			if (!component) return;
			dirtyRef.current = true;
			showUndo({ kind: "remove", comp: component, idx });
			setComponents((previous) =>
				previous.filter((_, currentIndex) => currentIndex !== idx),
			);
			// Removing is only reachable from the focused editor; run the editor exit
			// animation so the undo affordance in the list footer is revealed smoothly.
			setEditorOpen(false);
		},
		[components, showUndo],
	);

	const undoLastAction = useCallback(() => {
		if (!undoAction) return;
		undoGenerationRef.current += 1;
		if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
		undoTimerRef.current = null;
		setUndoAction(null);
		if (undoAction.kind === "remove") {
			setComponents((previous) => {
				const next = [...previous];
				next.splice(Math.min(undoAction.idx, next.length), 0, undoAction.comp);
				return next;
			});
		} else if (undoAction.kind === "meal-reestimate") {
			setMealName(undoAction.mealName);
			setComponents(undoAction.components);
		} else {
			setComponents((previous) =>
				previous.map((component) =>
					component.food.id === undoAction.replacementId
						? undoAction.previous
						: component,
				),
			);
			setEditingId((current) =>
				current === undoAction.replacementId
					? undoAction.previous.food.id
					: current,
			);
		}
	}, [undoAction]);

	const handleAddFoods = useCallback((foods: FoodResult[]) => {
		dirtyRef.current = true;
		setComponents((prev) => [...prev, ...foods.map(toEditable)]);
	}, []);

	const handlePhotoChange = useCallback((nextUri: string | null) => {
		setSelectedPhotoUri((currentUri) => {
			if (currentUri === nextUri) return currentUri;
			dirtyRef.current = true;
			return nextUri;
		});
	}, []);

	const handleMealChange = useCallback((nextMeal: MealType) => {
		dirtyRef.current = true;
		setMeal(nextMeal);
	}, []);

	const handleLogMeal = useCallback(async () => {
		if (components.length === 0) return;
		if (components.some((component) => !component.portionValid)) {
			setLogError("Enter a valid portion for every food.");
			return;
		}
		if (
			components.some(
				(component) =>
					componentNameChanged(component) && !component.nutritionAcknowledged,
			)
		) {
			setLogError("Review nutrition for renamed foods.");
			return;
		}
		const name = mealName.trim();
		if (!name) {
			setLogError("Name this meal before logging.");
			return;
		}
		if (components.some((component) => !component.food.name.trim())) {
			setLogError("Name every food before logging.");
			return;
		}
		setLogError(null);
		setLogging(true);
		try {
			const saved = await saveMealWithComponents({
				editMealId,
				name,
				log_date: effectiveLogDate,
				meal_type: meal,
				photo_uri: selectedPhotoUri,
				components: components.map((comp) => {
					const grams = comp.selection.grams;
					const serving = selectedServing(comp.food, comp.selection);
					const ratio = grams / 100;
					const cal = Math.round(comp.per100g.calories * ratio);
					const pro = Math.round(comp.per100g.protein * ratio * 10) / 10;
					const carb = Math.round(comp.per100g.carbs * ratio * 10) / 10;
					const fat = Math.round(comp.per100g.fat * ratio * 10) / 10;
					return {
						log_date: effectiveLogDate,
						name: comp.food.name.trim(),
						source: (comp.food.source as "describe" | "manual") || "manual",
						source_food_id: comp.food.sourceFoodId || undefined,
						meal,
						brand: comp.food.brand,
						data_type: comp.food.dataType,
						preparation: comp.food.preparation,
						grams_logged: grams,
						serving_size_g: serving?.grams ?? null,
						serving_label: serving?.label ?? null,
						calories_per_100g: comp.per100g.calories,
						protein_g_per_100g: comp.per100g.protein,
						carbs_g_per_100g: comp.per100g.carbs,
						fat_g_per_100g: comp.per100g.fat,
						calories: cal,
						protein_g: pro,
						carbs_g: carb,
						fat_g: fat,
					};
				}),
			});
			loggedRef.current = true;
			onLogComplete({
				mealId: saved.mealId,
				logIds: saved.logIds,
				meal,
				name,
				calories: totalMacros.calories,
				wasUpdate: !!editMealId,
				logDate: effectiveLogDate,
			});
		} catch (e) {
			console.error("[MealReview] save failed", e);
			setLogError(
				editMealId
					? "Couldn't update this meal. Your changes are still here."
					: "Couldn't save this meal. Try again.",
			);
		} finally {
			setLogging(false);
		}
	}, [
		components,
		mealName,
		meal,
		onLogComplete,
		editMealId,
		effectiveLogDate,
		selectedPhotoUri,
		totalMacros.calories,
	]);

	const handleClarify = useCallback(async () => {
		const name = mealName.trim();
		if (!name || clarifying) return;
		setClarifyError(null);
		// Awaited rather than sampled: on a cold start the plan is still resolving, and
		// answering "unavailable" from an unfinished lookup denies a re-estimate the user has.
		const accessDecision = await ensurePaidAccess();
		if (accessDecision === "free") {
			navigation.navigate("Paywall");
			return;
		}
		if (accessDecision === "unavailable") {
			setClarifyError(PAID_ACCESS_UNAVAILABLE_MESSAGE);
			return;
		}
		if (!await requestConsent()) return;
		setClarifying(true);
		try {
			const clarification = await onClarify({
				name,
				originalDescription: result?.originalDescription,
				components: toEstimateContext(components),
			});
			if (clarification.consentDeclined) return;
			const newResult = clarification.result;
			if (!newResult || newResult.components.length === 0) {
				setClarifyError("Couldn't redo it. Try a different name.");
				setClarifying(false);
				return;
			}
			originalMealNameRef.current = name;
			dirtyRef.current = true;
			showUndo({ kind: "meal-reestimate", components, mealName });
			setComponents(newResult.components.map(toEditable));
			setEditingId(null);
			setNutritionExpanded(false);
		} catch {
			setClarifyError("Redo failed. Check your connection.");
		} finally {
			setClarifying(false);
		}
	}, [
		mealName,
		clarifying,
		ensurePaidAccess,
		navigation,
		onClarify,
		requestConsent,
		result?.originalDescription,
		components,
		showUndo,
	]);

	const handleClarifyComponent = useCallback(
		async (component: EditableComponent) => {
			const name = component.food.name.trim();
			if (!name || clarifyingComponentId) return;
			setComponentClarifyError(null);
			const accessDecision = await ensurePaidAccess();
			if (accessDecision === "free") {
				navigation.navigate("Paywall");
				return;
			}
			if (accessDecision === "unavailable") {
				setComponentClarifyError({
					id: component.food.id,
					message: PAID_ACCESS_UNAVAILABLE_MESSAGE,
				});
				return;
			}
			if (!await requestConsent()) return;
			setClarifyingComponentId(component.food.id);
			try {
				const clarification = await onClarifyComponent({
					name,
					mealName: mealName.trim(),
					originalDescription: result?.originalDescription,
					components: toEstimateContext(components),
				});
				if (clarification.consentDeclined) return;
				const clarified = clarification.result;
				if (!clarified) {
					setComponentClarifyError({
						id: component.food.id,
						message: "Couldn't redo it. Try a more specific name.",
					});
					return;
				}
				// Redo replaces the editor buffer, not the meal: the swap joins the meal (and
				// the undo stack) only when the editor is saved.
				preRedoDraftRef.current = component;
				redoneInEditorRef.current = true;
				setEditDraft(toEditable(clarified));
				setNutritionExpanded(false);
			} catch {
				setComponentClarifyError({
					id: component.food.id,
					message: "Redo failed. Check your connection.",
				});
			} finally {
				setClarifyingComponentId(null);
			}
		},
		[
			clarifyingComponentId,
			ensurePaidAccess,
			navigation,
			onClarifyComponent,
			requestConsent,
			mealName,
			result?.originalDescription,
			components,
			showUndo,
		],
	);

	const clearEditorDrafts = useCallback(() => {
		setEditingId(null);
		setEditDraft(null);
		setEditingIndex(-1);
		editorDirtyRef.current = false;
		redoneInEditorRef.current = false;
		preRedoDraftRef.current = null;
	}, []);

	const requestCloseEditor = useCallback(() => {
		if (!editorOpen) return;
		if (!editorDirtyRef.current) {
			setEditorOpen(false);
			return;
		}
		Alert.alert("Discard changes?", "Your edits will be lost.", [
			{ text: "Keep Editing" },
			{ text: "Discard", style: "destructive", onPress: () => setEditorOpen(false) },
		]);
	}, [editorOpen]);

	const saveEditor = useCallback(() => {
		if (!editDraft || renderedEditorView !== "editor") return;
		setComponents((previous) =>
			previous.map((component, index) =>
				index === editingIndex ? editDraft : component,
			),
		);
		dirtyRef.current = true;
		setLogError(null);
		editorDirtyRef.current = false;
		if (redoneInEditorRef.current && preRedoDraftRef.current) {
			showUndo({
				kind: "component-reestimate",
				previous: preRedoDraftRef.current,
				replacementId: editDraft.food.id,
			});
			redoneInEditorRef.current = false;
			preRedoDraftRef.current = null;
		}
		AccessibilityInfo.announceForAccessibility("Food changes saved");
		setEditorOpen(false);
	}, [editDraft, editingIndex, renderedEditorView, showUndo]);

	// Same choreography as FoodSheetContent's state transitions: exit slide/fade out
	// (90ms, emphasizedAccelerate), swap, enter from the opposite side (150ms,
	// emphasizedDecelerate). Reduced motion jumps straight to the committed view.
	const editorView = editorOpen ? "editor" : "list";

	const commitRenderedEditorView = useCallback(
		(view: "list" | "editor", requestId: number) => {
			if (requestId !== editorTransitionRequestRef.current) return;
			enteringEditorViewRef.current = true;
			setRenderedEditorView(view);
			if (view === "list") {
				clearEditorDrafts();
				AccessibilityInfo.announceForAccessibility("Back to meal review");
			}
		},
		[clearEditorDrafts],
	);

	useEffect(() => {
		const requestId = ++editorTransitionRequestRef.current;
		if (editorView === renderedEditorView) {
			editorOffset.value = withTiming(0, {
				duration: reducedMotion ? 0 : 150,
				easing: EASING.emphasizedDecelerate,
			});
			editorOpacity.value = withTiming(1, { duration: reducedMotion ? 0 : 150 });
			return;
		}
		if (reducedMotion) {
			enteringEditorViewRef.current = false;
			editorOffset.value = 0;
			editorOpacity.value = 1;
			setRenderedEditorView(editorView);
			if (editorView === "list") clearEditorDrafts();
			return;
		}
		editorOffset.value = withTiming(-20, {
			duration: reducedMotion ? 0 : 90,
			easing: EASING.emphasizedAccelerate,
		});
		editorOpacity.value = withTiming(
			0,
			{ duration: reducedMotion ? 0 : 90 },
			(finished) => {
				if (finished) runOnJS(commitRenderedEditorView)(editorView, requestId);
			},
		);
	}, [
		editorView,
		renderedEditorView,
		reducedMotion,
		commitRenderedEditorView,
		clearEditorDrafts,
		editorOffset,
		editorOpacity,
	]);

	useLayoutEffect(() => {
		if (!enteringEditorViewRef.current || reducedMotion) return;
		enteringEditorViewRef.current = false;
		editorOffset.value = 20;
		editorOpacity.value = 0;
		editorOffset.value = withTiming(0, {
			duration: reducedMotion ? 0 : 150,
			easing: EASING.emphasizedDecelerate,
		});
		editorOpacity.value = withTiming(1, { duration: reducedMotion ? 0 : 150 });
	}, [reducedMotion, renderedEditorView, editorOffset, editorOpacity]);

	const editorTransitionStyle = useAnimatedStyle(() => ({
		opacity: editorOpacity.value,
		transform: [{ translateX: editorOffset.value }],
	}));

	// While the editor is open, hardware Back goes through the same discard-aware close
	// as the editor's back button instead of popping the sheet. Registered only when
	// open, so it wins over the sheet's own handler (BackHandler invokes the
	// most-recently-added listener first).
	useEffect(() => {
		if (!editorOpen) return;
		const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
			requestCloseEditor();
			return true;
		});
		return () => subscription.remove();
	}, [editorOpen, requestCloseEditor]);

	// The unsaved editor buffer counts as unsaved sheet work: pan-down and backdrop
	// dismissal must warn before dropping it.
	useEffect(() => {
		if (!editorOpen) return;
		const unregister = discardGuard.register(
			() => editorDirtyRef.current && !loggedRef.current,
			() => {
				editorDirtyRef.current = false;
			},
		);
		return unregister;
	}, [discardGuard, editorOpen]);

	const railStatus = summarizeReviewStatus(components);
	const firstOffendingIdx = components.findIndex((component) => {
		const status = componentReviewStatus(component);
		return status?.isError === true;
	});

	if (renderedEditorView === "editor" && editDraft && editingIndex >= 0) {
		return (
			<Animated.View style={editorTransitionStyle} className="flex-1">
				<FoodEditorView
					component={editDraft}
					logging={logging}
					reducedMotion={reducedMotion}
					insets={insets}
					nutritionExpanded={nutritionExpanded}
					onToggleNutrition={() => setNutritionExpanded((current) => !current)}
					clarifyingComponentId={clarifyingComponentId}
					componentClarifyError={componentClarifyError}
					onClose={requestCloseEditor}
					onSave={saveEditor}
					onNameChange={updateName}
					onAmountChange={updateAmount}
					onModeChange={updateUnitMode}
					onServingsSet={updateServingsFromText}
					onGramsSet={updateGrams}
					onValidityChange={updatePortionValidity}
					onPer100gChange={updatePer100g}
					onAcknowledgeNutrition={acknowledgeNutrition}
					onRedo={() => void handleClarifyComponent(editDraft)}
					onRemove={() => removeComponent(editingIndex)}
				/>
			</Animated.View>
		);
	}

	return (
		<Animated.View style={editorTransitionStyle} className="flex-1">
			<View className="px-5 pt-2 pb-3 gap-2">
				<View className="h-12 flex-row items-center">
					<SheetBackButton onPress={onGoBack} />
					<Text accessibilityRole="header" className="text-m3-on-surface text-base font-bold">
						Review meal
					</Text>
				</View>
				<BottomSheetTextInput
					value={mealName}
					onChangeText={(text) => {
						setMealName(text);
						setClarifyError(null);
						setLogError(null);
						dirtyRef.current = true;
					}}
					editable={!logging}
					accessibilityLabel="Meal name"
					accessibilityHint={
						!mealName.trim() ? "Required before logging" : undefined
					}
					className={`min-h-[48px] text-m3-on-surface font-semibold text-base bg-m3-surface-container-high rounded-xl px-4 py-3 border ${mealName.trim() ? "border-m3-outline-variant/50" : "border-m3-error"}`}
				/>
				{!mealName.trim() ? (
					<Text
						className="text-m3-error text-xs px-1"
						accessibilityLiveRegion="polite"
					>
						Meal name is required.
					</Text>
				) : null}
				{mealName.trim().length > 0 &&
				mealName.trim() !== originalMealNameRef.current ? (
					<View className="min-h-[48px] flex-row items-center gap-3 px-1">
						<Text className="flex-1 text-m3-on-surface-variant text-xs">
							Nutrition stays unchanged until you redo it.
						</Text>
						<Pressable
							onPress={handleClarify}
							disabled={clarifying || logging}
							accessibilityRole="button"
							accessibilityLabel="Redo the meal estimate with AI"
							accessibilityHint="Replaces the meal estimate. Undo restores the previous values."
							className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high px-4 active:opacity-60 disabled:opacity-50"
						>
							{clarifying ? (
								<Animated.View
									entering={reducedMotion ? undefined : FadeIn.duration(150)}
								>
									<ActivityIndicator size="small" color={M3.onSurfaceVariant} />
								</Animated.View>
							) : (
								<Animated.View
									entering={reducedMotion ? undefined : FadeIn.duration(150)}
								>
									<MaterialIcons
										name="auto-fix-high"
										size={16}
										color={M3.onSurface}
									/>
								</Animated.View>
							)}
							<Text className="text-m3-on-surface text-xs font-semibold">
								Redo
							</Text>
						</Pressable>
					</View>
				) : null}
				{clarifyError ? (
					<Text
						className="text-m3-error text-xs px-1"
						accessibilityLiveRegion="assertive"
					>
						{clarifyError}
					</Text>
				) : null}
			</View>

			<BottomSheetScrollView
				className="flex-1"
				contentContainerClassName="px-5 pb-5"
				keyboardShouldPersistTaps="handled"
			>
				<View className="gap-4" pointerEvents={logging ? "none" : "auto"}>
					<MealPhotoEditor
						value={selectedPhotoUri}
						onChange={handlePhotoChange}
						disabled={logging}
						layout="band"
					/>

					<MacroSummaryCard
						variant="rail"
						calories={totalMacros.calories}
						protein={totalMacros.protein}
						carbs={totalMacros.carbs}
						fat={totalMacros.fat}
						status={railStatus}
					/>

					<View className="gap-2">
						<Text accessibilityRole="header" className="text-m3-on-surface text-base font-semibold">
							Foods
						</Text>
						{components.length > 0 ? (
							<View className="overflow-hidden rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40">
								{components.map((comp, idx) => {
									const serving = selectedServing(comp.food, comp.selection);
									const ratio = comp.selection.grams / 100;
									const cal = Math.round(comp.per100g.calories * ratio);
									const portionSummary = formatCollapsedPortion(comp, serving);
									const componentContext = [
										comp.food.brand?.trim(),
										comp.food.preparation?.trim(),
									]
										.filter(Boolean)
										.join(" · ");
									const metadata = [portionSummary, componentContext]
										.filter(Boolean)
										.join(" · ");
									const status = componentReviewStatus(comp);
									return (
										<Pressable
											key={comp.food.id}
											onPress={() => openEditor(comp, idx)}
											disabled={logging}
											accessibilityRole="button"
											accessibilityLabel={`${comp.food.name.trim() || "Unnamed food"}, ${portionSummary}, ${cal} calories`}
											accessibilityHint="Opens the food editor"
											className={`${idx > 0 ? "border-t border-m3-outline-variant/70" : ""} min-h-[72px] flex-row items-center gap-3 px-4 py-3 active:bg-m3-surface-container-high active:opacity-70`}
										>
											<View className="flex-1 min-w-0">
												<Text
													numberOfLines={2}
													className={`text-base font-medium ${comp.food.name.trim() ? "text-m3-on-surface" : "text-m3-error"}`}
												>
													{comp.food.name.trim() || "Unnamed food"}
												</Text>
												{metadata ? (
													<Text
														numberOfLines={2}
														className="mt-1 text-m3-on-surface-variant text-xs"
													>
														{metadata}
													</Text>
												) : null}
												{status ? (
													<View className="mt-1.5 flex-row items-center gap-1.5">
														<MaterialIcons
															name={status.isError ? "error-outline" : "info-outline"}
															size={14}
															color={status.isError ? M3.error : M3.onSecondaryContainer}
														/>
														<Text
															className={`text-compact font-semibold ${status.isError ? "text-m3-error" : "text-m3-on-secondary-container"}`}
														>
															{status.label}
														</Text>
													</View>
												) : null}
											</View>
											<Text className="text-m3-on-surface text-sm font-semibold tabular-nums">
												{cal} kcal
											</Text>
											<MaterialIcons name="chevron-right" size={20} color={M3.onSurfaceVariant} />
										</Pressable>
									);
								})}
							</View>
						) : (
							<Text
								className="text-m3-on-surface-variant text-sm text-center py-4"
								accessibilityLiveRegion="polite"
							>
								This meal has no foods. Add a food before logging.
							</Text>
						)}
						<AddComponentSection onAdd={handleAddFoods} />
					</View>
				</View>
			</BottomSheetScrollView>

			<View
				className="px-5 pt-2 gap-2 border-t border-m3-outline-variant/30"
				style={{ paddingBottom: insets.bottom + 8 }}
			>
				{undoAction ? (
					<Animated.View
						entering={reducedMotion ? undefined : FadeInUp.duration(200)}
						exiting={reducedMotion ? undefined : FadeOutDown.duration(150)}
						className="bg-m3-surface-container-highest rounded-2xl px-4 py-3 flex-row items-center border border-m3-outline-variant/30"
					>
						<View className="flex-row items-center flex-1 gap-2">
							<MaterialIcons
								name="undo"
								size={16}
								color={M3.onSurfaceVariant}
							/>
							<Text
								className="flex-1 text-m3-on-surface text-sm font-medium"
								numberOfLines={1}
								accessibilityLiveRegion="polite"
							>
								{undoAction.kind === "remove"
									? `${undoAction.comp.food.name.trim() || "Unnamed food"} removed. Undo available.`
									: undoAction.kind === "meal-reestimate"
										? "Meal redone. Undo available."
										: "Food redone. Undo available."}
							</Text>
						</View>
						<Pressable
							onPress={undoLastAction}
							accessibilityRole="button"
							accessibilityLabel="Undo last change"
							className="min-w-[64px] min-h-[48px] px-3 bg-m3-surface-container rounded-full items-center justify-center active:opacity-60"
						>
							<Text className="text-m3-on-surface font-bold text-xs">
								Undo
							</Text>
						</Pressable>
					</Animated.View>
				) : null}
				<View className="flex-row items-center gap-2">
					<Pressable
						onPress={() => setDateSelectorVisible(true)}
						disabled={logging}
						accessibilityRole="button"
						accessibilityLabel={`Log date, ${formatLogDateLabel(effectiveLogDate)}`}
						accessibilityState={{ disabled: logging }}
						className="min-w-[88px] min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high px-3 border border-m3-outline-variant/30 active:opacity-70 disabled:opacity-50"
					>
						<MaterialIcons
							name="event"
							size={17}
							color={M3.onSurfaceVariant}
						/>
						<Text
							numberOfLines={1}
							className="text-m3-on-surface text-xs font-semibold"
						>
							{compactLogDateLabel}
						</Text>
					</Pressable>
					<View className="flex-1 min-w-0">
						<MealSelector
							value={meal}
							compact
							disabled={logging}
							onChange={handleMealChange}
						/>
					</View>
				</View>
				{logError ? (
					<Text
						className="text-m3-error text-xs font-medium"
						accessibilityLiveRegion="assertive"
					>
						{logError}
					</Text>
				) : blockedReason ? (
					mealName.trim() && firstOffendingIdx >= 0 ? (
						<Pressable
							onPress={() => openEditor(components[firstOffendingIdx], firstOffendingIdx)}
							disabled={logging}
							accessibilityRole="button"
							accessibilityLabel={`${blockedReason} Opens the food that needs attention.`}
							className="min-h-[44px] flex-row items-center gap-1.5 active:opacity-60"
						>
							<Text
								className="flex-1 text-m3-error text-xs font-medium"
								accessibilityLiveRegion="polite"
							>
								{blockedReason}
							</Text>
							<MaterialIcons name="chevron-right" size={16} color={M3.error} />
						</Pressable>
					) : (
						<Text
							className="text-m3-error text-xs font-medium"
							accessibilityLiveRegion="polite"
						>
							{blockedReason}
						</Text>
					)
				) : null}
				<PrimaryButton
					title={editMealId ? "Update meal" : "Log meal"}
					icon="check"
					iconPosition="left"
					onPress={handleLogMeal}
					loading={logging}
					disabled={loggingBlocked}
					accessibilityHint={
						loggingBlocked ? blockedReason ?? undefined : undefined
					}
				/>
			</View>
			<DateSelector
				visible={dateSelectorVisible}
				value={parseLocalISO(effectiveLogDate)}
				minimumDate={new Date(1900, 0, 1)}
				showTodayAction
				onCancel={() => setDateSelectorVisible(false)}
				onConfirm={(date) => {
					setDateSelectorVisible(false);
					const nextDate = isoFromDate(date);
					logDateOverrideRef.current = true;
					if (nextDate === logDate) return;
					dirtyRef.current = true;
					setLogDate(nextDate);
				}}
			/>
		</Animated.View>
	);
}

interface FoodEditorViewProps {
	component: EditableComponent;
	logging: boolean;
	reducedMotion: boolean;
	insets: { bottom: number };
	nutritionExpanded: boolean;
	onToggleNutrition: () => void;
	clarifyingComponentId: string | null;
	componentClarifyError: { id: string; message: string } | null;
	onClose: () => void;
	onNameChange: (text: string) => void;
	onAmountChange: (option: FoodAmountOption) => void;
	onModeChange: (mode: PortionMode) => void;
	onServingsSet: (value: number) => void;
	onGramsSet: (value: number) => void;
	onValidityChange: (valid: boolean) => void;
	onPer100gChange: (
		field: keyof EditableComponent["per100g"],
		value: number,
	) => void;
	onAcknowledgeNutrition: () => void;
	onRedo: () => void;
	onRemove: () => void;
	onSave: () => void;
}

/**
 * The focused, full-height editor for a single food. Rendered as an internal view of
 * ReviewState (not a sheet state). Edits land in the caller's draft; Save applies them
 * to the meal, Back discards them (with a prompt when the draft is dirty), and both
 * run the shared state-transition choreography.
 */
function FoodEditorView({
	component,
	logging,
	reducedMotion,
	insets,
	nutritionExpanded,
	onToggleNutrition,
	clarifyingComponentId,
	componentClarifyError,
	onClose,
	onNameChange,
	onAmountChange,
	onModeChange,
	onServingsSet,
	onGramsSet,
	onValidityChange,
	onPer100gChange,
	onAcknowledgeNutrition,
	onRedo,
	onRemove,
	onSave,
}: FoodEditorViewProps) {
	const serving = selectedServing(component.food, component.selection);
	const servings = servingsForSelection(component.selection, serving);
	const amountOptions = buildFoodAmountOptions(component.food);
	const ratio = component.selection.grams / 100;
	const cal = Math.round(component.per100g.calories * ratio);
	const protein = Math.round(component.per100g.protein * ratio * 10) / 10;
	const carbs = Math.round(component.per100g.carbs * ratio * 10) / 10;
	const fat = Math.round(component.per100g.fat * ratio * 10) / 10;
	const nameValid = component.food.name.trim().length > 0;
	const nameChanged = componentNameChanged(component);
	const nutritionNeedsReview = nameChanged && !component.nutritionAcknowledged;
	const lowConfidence =
		component.food.confidence === "low" && !!component.food.confidenceReason;
	const showAttentionBand = lowConfidence || nameChanged;
	const identityMeta = [
		component.food.brand?.trim(),
		component.food.preparation?.trim(),
	]
		.filter(Boolean)
		.join(" · ");
	const perServingMul =
		component.selection.mode === "servings" && serving
			? serving.grams / 100
			: 1;
	const nutritionBasis =
		component.selection.mode === "servings" && serving
			? formatPortionLabel(serving.label, serving.grams)
			: "100 g";
	const nutritionAccessibilityBasis =
		component.selection.mode === "servings" && serving
			? `per ${formatPortionLabel(serving.label, serving.grams)}`
			: "per 100 grams";
	const redoing = clarifyingComponentId === component.food.id;

	return (
		<View className="flex-1">
			<View className="px-5 pt-2 pb-3">
				<View className="h-12 flex-row items-center">
					<SheetBackButton onPress={onClose} />
					<Text
						accessibilityRole="header"
						className="text-m3-on-surface text-base font-bold"
					>
						Edit food
					</Text>
				</View>
			</View>

			<BottomSheetScrollView
				className="flex-1"
				contentContainerClassName="px-5"
				contentContainerStyle={{ paddingBottom: 8 }}
				keyboardShouldPersistTaps="handled"
			>
				<View
					pointerEvents={logging ? "none" : "auto"}
					className="overflow-hidden rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40"
				>
					<View className="px-4 py-4 gap-2">
						<BottomSheetTextInput
							value={component.food.name}
							onChangeText={onNameChange}
							editable={!logging}
							multiline
							numberOfLines={2}
							maxLength={120}
							textAlignVertical="center"
							accessibilityLabel="Food name"
							accessibilityHint={nameValid ? undefined : "Required before logging"}
							className={`min-h-[48px] max-h-24 rounded-xl border bg-m3-surface-container-high px-3 py-3 text-m3-on-surface text-base font-medium ${nameValid ? "border-m3-outline-variant/50" : "border-m3-error"}`}
						/>
						{nameValid ? null : (
							<Text
								className="text-m3-error text-xs px-1"
								accessibilityLiveRegion="polite"
							>
								Food name is required.
							</Text>
						)}
						<View className="flex-row items-center justify-between gap-3">
							{identityMeta ? (
								<Text
									numberOfLines={2}
									className="flex-1 text-m3-on-surface-variant text-xs"
								>
									{identityMeta}
								</Text>
							) : (
								<View className="flex-1" />
							)}
							<View className="bg-m3-surface-container-high px-3 py-1 rounded-full">
								<Text className="text-m3-on-surface tabular-nums text-xs font-semibold">
									{`${Math.round(component.per100g.calories)} kcal / 100 g`}
								</Text>
							</View>
						</View>
					</View>

					{showAttentionBand ? (
						<View className="border-t border-m3-outline-variant/50 px-4 py-4">
							<View
								className={`gap-3 rounded-xl px-3 py-3 ${nutritionNeedsReview || lowConfidence ? "bg-m3-secondary-container" : "bg-m3-surface-container-high"}`}
								accessibilityLiveRegion="polite"
							>
								<View className="gap-1">
									{lowConfidence ? (
										<Text className="text-m3-on-secondary-container text-sm">
											{component.food.confidenceReason}
										</Text>
									) : null}
									{nameChanged ? (
										<Text
											className={`text-sm font-semibold ${nutritionNeedsReview ? "text-m3-on-secondary-container" : "text-m3-on-surface"}`}
										>
											Nutrition based on {component.originalName.trim()}.
										</Text>
									) : null}
								</View>
								<View className="flex-row items-center gap-2">
									<Pressable
										onPress={onRedo}
										disabled={clarifyingComponentId !== null || logging}
										accessibilityRole="button"
										accessibilityLabel={`Redo the ${component.food.name} estimate with AI`}
										accessibilityHint="Replaces this food estimate. Undo restores previous values."
										className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-highest px-4 active:opacity-60 disabled:opacity-50"
									>
										{redoing ? (
											<Animated.View
												entering={reducedMotion ? undefined : FadeIn.duration(150)}
											>
												<ActivityIndicator size="small" color={M3.onSurfaceVariant} />
											</Animated.View>
										) : (
											<Animated.View
												entering={reducedMotion ? undefined : FadeIn.duration(150)}
											>
												<MaterialIcons
													name="auto-fix-high"
													size={16}
													color={M3.onSurface}
												/>
											</Animated.View>
										)}
										<Text className="text-m3-on-surface text-xs font-semibold">
											Redo
										</Text>
									</Pressable>
									{nutritionNeedsReview ? (
										<Pressable
											onPress={onAcknowledgeNutrition}
											disabled={logging}
											accessibilityRole="button"
											accessibilityLabel={`Keep nutrition values for ${component.food.name}`}
											className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-highest px-4 active:opacity-60 disabled:opacity-50"
										>
											<Text className="text-m3-on-surface text-xs font-semibold">
												Keep values
											</Text>
										</Pressable>
									) : null}
								</View>
							</View>
							{componentClarifyError?.id === component.food.id ? (
								<Text
									className="mt-2 text-m3-error text-xs"
									accessibilityLiveRegion="assertive"
								>
									{componentClarifyError.message}
								</Text>
							) : null}
						</View>
					) : null}

					<View className="border-t border-m3-outline-variant/50 px-4 py-4 gap-3">
						<Text className="text-m3-on-surface text-sm font-semibold">
							Portion
						</Text>
						<PortionStepper
							unitMode={component.selection.mode}
							servings={servings}
							grams={component.selection.grams}
							servingSizeGrams={serving?.grams ?? null}
							servingLabel={serving?.label ?? null}
							amountOptions={amountOptions}
							selectedAmountId={component.selection.selectedAmountId}
							onAmountChange={onAmountChange}
							onModeChange={onModeChange}
							onServingsSet={onServingsSet}
							onGramsSet={onGramsSet}
							onValidityChange={onValidityChange}
						/>
						<MacroSummaryCard
							variant="row"
							calories={cal}
							protein={protein}
							carbs={carbs}
							fat={fat}
						/>
					</View>

					<View className="border-t border-m3-outline-variant/50">
						<Pressable
							onPress={onToggleNutrition}
							accessibilityRole="button"
							accessibilityLabel={`Nutrition values, ${nutritionAccessibilityBasis}`}
							accessibilityHint={
								nutritionExpanded
									? "Hides editable nutrition values"
									: "Shows editable nutrition values"
							}
							accessibilityState={{ expanded: nutritionExpanded }}
							className="min-h-[56px] flex-row items-center gap-2 px-4 active:bg-m3-surface-container-high active:opacity-70"
						>
							<Text className="flex-1 text-m3-on-surface text-sm font-semibold">
								Nutrition values
							</Text>
							<Text
								numberOfLines={1}
								className="text-m3-on-surface-variant text-xs font-semibold"
							>
								{nutritionBasis}
							</Text>
							<DisclosureChevron expanded={nutritionExpanded} />
						</Pressable>
						{nutritionExpanded ? (
							<View className="px-4 pt-1 pb-4">
								<View className="flex-row flex-wrap gap-3">
									{(["calories", "protein", "carbs", "fat"] as const).map(
										(field) => {
											const displayValue =
												perServingMul === 1
													? component.per100g[field]
													: field === "calories"
														? Math.round(component.per100g[field] * perServingMul)
														: Math.round(
																component.per100g[field] * perServingMul * 10,
															) / 10;
											const fieldLabel =
												field === "calories"
													? "Calories"
													: field === "protein"
														? "Protein"
														: field === "carbs"
															? "Carbs"
															: "Fat";
											const fieldColor =
												field === "protein"
													? "text-m3-protein"
													: field === "carbs"
														? "text-m3-carbs"
														: field === "fat"
															? "text-m3-fat"
															: "text-m3-calories";

											return (
												<View
													key={field}
													className="min-w-[132px] flex-1 gap-1.5"
												>
													<Text
														className={`text-xs font-semibold ${fieldColor}`}
													>
														{fieldLabel} · {field === "calories" ? "kcal" : "g"}
													</Text>
													<MacroTextInput
														value={displayValue}
														label={`${fieldLabel} ${nutritionAccessibilityBasis}${field === "calories" ? ", kilocalories" : ", grams"}`}
														onValueChange={(value) => {
															const per100gValue =
																perServingMul === 1
																	? value
																	: field === "calories"
																		? Math.round(value / perServingMul)
																		: Math.round((value / perServingMul) * 10) /
																			10;
															onPer100gChange(field, per100gValue);
														}}
													/>
												</View>
											);
										},
									)}
								</View>
							</View>
						) : null}
					</View>

					<View className="min-h-[56px] border-t border-m3-outline-variant/50 px-4 flex-row items-center">
						<Pressable
							onPress={onRemove}
							disabled={logging}
							accessibilityRole="button"
							accessibilityLabel={`Remove ${component.food.name.trim() || "unnamed food"}`}
							className="min-h-[48px] flex-row items-center gap-1.5 -ml-2 px-2 active:opacity-60 disabled:opacity-50"
						>
							<MaterialIcons name="delete-outline" size={16} color={M3.error} />
							<Text className="text-m3-error text-xs font-semibold">
								Remove food
							</Text>
						</Pressable>
					</View>
				</View>
			</BottomSheetScrollView>

			<View
				className="border-t border-m3-outline-variant/30 px-5 pt-3 gap-2"
				style={{ paddingBottom: insets.bottom + 8 }}
			>
				<PrimaryButton
					title="Save changes"
					icon="check"
					iconPosition="left"
					onPress={onSave}
					disabled={logging || redoing}
					accessibilityHint="Applies the changes and returns to meal review"
				/>
			</View>
		</View>
	);
}
