import type React from "react";
import { useCallback, useEffect, useRef } from "react";
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
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";

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
const FAST_PLAYBACK_SCALE = 0.28;
const READY_FINISH_DURATION = 360;

type AnimatedSplashProps = {
	onFinish: () => void;
	onLayout: (event: LayoutChangeEvent) => void;
	ready: boolean;
};

export default function AnimatedSplash({
	onFinish,
	onLayout,
	ready,
}: AnimatedSplashProps) {
	const { width, height } = useWindowDimensions();
	const reducedMotion = useReducedMotion();
	const riseY = useSharedValue(840);
	const scrollX = useSharedValue(0);
	const readyAtMountRef = useRef(ready);
	const riseFinishedRef = useRef(false);

	const finishSplash = useCallback(() => {
		if (riseFinishedRef.current) return;
		riseFinishedRef.current = true;
		onFinish();
	}, [onFinish]);

	useEffect(() => {
		if (reducedMotion) {
			riseY.value = withTiming(-70, { duration: 0 }, (finished) => {
				if (finished) runOnJS(finishSplash)();
			});
		} else {
			const playbackScale = readyAtMountRef.current ? FAST_PLAYBACK_SCALE : 1;

			scrollX.value = withRepeat(
				withTiming(-TILE_WIDTH, {
					duration: SCROLL_LOOP * playbackScale,
					easing: Easing.linear,
				}),
				-1,
				false,
			);

			riseY.value = withSequence(
				withTiming(10, {
					duration: 3600 * playbackScale,
					easing: Easing.bezier(0.22, 1, 0.36, 1),
				}),
				withTiming(-110, {
					duration: 720 * playbackScale,
					easing: Easing.out(Easing.quad),
				}),
				withTiming(-80, { duration: 540 * playbackScale }),
				withTiming(-70, { duration: 360 * playbackScale }, (finished) => {
					if (finished) runOnJS(finishSplash)();
				}),
			);
		}

		return () => {
			cancelAnimation(riseY);
			cancelAnimation(scrollX);
		};
	}, [finishSplash, reducedMotion, riseY, scrollX]);

	useEffect(() => {
		if (
			!ready ||
			reducedMotion ||
			readyAtMountRef.current ||
			riseFinishedRef.current
		) {
			return;
		}

		cancelAnimation(riseY);
		cancelAnimation(scrollX);
		scrollX.value = withTiming(-TILE_WIDTH, {
			duration: READY_FINISH_DURATION,
			easing: Easing.linear,
		});
		riseY.value = withTiming(
			-70,
			{
				duration: READY_FINISH_DURATION,
				easing: Easing.out(Easing.quad),
			},
			(finished) => {
				if (finished) runOnJS(finishSplash)();
			},
		);
	}, [finishSplash, ready, reducedMotion, riseY, scrollX]);

	const riseProps = useAnimatedProps<AnimatedGProps>(() => ({
		matrix: [1, 0, 0, 1, 0, riseY.value],
	}));
	const scrollProps = useAnimatedProps<AnimatedGProps>(() => ({
		matrix: [1, 0, 0, 1, scrollX.value, 0],
	}));

	const logoWidth = Math.min(
		width * 0.5,
		height * 0.52 * (MARK_WIDTH / MARK_HEIGHT),
		280,
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
		</View>
	);
}
