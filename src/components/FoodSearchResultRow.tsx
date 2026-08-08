import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import type { FoodResult } from "../services/foodSearch";
import { M3 } from "../theme/tokens";
import { formatPortionLabel } from "../utils/portionLabels";

function provenance(food: FoodResult): string {
	if (food.history) return "Your history";
	if (food.source === "usda") return "USDA";
	if (food.source === "off") return "Open Food Facts";
	return food.source === "manual" ? "Manual" : "AI estimate";
}

interface FoodSearchResultRowProps {
	food: FoodResult;
	onPress: () => void;
	onTogglePin?: () => void;
	onQuickLog?: () => void;
	quickLogging?: boolean;
	accessibilityHint?: string;
}

export default function FoodSearchResultRow({
	food,
	onPress,
	onTogglePin,
	onQuickLog,
	quickLogging = false,
	accessibilityHint = "Opens food review",
}: FoodSearchResultRowProps) {
	const portion =
		food.portions.find((candidate) => candidate.id === food.defaultPortionId) ??
		food.portions[0];
	const calories =
		food.history?.calories ??
		(food.caloriesPer100g != null && portion
			? (food.caloriesPer100g * portion.grams) / 100
			: null);
	const context = food.history?.parentMealName
		? `Your history · ${food.history.parentMealName}`
		: [provenance(food), food.brand].filter(Boolean).join(" · ");
	const portionText = portion
		? formatPortionLabel(
				portion.label,
				portion.grams,
				/ml\b/i.test(portion.label) ? "ml" : "g",
			)
		: null;

	return (
		<View className="min-h-[72px] flex-row items-center rounded-2xl bg-m3-surface-container border border-m3-outline-variant/30 overflow-hidden">
			<Pressable
				onPress={onPress}
				disabled={quickLogging}
				accessibilityRole="button"
				accessibilityLabel={`${food.name}, ${portionText ? `${portionText}, ` : ""}${calories == null ? "nutrition unavailable" : `${Math.round(calories)} calories`}`}
				accessibilityHint={accessibilityHint}
				className="flex-1 min-h-[72px] justify-center px-4 py-3 active:opacity-60 disabled:opacity-50"
			>
				<View className="flex-row items-start justify-between gap-3">
					<View className="flex-1">
						<Text
							className="text-m3-on-surface text-sm font-semibold"
							numberOfLines={2}
						>
							{food.name}
						</Text>
						<Text
							className="text-m3-on-surface-variant text-xs mt-0.5"
							numberOfLines={1}
						>
							{context}
						</Text>
						{portionText ? (
							<Text
								className="text-m3-on-surface-variant text-compact mt-0.5"
								numberOfLines={1}
							>
								{portionText}
							</Text>
						) : null}
					</View>
					<Text className="text-m3-on-surface text-xs font-semibold tabular-nums mt-0.5">
						{calories == null ? "---" : `${Math.round(calories)} kcal`}
					</Text>
				</View>
			</Pressable>
			{food.history && onTogglePin ? (
				<Pressable
					onPress={onTogglePin}
					accessibilityRole="button"
					accessibilityLabel={
						food.isPinned ? `Unpin ${food.name}` : `Pin ${food.name}`
					}
					className="w-12 h-12 items-center justify-center active:opacity-60"
				>
					<MaterialIcons
						name={food.isPinned ? "favorite" : "favorite-border"}
						size={20}
						color={food.isPinned ? M3.error : M3.onSurfaceVariant}
					/>
				</Pressable>
			) : null}
			{food.history && onQuickLog ? (
				<Pressable
					onPress={onQuickLog}
					disabled={quickLogging}
					accessibilityRole="button"
					accessibilityLabel={`Quick log ${food.name}`}
					accessibilityHint="Logs the latest portion and nutrition"
					className="w-12 h-12 items-center justify-center active:opacity-60 disabled:opacity-50"
				>
					{quickLogging ? (
						<ActivityIndicator size="small" color={M3.onSurfaceVariant} />
					) : (
						<MaterialIcons
							name="add-circle-outline"
							size={21}
							color={M3.onSurface}
						/>
					)}
				</Pressable>
			) : null}
			{quickLogging && (!food.history || !onQuickLog) ? (
				<View className="w-12 h-12 items-center justify-center">
					<ActivityIndicator size="small" color={M3.onSurfaceVariant} />
				</View>
			) : null}
		</View>
	);
}
