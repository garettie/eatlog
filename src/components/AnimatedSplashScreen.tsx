import React, { useEffect } from 'react';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type GroupMatrix = [number, number, number, number, number, number];
type GroupAnimatedProps = { matrix: GroupMatrix };

type AnimatedGroupProps = React.ComponentProps<typeof G> & {
  animatedProps?: Partial<GroupAnimatedProps>;
};

const AnimatedG = Reanimated.createAnimatedComponent(G) as React.ComponentType<AnimatedGroupProps>;

// Matches the canonical 1024px icon/splash egg mask exactly at a 200px render size.
const BACKGROUND = '#151515';
const EGG = '#FFFFFF';
const INK = '#111318';
const ACCENT_RED = '#F04438';
const EGG_PATH = 'M23 54C23 37.5 36 13 50 13C64 13 77 37.5 77 54C77 69.5 72 87 50 87C28 87 23 69.5 23 54Z';
const EGG_LOWER_PATH = 'M23 54C40 57 60 57 77 54C77 69.5 72 87 50 87C28 87 23 69.5 23 54Z';
const TICK_POSITIONS = Array.from({ length: 16 }, (_, index) => index * 7 - 20);

interface Props {
  onAnimationFinish: () => void;
}

export const AnimatedSplashScreen: React.FC<Props> = ({ onAnimationFinish }) => {
  const reduced = useReducedMotion();
  const tickTravel = useSharedValue(0);
  const fadeAnim = useSharedValue(1);

  useEffect(() => {
    async function prepare() {
      // Hide native static splash screen once the animated version is ready.
      await SplashScreen.hideAsync();

      if (reduced) {
        tickTravel.value = 0;
        fadeAnim.value = 0;
        onAnimationFinish();
        return;
      }

      tickTravel.value = withRepeat(
        withTiming(8, { duration: 900, easing: Easing.linear }),
        -1,
        false,
      );
      fadeAnim.value = withDelay(900, withTiming(0, { duration: 250 }, (finished) => {
        if (finished) runOnJS(onAnimationFinish)();
      }));
    }

    void prepare();
  }, [fadeAnim, onAnimationFinish, reduced, tickTravel]);

  // Animate the native Group matrix directly; Reanimated bypasses G's transform extraction.
  const tickTrackProps = useAnimatedProps<GroupAnimatedProps>(() => ({
    matrix: [1, 0, 0, 1, tickTravel.value, 0],
  }));
  const containerStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
  }));

  return (
    <Reanimated.View
      style={[
        {
          position: 'absolute',
          inset: 0,
          backgroundColor: BACKGROUND,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
        },
        containerStyle,
      ]}
    >
      <Svg width={200} height={200} viewBox="0 0 100 100" fill="none">
        <Defs>
          <ClipPath id="egg-lower-clip">
            <Path d={EGG_LOWER_PATH} />
          </ClipPath>
        </Defs>

        {/* Egg timer body */}
        <Path
          d={EGG_PATH}
          fill={EGG}
        />

        {/* The scale ticks roll beneath the fixed red indicator. */}
        <AnimatedG animatedProps={tickTrackProps} clipPath="url(#egg-lower-clip)">
          {TICK_POSITIONS.map((x, index) => (
            <Path
              key={x}
              d={`M${x} 55V${index % 5 === 0 ? 67 : 62}`}
              stroke={INK}
              strokeWidth={index % 5 === 0 ? 2.2 : 1.5}
              strokeLinecap="round"
            />
          ))}
        </AnimatedG>

        {/* Fixed seam and indicator */}
        <Path d="M23 54C40 57 60 57 77 54" stroke={INK} strokeWidth={2.2} />
        <Path d="M47.75 50.25H52.25L50 54.25L47.75 50.25Z" fill={ACCENT_RED} />
      </Svg>
    </Reanimated.View>
  );
};
