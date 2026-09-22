import React, { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";

import { DURATION, EASING } from "../theme/motion";

function usePulseStyle(value: number) {
	const reducedMotion = useReducedMotion();
	const opacity = useSharedValue(1);
	const mounted = useRef(false);

	useEffect(() => {
		if (!mounted.current) {
			mounted.current = true;
			return;
		}
		if (reducedMotion) return;
		opacity.value = withSequence(
			withTiming(0.35, { duration: DURATION.exit, easing: EASING.standardAccelerate }),
			withTiming(1, { duration: DURATION.enter, easing: EASING.emphasizedDecelerate }),
		);
	}, [value, reducedMotion, opacity]);

	return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

const VARIANTS = {
	summary: {
		outer:
			"min-h-[68px] flex-row items-center rounded-2xl bg-m3-surface-container px-4 py-3 border border-m3-outline-variant/40",
		calorieCol: "w-20 items-center",
		calorieText: "text-m3-on-surface text-2xl font-bold tabular-nums",
		calorieFit: false,
		divider: "h-10 w-px bg-m3-outline-variant/50",
	},
	row: {
		outer:
			"flex-row items-center overflow-hidden rounded-xl bg-m3-surface-container px-4 py-3",
		calorieCol: "w-16 items-center",
		calorieText: "text-m3-on-surface text-lg font-bold tabular-nums",
		calorieFit: true,
		divider: "h-8 w-px bg-m3-outline-variant/50",
	},
	// "rail" is the review-sheet totals strip: same macro row as "summary" on a slimmer
	// line, with the card chrome on an outer wrapper.
	rail: {
		outer: "min-h-[52px] flex-row items-center",
		calorieCol: "w-20 items-center",
		calorieText: "text-m3-on-surface text-2xl font-bold tabular-nums",
		calorieFit: false,
		divider: "h-10 w-px bg-m3-outline-variant/50",
	},
} as const;

function MacroCell({
	label,
	value,
	colorClassName,
}: {
	label: string;
	value: number;
	colorClassName: string;
}) {
	// Whole grams, matching Today and Diary; the stored value keeps its precision.
	const grams = Math.round(value);
	const style = usePulseStyle(grams);
	return (
		<View className="min-w-0 flex-1 items-center">
			<Animated.Text
				style={style}
				numberOfLines={1}
				adjustsFontSizeToFit
				minimumFontScale={0.85}
				className="text-m3-on-surface text-sm font-bold tabular-nums"
			>
				{grams}g
			</Animated.Text>
			<Text className={`text-compact font-medium ${colorClassName}`}>{label}</Text>
		</View>
	);
}

interface MacroSummaryCardProps {
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	/** "summary" = totals card (larger); "row" = per-food card (compact, no border); "rail" = review totals. */
	variant?: keyof typeof VARIANTS;
}

export default function MacroSummaryCard({
	calories,
	protein,
	carbs,
	fat,
	variant = "summary",
}: MacroSummaryCardProps) {
	const v = VARIANTS[variant];
	const kcal = Math.round(calories);
	const calorieStyle = usePulseStyle(kcal);

	const strip = (
		<View className={v.outer}>
			<View className={v.calorieCol}>
				<Animated.Text
					style={calorieStyle}
					numberOfLines={v.calorieFit ? 1 : undefined}
					adjustsFontSizeToFit={v.calorieFit}
					minimumFontScale={v.calorieFit ? 0.85 : undefined}
					className={v.calorieText}
				>
					{kcal}
				</Animated.Text>
				<Text className="text-m3-calories text-compact font-medium">kcal</Text>
			</View>
			<View className={v.divider} />
			<View className="flex-1 flex-row">
				<MacroCell label="Protein" value={protein} colorClassName="text-m3-protein" />
				<MacroCell label="Carbs" value={carbs} colorClassName="text-m3-carbs" />
				<MacroCell label="Fat" value={fat} colorClassName="text-m3-fat" />
			</View>
		</View>
	);

	if (variant !== "rail") return strip;

	return (
		<View className="rounded-2xl bg-m3-surface-container px-4 py-3 border border-m3-outline-variant/40">
			{strip}
		</View>
	);
}
