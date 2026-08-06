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

const AnimatedG = Reanimated.createAnimatedComponent(G);

const BACKGROUND = '#111318';
const EGG = '#FFFFFF';
const INK = '#111318';
const ACCENT_RED = '#F04438';
const EGG_LOWER_PATH = 'M18 53C28 56 39 57 50 57C61 57 72 56 82 53C82 76 69 92 50 92C31 92 18 76 18 53Z';
const TICK_POSITIONS = Array.from({ length: 16 }, (_, index) => index * 8 - 24);

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

  const tickTrackProps = useAnimatedProps(() => ({
    transform: `translate(${tickTravel.value} 0)`,
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
      <Svg width={150} height={150} viewBox="0 0 100 100" fill="none">
        <Defs>
          <ClipPath id="egg-lower-clip">
            <Path d={EGG_LOWER_PATH} />
          </ClipPath>
        </Defs>

        {/* Egg timer body */}
        <Path
          d="M18 53C18 27 31 8 50 8C69 8 82 27 82 53C82 76 69 92 50 92C31 92 18 76 18 53Z"
          fill={EGG}
        />

        {/* The scale ticks roll beneath the fixed red indicator. */}
        <AnimatedG animatedProps={tickTrackProps} clipPath="url(#egg-lower-clip)">
          {TICK_POSITIONS.map((x, index) => (
            <Path
              key={x}
              d={`M${x} 54V${index % 5 === 0 ? 68 : 63}`}
              stroke={INK}
              strokeWidth={index % 5 === 0 ? 2.5 : 1.8}
              strokeLinecap="round"
            />
          ))}
        </AnimatedG>

        {/* Fixed seam and indicator */}
        <Path d="M18 53C28 56 39 57 50 57C61 57 72 56 82 53" stroke={INK} strokeWidth={3.2} />
        <Path d="M45.5 43.5H54.5L50 51.5L45.5 43.5Z" fill={ACCENT_RED} />
      </Svg>
    </Reanimated.View>
  );
};
