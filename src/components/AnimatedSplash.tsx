import React, { useEffect } from "react";
import {
	type LayoutChangeEvent,
	useWindowDimensions,
	View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, {
	Defs,
	G,
	type GProps,
	Image as SvgImage,
	Mask,
	Path,
	Rect,
} from "react-native-svg";
import Animated, {
	cancelAnimation,
	Easing,
	runOnJS,
	useAnimatedProps,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";

import { TYPE } from "../theme/tokens";

type SvgMatrix = [number, number, number, number, number, number];
type AnimatedGProps = GProps & { matrix?: SvgMatrix };

// `matrix` is supported by G's native manager and setNativeProps but omitted from GProps.
const MatrixG = G as unknown as React.ComponentClass<AnimatedGProps>;
const AnimatedG = Animated.createAnimatedComponent(MatrixG);

const LOGO = require("../../assets/splash.png");

const MARK_WIDTH = 554;
const MARK_HEIGHT = 758;
const SOURCE_SIZE = 1024;
const SOURCE_CROP_X = 235;
const SOURCE_CROP_Y = 133;
const BACKGROUND = "#151515";

// One continuous path: keep exactly one M and one closing Z to avoid diagonal fill artifacts.
const WAVE_D =
	"M -40,0 C 51,-46 129,-46 220,0 C 286.5,30 343.5,30 410,0 " +
	"C 525.5,-58 624.5,-58 740,0 C 792.5,22 837.5,22 890,0 " +
	"C 988,-40 1072,-40 1170,0 C 1243.5,34 1306.5,34 1380,0 " +
	"C 1471,-46 1549,-46 1640,0 C 1706.5,30 1763.5,30 1830,0 " +
	"C 1945.5,-58 2044.5,-58 2160,0 C 2212.5,22 2257.5,22 2310,0 " +
	"C 2408,-40 2492,-40 2590,0 C 2663.5,34 2726.5,34 2800,0 " +
	"L 2800,900 L -40,900 Z";

const TILE_WIDTH = 1420;
const SCROLL_LOOP = 12000;
const HOLD_DURATION = 900;
const WORDMARK_DURATION = 500;

type AnimatedSplashProps = {
	onFinish: () => void;
	onLayout: (event: LayoutChangeEvent) => void;
};

export default function AnimatedSplash({
	onFinish,
	onLayout,
}: AnimatedSplashProps) {
	const { width, height } = useWindowDimensions();
	const reducedMotion = useReducedMotion();
	const riseY = useSharedValue(840);
	const scrollX = useSharedValue(0);
	const wordmarkOpacity = useSharedValue(0);
	const wordmarkTranslateY = useSharedValue(8);

	useEffect(() => {
		if (reducedMotion) {
			riseY.value = withTiming(-70, { duration: 0 });
			wordmarkOpacity.value = withTiming(1, { duration: 0 }, (finished) => {
				if (finished) runOnJS(onFinish)();
			});
			wordmarkTranslateY.value = withTiming(0, { duration: 0 });
		} else {
			scrollX.value = withRepeat(
				withTiming(-TILE_WIDTH, {
					duration: SCROLL_LOOP,
					easing: Easing.linear,
				}),
				-1,
				false,
			);

			riseY.value = withSequence(
				withTiming(10, {
					duration: 3600,
					easing: Easing.bezier(0.22, 1, 0.36, 1),
				}),
				withTiming(-110, {
					duration: 720,
					easing: Easing.out(Easing.quad),
				}),
				withTiming(-80, { duration: 540 }),
				withTiming(-70, { duration: 360 }, (finished) => {
					if (!finished) return;
					wordmarkOpacity.value = withDelay(
						HOLD_DURATION,
						withTiming(
							1,
							{ duration: WORDMARK_DURATION },
							(wordmarkFinished) => {
								if (wordmarkFinished) runOnJS(onFinish)();
							},
						),
					);
					wordmarkTranslateY.value = withDelay(
						HOLD_DURATION,
						withTiming(0, { duration: WORDMARK_DURATION }),
					);
				}),
			);
		}

		return () => {
			cancelAnimation(riseY);
			cancelAnimation(scrollX);
			cancelAnimation(wordmarkOpacity);
			cancelAnimation(wordmarkTranslateY);
		};
	}, [
		onFinish,
		reducedMotion,
		riseY,
		scrollX,
		wordmarkOpacity,
		wordmarkTranslateY,
	]);

	const riseProps = useAnimatedProps<AnimatedGProps>(() => ({
		matrix: [1, 0, 0, 1, 0, riseY.value],
	}));
	const scrollProps = useAnimatedProps<AnimatedGProps>(() => ({
		matrix: [1, 0, 0, 1, scrollX.value, 0],
	}));
	const wordmarkStyle = useAnimatedStyle(() => ({
		opacity: wordmarkOpacity.value,
		transform: [{ translateY: wordmarkTranslateY.value }],
	}));

	const logoWidth = Math.min(
		width * 0.56,
		height * 0.58 * (MARK_WIDTH / MARK_HEIGHT),
		320,
	);
	const logoHeight = logoWidth * (MARK_HEIGHT / MARK_WIDTH);

	return (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			onLayout={onLayout}
			style={{
				flex: 1,
				alignItems: "center",
				justifyContent: "center",
				gap: 28,
				backgroundColor: BACKGROUND,
			}}
		>
			<StatusBar style="light" backgroundColor={BACKGROUND} />
			<Svg
				width={logoWidth}
				height={logoHeight}
				viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}
			>
				<Defs>
					<Mask
						id="waveMask"
						maskUnits="userSpaceOnUse"
						x={0}
						y={0}
						width={MARK_WIDTH}
						height={MARK_HEIGHT}
					>
						<Rect
							x={0}
							y={0}
							width={MARK_WIDTH}
							height={MARK_HEIGHT}
							fill="black"
						/>
						<AnimatedG
							transform={[1, 0, 0, 1, 0, 840]}
							animatedProps={riseProps}
						>
							<AnimatedG animatedProps={scrollProps}>
								<Path d={WAVE_D} fill="white" />
							</AnimatedG>
						</AnimatedG>
					</Mask>
				</Defs>
				<G mask="url(#waveMask)">
					<SvgImage
						href={LOGO}
						x={-SOURCE_CROP_X}
						y={-SOURCE_CROP_Y}
						width={SOURCE_SIZE}
						height={SOURCE_SIZE}
					/>
				</G>
			</Svg>

			<Animated.Text
				accessible={false}
				style={[
					{
						color: "#f2f2f2",
						fontFamily: TYPE.family.medium,
						fontSize: 22,
						fontWeight: "400",
						letterSpacing: 3,
						lineHeight: 28,
					},
					wordmarkStyle,
				]}
			>
				eatlog
			</Animated.Text>
		</View>
	);
}
