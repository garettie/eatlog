import React, { useCallback, useEffect, useRef, useState } from "react";
import {
	AccessibilityInfo,
	ActivityIndicator,
	Alert,
	BackHandler,
	Keyboard,
	Pressable,
	Text,
	View,
} from "react-native";
import {
	BottomSheetScrollView,
	BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";

import { useEntitlement } from "../../context/EntitlementContext";
import { useRemoteEstimateConsent } from "../../context/RemoteEstimateConsentContext";
import { describeMeal } from "../../services/foodScan";
import { loadFoodDetails, type FoodResult } from "../../services/foodSearch";
import { useFoodSearchController } from "../../hooks/useFoodSearchController";
import { useResponsiveLayout } from "../../theme/layout";
import { M3 } from "../../theme/tokens";
import FoodSearchResultRow from "../FoodSearchResultRow";
import PrimaryButton from "../PrimaryButton";
import SheetBackButton from "./SheetBackButton";
import { useDiscardGuardContext } from "./useDiscardGuard";
import { useViewTransition } from "./useViewTransition";

type AddPage = "search" | "describe" | "manual";

interface AddComponentViewProps {
	insets: { bottom: number };
	/** Hands the chosen or authored foods to the meal and closes this view. */
	onAdd: (foods: FoodResult[]) => void;
	onClose: () => void;
}

const pageTitle: Record<AddPage, string> = {
	search: "Add food",
	describe: "Describe food",
	manual: "Enter manually",
};

/** An empty numeric field reads as zero; anything unparseable stays NaN and blocks Add. */
function parseManualNumber(raw: string): number {
	const trimmed = raw.trim().replace(",", ".");
	if (trimmed === "") return 0;
	return Number(trimmed);
}

/** A field the user has filled with something that is not a usable number. */
function manualFieldInvalid(raw: string): boolean {
	if (raw.trim() === "") return false;
	const parsed = parseManualNumber(raw);
	return !Number.isFinite(parsed) || parsed < 0;
}

/** Search is the root; describing and manual entry are one step deeper. */
const addPageIsForward = (_from: AddPage, to: AddPage) => to !== "search";

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider px-1 pt-2">
			{children}
		</Text>
	);
}

function FieldLabel({
	children,
	tone = "text-m3-on-surface-variant",
}: {
	children: React.ReactNode;
	tone?: string;
}) {
	return <Text className={`text-xs font-semibold ${tone}`}>{children}</Text>;
}

/**
 * The full-height flow for adding one food to a meal under review. It is an internal
 * view of ReviewState rather than a sheet state, and it mirrors the food editor: a
 * header with Back, a hairline-divided card, and one primary action in the footer.
 * Search is the root page; Describe and Enter manually are pages of their own, so no
 * step ever collapses into an inline mode switcher.
 */
export default function AddComponentView({
	insets,
	onAdd,
	onClose,
}: AddComponentViewProps) {
	const [page, setPage] = useState<AddPage>("search");
	const reducedMotion = useReducedMotion();
	const { isNarrow } = useResponsiveLayout();
	const search = useFoodSearchController();
	const [selectingId, setSelectingId] = useState<string | null>(null);
	// One add closes this view, but the close animates: without this the food can be
	// handed over twice by a fast double tap.
	const addedRef = useRef(false);
	const discardGuard = useDiscardGuardContext();
	const { requestConsent } = useRemoteEstimateConsent();
	const { warmEntitlement } = useEntitlement();
	const navigation = useNavigation<any>();

	const [describeText, setDescribeText] = useState("");
	const [estimating, setEstimating] = useState(false);
	const [describeError, setDescribeError] = useState<string | null>(null);
	const estimateRequestRef = useRef(0);

	const [manualName, setManualName] = useState("");
	const [manualCalories, setManualCalories] = useState("");
	const [manualProtein, setManualProtein] = useState("");
	const [manualCarbs, setManualCarbs] = useState("");
	const [manualFat, setManualFat] = useState("");
	const [manualGrams, setManualGrams] = useState("100");

	const announcePage = useCallback((view: AddPage) => {
		AccessibilityInfo.announceForAccessibility(pageTitle[view]);
	}, []);

	const { rendered: renderedPage, style: pageTransitionStyle } =
		useViewTransition<AddPage>({
			target: page,
			reducedMotion,
			isForward: addPageIsForward,
			onCommit: announcePage,
		});

	const manualValues = [
		manualCalories,
		manualProtein,
		manualCarbs,
		manualFat,
	].map(parseManualNumber);
	const manualGramsValue = parseManualNumber(manualGrams);
	const manualNameValid = manualName.trim().length > 0;
	const manualGramsValid =
		Number.isFinite(manualGramsValue) && manualGramsValue > 0;
	const manualValuesValid = manualValues.every(
		(value) => Number.isFinite(value) && value >= 0,
	);
	const manualHasNutrition = manualValues.some((value) => value > 0);
	const manualCanAdd =
		manualNameValid && manualGramsValid && manualValuesValid && manualHasNutrition;

	const manualDirty =
		manualName.trim().length > 0 ||
		manualHasNutrition ||
		!manualValuesValid ||
		manualGrams.trim() !== "100";
	const dirty =
		(page === "describe" && describeText.trim().length > 0) ||
		(page === "manual" && manualDirty);
	const dirtyRef = useRef(dirty);
	useEffect(() => {
		dirtyRef.current = dirty;
	}, [dirty]);

	const clearDrafts = useCallback(() => {
		setDescribeText("");
		setDescribeError(null);
		setManualName("");
		setManualCalories("");
		setManualProtein("");
		setManualCarbs("");
		setManualFat("");
		setManualGrams("100");
	}, []);

	// Back pops one page at a time and asks before dropping a typed draft, so the meal
	// under review is only ever a Back away, never a lost entry.
	const requestBack = useCallback(() => {
		const goBack = () => {
			estimateRequestRef.current += 1;
			if (page === "search") {
				onClose();
				return;
			}
			clearDrafts();
			setPage("search");
		};
		if (!dirtyRef.current) {
			goBack();
			return;
		}
		Alert.alert("Discard changes?", "Your edits will be lost.", [
			{ text: "Keep Editing" },
			{ text: "Discard", style: "destructive", onPress: goBack },
		]);
	}, [clearDrafts, onClose, page]);

	useEffect(() => {
		const subscription = BackHandler.addEventListener(
			"hardwareBackPress",
			() => {
				requestBack();
				return true;
			},
		);
		return () => subscription.remove();
	}, [requestBack]);

	useEffect(() => {
		const unregister = discardGuard.register(
			() => dirtyRef.current,
			clearDrafts,
		);
		return unregister;
	}, [clearDrafts, discardGuard]);

	useEffect(() => () => {
		estimateRequestRef.current += 1;
	}, []);

	const handleSelectFood = useCallback(
		async (food: FoodResult) => {
			if (selectingId || addedRef.current) return;
			Keyboard.dismiss();
			setSelectingId(food.id);
			try {
				let selected = food;
				if (food.source === "usda" && !food.history) {
					selected = await loadFoodDetails(food).catch(() => food);
				}
				addedRef.current = true;
				onAdd([selected]);
			} finally {
				setSelectingId(null);
			}
		},
		[onAdd, selectingId],
	);

	const openDescribe = useCallback(
		(prefill?: string) => {
			warmEntitlement();
			setDescribeError(null);
			if (prefill !== undefined) setDescribeText(prefill);
			setPage("describe");
		},
		[warmEntitlement],
	);

	const handleEstimate = useCallback(async () => {
		const text = describeText.trim();
		if (!text || estimating || addedRef.current) return;
		Keyboard.dismiss();
		setDescribeError(null);
		warmEntitlement();
		if (!(await requestConsent())) return;
		const requestId = ++estimateRequestRef.current;
		setEstimating(true);
		try {
			const outcome = await describeMeal(text);
			if (requestId !== estimateRequestRef.current) return;
			if (outcome.ok && outcome.result.components.length > 0) {
				addedRef.current = true;
				onAdd(outcome.result.components);
				return;
			}
			if (!outcome.ok && outcome.kind === "paid-access-required") {
				navigation.navigate("Paywall");
				return;
			}
			setDescribeError(
				outcome.ok
					? "Couldn't estimate that. Try naming the food and the amount."
					: outcome.message,
			);
		} catch {
			if (requestId !== estimateRequestRef.current) return;
			setDescribeError("Estimate failed. Check your connection.");
		} finally {
			if (requestId === estimateRequestRef.current) setEstimating(false);
		}
	}, [
		describeText,
		estimating,
		navigation,
		onAdd,
		requestConsent,
		warmEntitlement,
	]);

	const handleManualAdd = useCallback(() => {
		if (!manualCanAdd || addedRef.current) return;
		addedRef.current = true;
		const [calories, protein, carbs, fat] = manualValues;
		const name = manualName.trim();
		onAdd([
			{
				id: `manual-${Date.now()}`,
				name,
				source: "manual",
				sourceFoodId: "",
				dataType: "manual",
				brand: null,
				preparation: null,
				normalizedName: name.toLowerCase(),
				caloriesPer100g: calories > 0 ? calories : null,
				proteinPer100g: protein > 0 ? protein : null,
				carbsPer100g: carbs > 0 ? carbs : null,
				fatPer100g: fat > 0 ? fat : null,
				portions: [],
				defaultAmount: {
					kind: "reviewed",
					grams: manualGramsValue,
					servingId: null,
				},
				alternateSourceIds: [],
			},
		]);
	}, [manualCanAdd, manualGramsValue, manualName, manualValues, onAdd]);

	const trimmedQuery = search.query.trim();
	const noResults =
		trimmedQuery.length > 0 &&
		!search.localLoading &&
		search.remoteState !== "loading" &&
		search.personalResults.length === 0 &&
		search.remoteResults.length === 0;

	const foodRow = (food: FoodResult) => (
		<FoodSearchResultRow
			key={food.id}
			food={food}
			onPress={() => void handleSelectFood(food)}
			quickLogging={selectingId === food.id}
			accessibilityHint="Adds this food to the meal"
		/>
	);

	const header = (title: string) => (
		<View className="h-12 flex-row items-center">
			<SheetBackButton onPress={requestBack} />
			<Text
				accessibilityRole="header"
				className="text-m3-on-surface text-base font-bold"
			>
				{title}
			</Text>
		</View>
	);

	if (renderedPage === "describe") {
		return (
			<Animated.View style={pageTransitionStyle} className="flex-1">
				<View className="px-5 pt-2 pb-3">{header(pageTitle.describe)}</View>
				<BottomSheetScrollView
					className="flex-1"
					contentContainerClassName="px-5 gap-3"
					contentContainerStyle={{ paddingBottom: 8 }}
					keyboardShouldPersistTaps="handled"
				>
					<BottomSheetTextInput
						value={describeText}
						onChangeText={(text) => {
							setDescribeText(text);
							setDescribeError(null);
						}}
						accessibilityLabel="Food description"
						placeholder="e.g. two fried eggs and a slice of toast"
						placeholderTextColor={M3.placeholder}
						multiline
						textAlignVertical="top"
						className="min-h-[112px] rounded-xl border border-m3-outline-variant/50 bg-m3-surface-container-high px-4 py-3 text-m3-on-surface text-base"
						autoFocus
					/>
					<Text className="text-m3-on-surface-variant text-xs px-1">
						Name the food and the amount. Every value stays editable after the
						estimate.
					</Text>
					{describeError ? (
						<View className="gap-2 px-1">
							<Text
								className="text-m3-error text-sm"
								accessibilityLiveRegion="assertive"
							>
								{describeError}
							</Text>
							<Pressable
								onPress={() => setPage("manual")}
								accessibilityRole="button"
								accessibilityLabel="Enter this food manually"
								className="min-h-[48px] self-start justify-center rounded-full bg-m3-surface-container-high px-4 active:opacity-60"
							>
								<Text className="text-m3-on-surface text-xs font-semibold">
									Enter manually
								</Text>
							</Pressable>
						</View>
					) : null}
				</BottomSheetScrollView>
				<View
					className="border-t border-m3-outline-variant/30 px-5 pt-3"
					style={{ paddingBottom: insets.bottom + 8 }}
				>
					<PrimaryButton
						title="Estimate"
						icon="auto-awesome"
						iconPosition="left"
						onPress={handleEstimate}
						loading={estimating}
						disabled={!describeText.trim()}
						accessibilityHint="Estimates nutrition and adds the food to the meal"
					/>
				</View>
			</Animated.View>
		);
	}

	if (renderedPage === "manual") {
		return (
			<Animated.View style={pageTransitionStyle} className="flex-1">
				<View className="px-5 pt-2 pb-3">{header(pageTitle.manual)}</View>
				<BottomSheetScrollView
					className="flex-1"
					contentContainerClassName="px-5"
					contentContainerStyle={{ paddingBottom: 8 }}
					keyboardShouldPersistTaps="handled"
				>
					<View className="overflow-hidden rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40">
						<View className="px-4 py-4 gap-2">
							<BottomSheetTextInput
								value={manualName}
								onChangeText={setManualName}
								accessibilityLabel="Food name"
								accessibilityHint={
									manualNameValid ? undefined : "Required before adding"
								}
								placeholder="e.g. Olive oil"
								placeholderTextColor={M3.placeholder}
								maxLength={120}
								className="min-h-[48px] rounded-xl border border-m3-outline-variant/50 bg-m3-surface-container-high px-3 py-3 text-m3-on-surface text-base font-medium"
							/>
						</View>

						<View className="border-t border-m3-outline-variant/50 px-4 py-4 gap-3">
							<View className="flex-row items-center gap-3">
								<Text className="flex-1 text-m3-on-surface text-sm font-semibold">
									Nutrition
								</Text>
								<Text className="text-m3-on-surface-variant text-xs font-semibold">
									100 g
								</Text>
							</View>
							<View className="flex-row flex-wrap gap-3">
								{(
									[
										{
											key: "calories",
											label: "Calories · kcal",
											tone: "text-m3-calories",
											value: manualCalories,
											set: setManualCalories,
											accessibilityLabel:
												"Calories per 100 grams, kilocalories",
										},
										{
											key: "protein",
											label: "Protein · g",
											tone: "text-m3-protein",
											value: manualProtein,
											set: setManualProtein,
											accessibilityLabel: "Protein per 100 grams",
										},
										{
											key: "carbs",
											label: "Carbs · g",
											tone: "text-m3-carbs",
											value: manualCarbs,
											set: setManualCarbs,
											accessibilityLabel:
												"Carbohydrates per 100 grams",
										},
										{
											key: "fat",
											label: "Fat · g",
											tone: "text-m3-fat",
											value: manualFat,
											set: setManualFat,
											accessibilityLabel: "Fat per 100 grams",
										},
									] as const
								).map((field) => (
									<View key={field.key} className="min-w-[132px] flex-1 gap-1.5">
										<FieldLabel tone={field.tone}>{field.label}</FieldLabel>
										<BottomSheetTextInput
											value={field.value}
											onChangeText={field.set}
											accessibilityLabel={field.accessibilityLabel}
											accessibilityHint="Enter zero or a positive number"
											placeholder="0"
											placeholderTextColor={M3.placeholder}
											keyboardType="numeric"
											className={`h-[52px] rounded-xl border bg-m3-surface-container-high px-3 text-center text-m3-on-surface text-base font-medium tabular-nums ${manualFieldInvalid(field.value) ? "border-m3-error" : "border-m3-outline-variant/50"}`}
										/>
									</View>
								))}
							</View>
						</View>

						<View className="border-t border-m3-outline-variant/50 px-4 py-4 gap-3">
							<Text className="text-m3-on-surface text-sm font-semibold">
								Portion
							</Text>
							<View className="flex-row items-center gap-3">
								<View className="w-[104px] shrink-0">
									<BottomSheetTextInput
										value={manualGrams}
										onChangeText={setManualGrams}
										accessibilityLabel="Portion weight in grams"
										placeholder="100"
										placeholderTextColor={M3.placeholder}
										keyboardType="numeric"
										className={`h-[52px] rounded-xl border bg-m3-surface-container-high px-3 text-center text-m3-on-surface text-base font-medium tabular-nums ${manualGramsValid || manualGrams.trim() === "" ? "border-m3-outline-variant/50" : "border-m3-error"}`}
									/>
								</View>
								<Text className="text-m3-on-surface-variant text-sm">
									grams eaten
								</Text>
							</View>
						</View>
					</View>

					{manualCanAdd || !manualDirty ? null : (
						<Text
							className="px-1 pt-3 text-m3-on-surface-variant text-xs"
							accessibilityLiveRegion="polite"
						>
							{!manualNameValid
								? "Name this food to add it."
								: !manualValuesValid
									? "Nutrition values cannot be negative."
									: !manualHasNutrition
										? "Enter at least one nutrition value."
										: "Enter a portion weight above zero."}
						</Text>
					)}
				</BottomSheetScrollView>
				<View
					className="border-t border-m3-outline-variant/30 px-5 pt-3"
					style={{ paddingBottom: insets.bottom + 8 }}
				>
					<PrimaryButton
						title="Add food"
						icon="check"
						iconPosition="left"
						onPress={handleManualAdd}
						disabled={!manualCanAdd}
						accessibilityHint="Adds this food to the meal"
					/>
				</View>
			</Animated.View>
		);
	}

	return (
		<Animated.View style={pageTransitionStyle} className="flex-1">
			<View className="px-5 pt-2 pb-3 gap-3">
				{header(pageTitle.search)}
				<View className="flex-row items-center rounded-full border border-m3-outline-variant/30 bg-m3-surface-container-high px-4 py-2">
					<MaterialIcons name="search" size={18} color={M3.onSurfaceVariant} />
					<BottomSheetTextInput
						value={search.query}
						onChangeText={search.setQuery}
						accessibilityLabel="Search foods"
						placeholder="Search foods…"
						placeholderTextColor={M3.placeholder}
						className="flex-1 ml-2 text-m3-on-surface text-sm font-medium"
						autoFocus
						autoCorrect={false}
						returnKeyType="search"
						onSubmitEditing={() => {
							search.submit();
							Keyboard.dismiss();
						}}
					/>
					{search.remoteState === "loading" ? (
						<ActivityIndicator size="small" color={M3.onSurfaceVariant} />
					) : null}
					{search.query.length > 0 ? (
						<Pressable
							onPress={() => search.setQuery("")}
							accessibilityRole="button"
							accessibilityLabel="Clear search"
							className="w-12 h-12 items-center justify-center -mr-3 -my-3"
						>
							<MaterialIcons
								name="close"
								size={18}
								color={M3.onSurfaceVariant}
							/>
						</Pressable>
					) : null}
				</View>
			</View>

			<BottomSheetScrollView
				className="flex-1"
				contentContainerClassName="px-5 gap-2"
				contentContainerStyle={{ paddingBottom: 8 }}
				keyboardShouldPersistTaps="handled"
			>
				{!trimmedQuery ? (
					<>
						<SectionTitle>Pinned and recent</SectionTitle>
						{search.personalResults.map(foodRow)}
						{search.localLoading && search.personalResults.length === 0 ? (
							<View className="py-10">
								<ActivityIndicator size="small" color={M3.onSurfaceVariant} />
							</View>
						) : null}
						{!search.localLoading && search.personalResults.length === 0 ? (
							<View className="py-10 items-center gap-2">
								<MaterialIcons
									name="restaurant"
									size={36}
									color={M3.onSurfaceVariant}
								/>
								<Text className="text-m3-on-surface-variant text-sm font-medium">
									No foods logged yet
								</Text>
								<Text className="text-m3-on-surface-variant text-xs text-center">
									Search a food, describe it, or enter it yourself.
								</Text>
							</View>
						) : null}
					</>
				) : (
					<>
						<SectionTitle>From your history</SectionTitle>
						{search.personalResults.map(foodRow)}
						{!search.localLoading && search.personalResults.length === 0 ? (
							<Text className="text-m3-on-surface-variant text-sm px-1">
								No personal matches
							</Text>
						) : null}

						<SectionTitle>Online results</SectionTitle>
						{search.remoteResults.map(foodRow)}
						{search.remoteState === "loading" ? (
							<View className="py-4">
								<ActivityIndicator size="small" color={M3.onSurfaceVariant} />
							</View>
						) : null}
						{search.remoteState === "partial" ? (
							<Text
								className="text-m3-on-surface-variant text-sm px-1"
								accessibilityLiveRegion="polite"
							>
								Some online sources are unavailable.
							</Text>
						) : null}
						{search.remoteState === "unavailable" ? (
							<View className="gap-2 px-1">
								<Text className="text-m3-on-surface-variant text-sm">
									Online foods unavailable. Your history still works.
								</Text>
								<Pressable
									onPress={search.retry}
									accessibilityRole="button"
									accessibilityLabel="Retry online search"
									className="min-h-[48px] self-start justify-center rounded-full bg-m3-surface-container-high px-5 active:opacity-60"
								>
									<Text className="text-m3-on-surface text-xs font-semibold">
										Retry online
									</Text>
								</Pressable>
							</View>
						) : null}
						{search.remoteState === "success" &&
						search.remoteResults.length === 0 ? (
							<Text className="text-m3-on-surface-variant text-sm px-1">
								No online matches
							</Text>
						) : null}
						{noResults && search.remoteState !== "unavailable" ? (
							<Pressable
								onPress={() => openDescribe(trimmedQuery)}
								accessibilityRole="button"
								accessibilityLabel={`Estimate ${trimmedQuery} with AI`}
								className="mt-1 min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high px-4 active:opacity-60"
							>
								<MaterialIcons
									name="auto-awesome"
									size={18}
									color={M3.onSurface}
								/>
								<Text
									numberOfLines={1}
									className="text-m3-on-surface text-sm font-semibold"
								>
									Estimate “{trimmedQuery}” with AI
								</Text>
							</Pressable>
						) : null}
					</>
				)}
			</BottomSheetScrollView>

			<View
				className={`border-t border-m3-outline-variant/30 px-5 pt-3 ${isNarrow ? "gap-2" : "flex-row gap-2"}`}
				style={{ paddingBottom: insets.bottom + 8 }}
			>
				<Pressable
					onPress={() => openDescribe()}
					accessibilityRole="button"
					accessibilityLabel="Describe a food"
					accessibilityHint="Estimates nutrition from a description"
					className="flex-1 min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high px-4 active:opacity-60"
				>
					<MaterialIcons name="auto-awesome" size={18} color={M3.onSurface} />
					<Text className="text-m3-on-surface text-sm font-semibold">
						Describe
					</Text>
				</Pressable>
				<Pressable
					onPress={() => setPage("manual")}
					accessibilityRole="button"
					accessibilityLabel="Enter a food manually"
					accessibilityHint="Adds a food from nutrition values you type"
					className="flex-1 min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high px-4 active:opacity-60"
				>
					<MaterialIcons name="edit-note" size={18} color={M3.onSurface} />
					<Text className="text-m3-on-surface text-sm font-semibold">
						Enter manually
					</Text>
				</Pressable>
			</View>
		</Animated.View>
	);
}
