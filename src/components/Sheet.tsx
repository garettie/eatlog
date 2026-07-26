import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Dimensions, Keyboard, Modal, Platform, Pressable, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type SheetDetent = 'peek' | 'half' | 'full';

interface SheetProps {
  visible: boolean;
  detent: SheetDetent;
  onClose: () => void;
  canCloseRef: React.MutableRefObject<() => boolean>;
  stateKey: string | number;
  children: React.ReactNode;
  fabScale?: SharedValue<number>;
  scrimOpacity?: number;
}

const SHEET_RATIO = 0.9;
const SCRIM_DEFAULT = 0.55;
const SPRING_CONFIG = { damping: 30, stiffness: 260, mass: 0.9 };
const DRAG_DISMISS_VELOCITY = 1800;
const DRAG_DISMISS_FRACTION = 0.35;

type DetentTargets = Record<SheetDetent, number>;

export default function Sheet({
  visible,
  detent,
  onClose,
  canCloseRef,
  stateKey,
  children,
  fabScale,
  scrimOpacity = SCRIM_DEFAULT,
}: SheetProps) {
  const screenH = Dimensions.get('window').height;
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(false);

  const maxSheetH = Math.round(SHEET_RATIO * screenH);

  const translateY = useSharedValue(maxSheetH + 60);
  const backdrop = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const contentScale = useSharedValue(1);
  const reduceMotion = useSharedValue(0);
  const keyboardH = useSharedValue(0);

  const [contentH, setContentH] = useState(0);
  const sheetH = contentH > 0 ? Math.min(contentH, maxSheetH) : maxSheetH;
  const detentTargets: DetentTargets = {
    full: 0,
    half: Math.round(sheetH - Math.min(sheetH, 0.5 * screenH)),
    peek: Math.round(sheetH - Math.min(sheetH, 0.25 * screenH)),
  };

  const detentTargetsRef = useRef(detentTargets);
  detentTargetsRef.current = detentTargets;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const detentRef = useRef(detent);
  detentRef.current = detent;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reduceMotion.value = enabled ? 1 : 0;
    });
  }, [reduceMotion]);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      const willShow = Keyboard.addListener('keyboardWillShow', (e) => {
        keyboardH.value = withTiming(e.endCoordinates.height, {
          duration: e.duration || 250,
          easing: Easing.out(Easing.cubic),
        });
      });
      const willHide = Keyboard.addListener('keyboardWillHide', (e) => {
        keyboardH.value = withTiming(0, {
          duration: e.duration || 200,
          easing: Easing.in(Easing.cubic),
        });
      });
      return () => { willShow.remove(); willHide.remove(); };
    }
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardH.value = withTiming(e.endCoordinates.height, { duration: 1 });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardH.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const animateSnap = useCallback(
    (target: number) => {
      if (reduceMotion.value) {
        translateY.value = withTiming(target, { duration: 1 });
      } else {
        translateY.value = withSpring(target, {
          ...SPRING_CONFIG,
          reduceMotion: ReduceMotion.Never,
        });
      }
    },
    [reduceMotion, translateY],
  );

  const requestClose = useCallback(() => {
    const allowed = canCloseRef.current();
    if (!allowed) {
      animateSnap(detentTargetsRef.current[detentRef.current]);
      backdrop.value = withTiming(scrimOpacity, { duration: 200 });
      return;
    }
    onCloseRef.current();
  }, [animateSnap, scrimOpacity, backdrop, canCloseRef]);

  const finishDismissRef = useRef<() => void>(() => {});
  finishDismissRef.current = () => requestClose();

  // Render staging
  useEffect(() => {
    if (visible && !rendered) setRendered(true);
  }, [visible, rendered]);

  // Open (rendered becomes true)
  useEffect(() => {
    if (!rendered || !visible) return;
    translateY.value = screenH + 60;
    backdrop.value = 0;
    contentScale.value = reduceMotion.value ? 1 : 0.96;
    animateSnap(detentTargets[detentRef.current]);
    backdrop.value = withTiming(scrimOpacity, { duration: 280, easing: Easing.out(Easing.cubic) });
    if (fabScale) {
      if (reduceMotion.value) {
        fabScale.value = withTiming(0, { duration: 1 });
      } else {
        fabScale.value = withSequence(
          withTiming(1.12, { duration: 80, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) }),
        );
      }
    }
    if (!reduceMotion.value) contentScale.value = withSpring(1, { damping: 26, stiffness: 240 });
  }, [rendered, visible]);

  // Detent change while open
  useEffect(() => {
    if (!rendered || !visible) return;
    animateSnap(detentTargets[detent]);
  }, [detent, sheetH]);

  // Content morph: stateKey change → quick scale pop + spring back
  useEffect(() => {
    if (!rendered || !visible || reduceMotion.value) return;
    contentScale.value = 0.985;
    contentScale.value = withSpring(1, { damping: 22, stiffness: 280 });
  }, [stateKey]);

  // Close (visible becomes false while still rendered)
  useEffect(() => {
    if (visible || !rendered) return;
    const allowed = canCloseRef.current();
    if (!allowed) {
      animateSnap(detentTargets[detentRef.current]);
      return;
    }
    if (reduceMotion.value) {
      translateY.value = withTiming(screenH + 80, { duration: 1 });
      backdrop.value = withTiming(0, { duration: 1 });
    } else {
      translateY.value = withTiming(screenH + 80, { duration: 240, easing: Easing.in(Easing.cubic) });
      backdrop.value = withTiming(0, { duration: 220 });
    }
    if (fabScale) {
      fabScale.value = reduceMotion.value ? withTiming(1, { duration: 1 }) : withSpring(1, SPRING_CONFIG);
    }
  }, [visible]);

  // Unmount after close animation lands — give the timing a frame to settle
  useAnimatedReaction(
    () => translateY.value,
    (y: number) => {
      if (!visible && y > screenH) {
        runOnJS(setRendered)(false);
      }
    },
    [visible, screenH],
  );

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetY(20)
    .onBegin(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = dragStartY.value + e.translationY;
      translateY.value = Math.max(0, next);
    })
    .onEnd((e) => {
      const current = translateY.value;
      const pastDismissThreshold =
        current > DRAG_DISMISS_FRACTION * screenH || e.velocityY > DRAG_DISMISS_VELOCITY;
      if (pastDismissThreshold) {
        runOnJS(() => finishDismissRef.current())();
        return;
      }
      const targets = detentTargetsRef.current;
      const values = [targets.full, targets.half, targets.peek];
      let nearest = values[0];
      let bestDelta = Math.abs(current - nearest);
      for (let i = 1; i < values.length; i++) {
        const delta = Math.abs(current - values[i]);
        if (delta < bestDelta) {
          bestDelta = delta;
          nearest = values[i];
        }
      }
      animateSnap(nearest);
    }), [animateSnap, screenH, dragStartY, translateY]);

  useEffect(() => {
    return () => {
      cancelAnimation(translateY);
      cancelAnimation(backdrop);
    };
  }, [translateY, backdrop]);

  const sheetStyle = useAnimatedStyle(() => ({
    height: maxSheetH - keyboardH.value,
    paddingBottom: keyboardH.value > 0 ? 0 : insets.bottom,
    transform: [
      { translateY: translateY.value - keyboardH.value },
      { scale: contentScale.value },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));

  if (!rendered) return null;

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={requestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: '#000',
            },
            backdropStyle,
          ]}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss sheet"
          />
        </Animated.View>

        <Animated.View
            style={[
            {
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              overflow: 'hidden',
              backgroundColor: '#1d2024',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View
              style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Drag to dismiss"
            >
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#44474f' }} />
            </View>
          </GestureDetector>
          <View style={{ flex: 1 }} onLayout={(e) => setContentH(Math.ceil(e.nativeEvent.layout.height))}>
            {children}
          </View>
        </Animated.View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}