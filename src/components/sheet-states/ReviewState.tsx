import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	AccessibilityInfo,
	ActivityIndicator,
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
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
	const [nutritionExpandedIds, setNutritionExpandedIds] = useState<Set<string>>(
		() => new Set(),
	);
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
			setExpandedIds(new Set());
			setNutritionExpandedIds(new Set());
			dirtyRef.current = false;
			loggedRef.current = false;
			setUndoAction(null);
		}
	}, [result]);

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

	const updateGrams = useCallback((idx: number, grams: number) => {
		dirtyRef.current = true;
		setComponents((previous) =>
			previous.map((component, index) =>
				index === idx
					? { ...component, selection: setGramsAmount(component.selection, grams) }
					: component,
			),
		);
	}, []);


	const updateServingsFromText = useCallback((idx: number, value: number) => {
		dirtyRef.current = true;
		setComponents((previous) =>
			previous.map((component, index) =>
				index === idx
					? {
							...component,
							selection: setServingAmount(
								component.selection,
								value,
								selectedServing(component.food, component.selection),
							),
						}
					: component,
			),
		);
	}, []);

	const updateName = useCallback((idx: number, name: string) => {
		dirtyRef.current = true;
		setLogError(null);
		setComponents((prev) =>
			prev.map((c, i) =>
				i === idx
					? {
							...c,
							food: { ...c.food, name, normalizedName: name.toLowerCase() },
							nutritionAcknowledged:
								name.trim().toLowerCase() === c.originalName.trim().toLowerCase(),
						}
					: c,
			),
		);
	}, []);

	const acknowledgeNutrition = useCallback((idx: number) => {
		dirtyRef.current = true;
		setLogError(null);
		setComponents((previous) =>
			previous.map((component, index) =>
				index === idx ? { ...component, nutritionAcknowledged: true } : component,
			),
		);
	}, []);

	const toggleComponent = useCallback(
		(component: EditableComponent, isExpanded: boolean) => {
			const nextExpanded = !isExpanded;
			setExpandedIds(nextExpanded ? new Set([component.food.id]) : new Set());
			AccessibilityInfo.announceForAccessibility(
				`${component.food.name.trim() || "Unnamed food"} details ${nextExpanded ? "expanded" : "collapsed"}`,
			);
		},
		[],
	);

	const updateUnitMode = useCallback((idx: number, mode: PortionMode) => {
		dirtyRef.current = true;
		setComponents((previous) =>
			previous.map((component, index) =>
				index === idx
					? {
							...component,
							selection: setPortionMode(
								component.selection,
								mode,
								selectedServing(component.food, component.selection),
							),
						}
					: component,
			),
		);
	}, []);

	const updateAmount = useCallback((idx: number, option: FoodAmountOption) => {
		dirtyRef.current = true;
		setComponents((previous) =>
			previous.map((component, index) =>
				index === idx
					? {
							...component,
							selection: selectFoodAmount(component.selection, option),
							portionValid: true,
						}
					: component,
			),
		);
	}, []);

	const updatePortionValidity = useCallback((idx: number, valid: boolean) => {
		setComponents((previous) => {
			const component = previous[idx];
			if (!component || component.portionValid === valid) return previous;
			return previous.map((entry, index) =>
				index === idx ? { ...entry, portionValid: valid } : entry,
			);
		});
	}, []);

	const updatePer100g = useCallback(
		(idx: number, field: keyof EditableComponent["per100g"], value: number) => {
			dirtyRef.current = true;
			const rounded =
				field === "calories" ? Math.round(value) : Math.round(value * 10) / 10;
			setComponents((prev) =>
				prev.map((c, i) =>
					i === idx ? { ...c, per100g: { ...c.per100g, [field]: rounded } } : c,
				),
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
			setExpandedIds((current) => {
				const next = new Set(current);
				next.delete(component.food.id);
				return next;
			});
			setNutritionExpandedIds((current) => {
				const next = new Set(current);
				next.delete(component.food.id);
				return next;
			});
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
			setExpandedIds((current) => {
				const next = new Set(current);
				if (next.delete(undoAction.replacementId))
					next.add(undoAction.previous.food.id);
				return next;
			});
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
			setExpandedIds(new Set());
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
				dirtyRef.current = true;
				showUndo({
					kind: "component-reestimate",
					previous: component,
					replacementId: clarified.id,
				});
				setComponents((previous) =>
					previous.map((current) =>
						current.food.id === component.food.id
							? toEditable(clarified)
							: current,
					),
				);
					setExpandedIds((current) => {
						const next = new Set(current);
						if (next.delete(component.food.id)) next.add(clarified.id);
						return next;
					});
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

	return (
		<View className="flex-1">
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
					/>

					<View className="min-h-[68px] flex-row items-center rounded-2xl bg-m3-surface-container px-4 py-3 border border-m3-outline-variant/40">
						<View className="w-20">
							<Text className="text-m3-on-surface text-2xl font-bold tabular-nums">
								{totalMacros.calories}
							</Text>
							<Text className="text-m3-calories text-compact font-medium">
								kcal
							</Text>
						</View>
						<View className="h-10 w-px bg-m3-outline-variant/50" />
						<View className="flex-1 flex-row">
							{[
								{
									label: "Protein",
									value: `${totalMacros.protein}g`,
									color: "text-m3-protein",
								},
								{
									label: "Carbs",
									value: `${totalMacros.carbs}g`,
									color: "text-m3-carbs",
								},
								{
									label: "Fat",
									value: `${totalMacros.fat}g`,
									color: "text-m3-fat",
								},
							].map((macro) => (
								<View key={macro.label} className="min-w-0 flex-1 items-center">
									<Text
										numberOfLines={1}
										adjustsFontSizeToFit
										minimumFontScale={0.85}
										className="text-m3-on-surface text-sm font-bold tabular-nums"
									>
										{macro.value}
									</Text>
									<Text className={`text-compact font-medium ${macro.color}`}>
										{macro.label}
									</Text>
								</View>
							))}
						</View>
					</View>

					<View className="gap-2">
						<Text accessibilityRole="header" className="text-m3-on-surface text-base font-semibold">
							Foods
						</Text>
						{components.length > 0 ? (
							<View className="overflow-hidden rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40">
								{components.map((comp, idx) => {
									const isExpanded = expandedIds.has(comp.food.id);
									const nutritionExpanded = nutritionExpandedIds.has(comp.food.id);
									const serving = selectedServing(comp.food, comp.selection);
									const servings = servingsForSelection(comp.selection, serving);
									const amountOptions = buildFoodAmountOptions(comp.food);
									const ratio = comp.selection.grams / 100;
									const cal = Math.round(comp.per100g.calories * ratio);
									const protein =
										Math.round(comp.per100g.protein * ratio * 10) / 10;
									const carbs =
										Math.round(comp.per100g.carbs * ratio * 10) / 10;
									const fat =
										Math.round(comp.per100g.fat * ratio * 10) / 10;
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
									const nameChanged = componentNameChanged(comp);
									const nutritionNeedsReview =
										nameChanged && !comp.nutritionAcknowledged;
									const reviewStatus = componentReviewStatus(comp);
									const perServingMul =
										comp.selection.mode === "servings" && serving
											? serving.grams / 100
											: 1;
									const nutritionBasis =
										comp.selection.mode === "servings" && serving
											? formatPortionLabel(serving.label, serving.grams)
											: "100 g";
									const nutritionAccessibilityBasis =
										comp.selection.mode === "servings" && serving
											? `per ${formatPortionLabel(serving.label, serving.grams)}`
											: "per 100 grams";

									return (
										<View
											key={comp.food.id}
											className={`${idx > 0 ? "border-t border-m3-outline-variant/70" : ""} ${isExpanded ? "bg-m3-surface-container-high" : ""}`}
										>
											<View className="relative">
												{!isExpanded ? (
													<Pressable
														onPress={() => toggleComponent(comp, false)}
														accessibilityRole="button"
														accessibilityLabel={`${comp.food.name.trim() || "Unnamed food"}, ${portionSummary}, ${cal} calories`}
														accessibilityHint="Opens food details and portion controls"
														accessibilityState={{ expanded: false }}
														className="absolute inset-0 active:bg-m3-surface-container-high active:opacity-70"
													/>
												) : null}
												<View
													pointerEvents={isExpanded ? "auto" : "none"}
													className={`min-h-[72px] flex-row gap-2 px-4 py-3 ${isExpanded ? "items-start" : "items-center"}`}
												>
													{isExpanded ? (
														<View className="flex-1 min-w-0 gap-1">
															<BottomSheetTextInput
																value={comp.food.name}
																onChangeText={(text) => {
																	updateName(idx, text);
																	setComponentClarifyError((current) =>
																		current?.id === comp.food.id ? null : current,
																	);
																}}
																editable={!logging}
																multiline
																numberOfLines={2}
																maxLength={120}
																textAlignVertical="center"
																accessibilityLabel="Food name"
																accessibilityHint={
																	!comp.food.name.trim()
																		? "Required before logging"
																		: undefined
																}
																className={`min-h-[48px] max-h-24 rounded-xl border bg-m3-surface-container px-3 py-3 text-m3-on-surface text-base font-medium ${comp.food.name.trim() ? "border-m3-outline-variant/50" : "border-m3-error"}`}
															/>
															{!comp.food.name.trim() ? (
																<Text
																	className="text-m3-error text-xs px-1"
																	accessibilityLiveRegion="polite"
																>
																	Food name is required.
																</Text>
															) : null}
														</View>
													) : (
														<View className="flex-1 min-w-0">
															<Text
																numberOfLines={2}
																className={`text-base font-medium ${comp.food.name.trim() ? "text-m3-on-surface" : "text-m3-error"}`}
															>
																{comp.food.name.trim() || "Unnamed food"}
															</Text>
															<Text
																numberOfLines={2}
																className="mt-1 text-m3-on-surface-variant text-xs"
															>
																{metadata}
															</Text>
															{reviewStatus ? (
																<View className="mt-1.5 flex-row items-center gap-1.5">
																	<MaterialIcons
																		name={
																			reviewStatus.isError
																				? "error-outline"
																				: "info-outline"
																		}
																		size={14}
																		color={
																			reviewStatus.isError
																				? M3.error
																				: M3.onSecondaryContainer
																		}
																	/>
																	<Text
																		className={`text-compact font-semibold ${reviewStatus.isError ? "text-m3-error" : "text-m3-on-secondary-container"}`}
																	>
																		{reviewStatus.label}
																	</Text>
																</View>
															) : null}
														</View>
													)}
													<Pressable
														onPress={() => toggleComponent(comp, true)}
														pointerEvents={isExpanded ? "auto" : "none"}
														accessible={isExpanded}
														accessibilityRole="button"
														accessibilityLabel={`Collapse ${comp.food.name.trim() || "unnamed food"} details`}
														accessibilityState={{ expanded: isExpanded }}
														className={`${isExpanded ? "w-12" : "min-w-[72px]"} min-h-[48px] items-end justify-center active:opacity-60`}
													>
														{!isExpanded ? (
															<Text className="text-m3-on-surface text-sm font-semibold tabular-nums">
																{cal} kcal
															</Text>
														) : null}
														<DisclosureChevron expanded={isExpanded} />
													</Pressable>
												</View>
											</View>

											{isExpanded ? (
												<Animated.View
													entering={
														reducedMotion ? undefined : FadeInUp.duration(200)
													}
												>
													{(comp.food.confidence === "low" &&
														comp.food.confidenceReason) ||
													nameChanged ? (
														<View className="px-4 py-4">
															<View
																className={`gap-3 rounded-xl px-3 py-3 ${nutritionNeedsReview || comp.food.confidence === "low" ? "bg-m3-secondary-container" : "bg-m3-surface-container"}`}
																accessibilityLiveRegion="polite"
															>
																<View className="gap-1">
																	{comp.food.confidence === "low" &&
																	comp.food.confidenceReason ? (
																		<Text className="text-m3-on-secondary-container text-sm">
																			{comp.food.confidenceReason}
																		</Text>
																	) : null}
																	{nameChanged ? (
																		<Text
																			className={`text-sm font-semibold ${nutritionNeedsReview ? "text-m3-on-secondary-container" : "text-m3-on-surface"}`}
																		>
																			Nutrition based on{" "}
																			{comp.originalName.trim()}.
																		</Text>
																	) : null}
																</View>
																<Pressable
																	onPress={() =>
																		void handleClarifyComponent(comp)
																	}
																	disabled={
																		clarifyingComponentId !== null || logging
																	}
																	accessibilityRole="button"
																	accessibilityLabel={`Redo the ${comp.food.name} estimate with AI`}
																	accessibilityHint="Replaces this food estimate. Undo restores previous values."
																	className="min-h-[48px] self-start flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high px-4 active:opacity-60 disabled:opacity-50"
																>
																	{clarifyingComponentId ===
																	comp.food.id ? (
																		<Animated.View
																			entering={reducedMotion ? undefined : FadeIn.duration(150)}
																		>
																			<ActivityIndicator
																				size="small"
																				color={M3.onSurfaceVariant}
																			/>
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
														</View>
													) : null}
													{componentClarifyError?.id === comp.food.id ? (
														<Text
															className="px-4 py-3 text-m3-error text-xs"
															accessibilityLiveRegion="assertive"
														>
															{componentClarifyError.message}
														</Text>
													) : null}

													<View className="border-t border-m3-outline-variant/50 px-4 py-4 gap-3">
														<Text className="text-m3-on-surface text-sm font-semibold">
															Portion
														</Text>
														<PortionStepper
															unitMode={comp.selection.mode}
															servings={servings}
															grams={comp.selection.grams}
															servingSizeGrams={serving?.grams ?? null}
															servingLabel={serving?.label ?? null}
															amountOptions={amountOptions}
															selectedAmountId={comp.selection.selectedAmountId}
															onAmountChange={(option) =>
																updateAmount(idx, option)
															}
															onModeChange={(mode) =>
																updateUnitMode(idx, mode)
															}
															onServingsSet={(value) =>
																updateServingsFromText(idx, value)
															}
															onGramsSet={(value) =>
																updateGrams(idx, value)
															}
															onValidityChange={(valid) =>
																updatePortionValidity(idx, valid)
															}
														/>
														<View className="flex-row items-center overflow-hidden rounded-xl bg-m3-surface-container px-4 py-3">
															<View className="w-16">
																<Text
																	className="text-m3-on-surface text-lg font-bold tabular-nums"
																	numberOfLines={1}
																	adjustsFontSizeToFit
																	minimumFontScale={0.85}
																>
																	{cal}
																</Text>
																<Text className="text-m3-calories text-compact font-medium">
																	kcal
																</Text>
															</View>
															<View className="h-8 w-px bg-m3-outline-variant/50" />
															<View className="flex-1 flex-row">
																{[
																	{
																		label: "Protein",
																		value: `${protein}g`,
																		color: "text-m3-protein",
																	},
																	{
																		label: "Carbs",
																		value: `${carbs}g`,
																		color: "text-m3-carbs",
																	},
																	{
																		label: "Fat",
																		value: `${fat}g`,
																		color: "text-m3-fat",
																	},
																].map((macro) => (
																	<View
																		key={macro.label}
																		className="min-w-0 flex-1 items-center"
																	>
																		<Text
																			className="text-m3-on-surface text-sm font-bold tabular-nums"
																			numberOfLines={1}
																			adjustsFontSizeToFit
																			minimumFontScale={0.85}
																		>
																			{macro.value}
																		</Text>
																		<Text
																			className={`text-compact font-medium ${macro.color}`}
																		>
																			{macro.label}
																		</Text>
																	</View>
																))}
															</View>
														</View>
													</View>

													<View className="border-t border-m3-outline-variant/50">
														<Pressable
															onPress={() =>
																setNutritionExpandedIds((current) => {
																	const next = new Set(current);
																	if (nutritionExpanded) {
																		next.delete(comp.food.id);
																	} else {
																		next.add(comp.food.id);
																	}
																	return next;
																})
															}
															accessibilityRole="button"
															accessibilityLabel={`Nutrition values, ${nutritionAccessibilityBasis}`}
															accessibilityHint={
																nutritionExpanded
																	? "Hides editable nutrition values"
																	: "Shows editable nutrition values"
															}
															accessibilityState={{ expanded: nutritionExpanded }}
															className="min-h-[56px] flex-row items-center gap-2 px-4 active:bg-m3-surface-container active:opacity-70"
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
																	{(
																		[
																			"calories",
																			"protein",
																			"carbs",
																			"fat",
																		] as const
																	).map((field) => {
																		const displayValue =
																			perServingMul === 1
																				? comp.per100g[field]
																				: field === "calories"
																					? Math.round(
																							comp.per100g[field] *
																								perServingMul,
																						)
																					: Math.round(
																							comp.per100g[field] *
																								perServingMul *
																								10,
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
																					{fieldLabel} ·{" "}
																					{field === "calories"
																						? "kcal"
																						: "g"}
																				</Text>
																				<MacroTextInput
																					value={displayValue}
																					label={`${fieldLabel} ${nutritionAccessibilityBasis}${field === "calories" ? ", kilocalories" : ", grams"}`}
																					onValueChange={(value) => {
																						const per100gValue =
																							perServingMul === 1
																								? value
																								: field === "calories"
																									? Math.round(
																											value /
																												perServingMul,
																										)
																									: Math.round(
																											(value /
																												perServingMul) *
																												10,
																										) / 10;
																						updatePer100g(
																							idx,
																							field,
																							per100gValue,
																						);
																					}}
																				/>
																			</View>
																		);
																	})}
																</View>
															</View>
														) : null}
													</View>

													<View className="min-h-[56px] border-t border-m3-outline-variant/50 px-4 pt-2 flex-row items-center justify-between gap-3">
														<Pressable
															onPress={() => removeComponent(idx)}
															disabled={logging}
															accessibilityRole="button"
															accessibilityLabel={`Remove ${comp.food.name.trim() || "unnamed food"}`}
															className="min-h-[48px] justify-center px-2 active:opacity-60 disabled:opacity-50"
														>
															<Text className="text-m3-error text-xs font-semibold">
																Remove food
															</Text>
														</Pressable>
														{nutritionNeedsReview ? (
															<Pressable
																onPress={() => acknowledgeNutrition(idx)}
																disabled={logging}
																accessibilityRole="button"
																accessibilityLabel={`Keep nutrition values for ${comp.food.name}`}
																className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-highest px-4 active:opacity-60 disabled:opacity-50"
															>
																<Text className="text-m3-on-surface text-xs font-semibold">
																	Keep values
																</Text>
															</Pressable>
														) : null}
													</View>
												</Animated.View>
											) : null}
										</View>
									);
								})}
							</View>
						) : (
							<Text
								className="text-m3-error text-sm text-center py-4"
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
					<Text
						className="text-m3-error text-xs font-medium"
						accessibilityLiveRegion="polite"
					>
						{blockedReason}
					</Text>
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
		</View>
	);
}
