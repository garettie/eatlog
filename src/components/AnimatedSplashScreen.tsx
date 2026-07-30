import React, { useEffect } from 'react';
import Svg, { Path } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

interface Props {
  onAnimationFinish: () => void;
}

export const AnimatedSplashScreen: React.FC<Props> = ({ onAnimationFinish }) => {
  const reduced = useReducedMotion();
  const drawAnim = useSharedValue(300);
  const fadeAnim = useSharedValue(1);

  useEffect(() => {
    async function prepare() {
      // Hide native static splash screen once component mounts
      await SplashScreen.hideAsync();

      if (reduced) {
        drawAnim.value = 0;
        fadeAnim.value = 0;
        onAnimationFinish();
        return;
      }

      drawAnim.value = withTiming(0, {
        duration: 800,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }, (finished) => {
        if (!finished) return;
        fadeAnim.value = withDelay(120, withTiming(0, { duration: 250 }, (faded) => {
          if (faded) runOnJS(onAnimationFinish)();
        }));
      });
    }

    prepare();
  }, [reduced]);

  const continuousArrowPath = "M14 74 L38 50 L54 62 L82 26 L68 26 L82 26 L82 40";
  const darkPathProps = useAnimatedProps(() => ({
    strokeDashoffset: drawAnim.value,
  }));
  const lightPathProps = useAnimatedProps(() => ({
    strokeDashoffset: drawAnim.value,
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
          backgroundColor: '#111318',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
        },
        containerStyle,
      ]}
    >
      <Svg width={140} height={140} viewBox="0 0 100 100" fill="none">
        {/* Scale Base */}
        <Path
          d="M22 28C22 22.4772 26.4772 18 32 18H68C73.5228 18 78 22.4772 78 28V72C78 77.5228 73.5228 82 68 82H32C26.4772 82 22 77.5228 22 72V28Z"
          fill="#FFFFFF"
        />
        {/* Dial Cutout */}
        <Path
          d="M36 28C36 26.8954 36.8954 26 38 26H62C63.1046 26 64 26.8954 64 28V36C64 37.1046 63.1046 38 62 38H38C36.8954 38 36 37.1046 36 36V28Z"
          fill="#111318"
        />
        <Path d="M50 35L46 29" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />

        {/* Animated Dark Gap Underlay */}
        <AnimatedPath
          animatedProps={darkPathProps}
          d={continuousArrowPath}
          stroke="#111318"
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={300}
        />

        {/* Animated White Stroke Overlay */}
        <AnimatedPath
          animatedProps={lightPathProps}
          d={continuousArrowPath}
          stroke="#FFFFFF"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={300}
        />
      </Svg>
    </Reanimated.View>
  );
};
