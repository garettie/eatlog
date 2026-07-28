import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import { useReducedMotion } from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
  onAnimationFinish: () => void;
}

export const AnimatedSplashScreen: React.FC<Props> = ({ onAnimationFinish }) => {
  const reduced = useReducedMotion();
  const drawAnim = useRef(new Animated.Value(300)).current; // strokeDashoffset 300 -> 0
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    async function prepare() {
      // Hide native static splash screen once component mounts
      await SplashScreen.hideAsync();

      if (reduced) {
        drawAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }).start(onAnimationFinish);
        return;
      }

      // Run stroke path drawing animation
      Animated.sequence([
        Animated.timing(drawAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: false,
        }),
        Animated.delay(120),
        // Fade out overlay screen
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onAnimationFinish();
      });
    }

    prepare();
  }, [reduced]);

  const continuousArrowPath = "M14 74 L38 50 L54 62 L82 26 L68 26 L82 26 L82 40";

  return (
    <Animated.View
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#111318',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        opacity: fadeAnim,
      }}
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
          d={continuousArrowPath}
          stroke="#111318"
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={300}
          strokeDashoffset={drawAnim}
        />

        {/* Animated White Stroke Overlay */}
        <AnimatedPath
          d={continuousArrowPath}
          stroke="#FFFFFF"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={300}
          strokeDashoffset={drawAnim}
        />
      </Svg>
    </Animated.View>
  );
};
