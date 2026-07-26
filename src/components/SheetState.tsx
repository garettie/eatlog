import React from 'react';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface SheetStateProps {
  stateKey: string | number;
  children: React.ReactNode;
}

const ENTERING = FadeInUp.duration(220);

export default function SheetState({ stateKey, children }: SheetStateProps) {
  return (
    <Animated.View
      key={stateKey}
      entering={ENTERING}
      style={{ flex: 1 }}
    >
      {children}
    </Animated.View>
  );
}