import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SlideModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  height?: string;
  dragToDismiss?: boolean;
  canClose?: () => boolean;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function SlideModal({ visible, onClose, children, height, dragToDismiss = true, canClose }: SlideModalProps) {
  const [rendered, setRendered] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const panelH = useRef(SCREEN_HEIGHT);
  const animating = useRef(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const canCloseRef = useRef(canClose);
  canCloseRef.current = canClose;

  const animateOpen = useCallback(() => {
    animating.current = true;
    translateY.setValue(panelH.current);
    backdrop.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        stiffness: 200,
        damping: 28,
        mass: 1,
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => { animating.current = false; });
  }, [translateY, backdrop]);

  const animateClose = useCallback((callback?: () => void) => {
    if (animating.current) return;
    animating.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: panelH.current + 60,
        duration: 320,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setRendered(false);
      animating.current = false;
      callback?.();
    });
  }, [translateY, backdrop]);

  useEffect(() => {
    if (visible && !rendered) {
      setRendered(true);
    }
  }, [visible, rendered]);

  useEffect(() => {
    if (rendered && visible && !animating.current) {
      const t = setTimeout(animateOpen, 16);
      return () => clearTimeout(t);
    }
  }, [rendered, visible, animateOpen]);

  useEffect(() => {
    if (!visible && rendered && !animating.current) {
      animateClose();
    }
  }, [visible, rendered, animateClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => dragToDismiss && !animating.current,
      onMoveShouldSetPanResponder: (_, gs) => dragToDismiss && !animating.current && gs.dy > 4,
      onPanResponderGrant: () => { animating.current = true; },
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          translateY.setValue(gs.dy);
          const p = Math.min(gs.dy / panelH.current, 1);
          backdrop.setValue(Math.max(0, 1 - p));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 120 || gs.vy > 0.6) {
          if (canCloseRef.current && !canCloseRef.current()) return;
          animating.current = true;
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: panelH.current + 60,
              duration: 260,
              easing: Easing.bezier(0.22, 1, 0.36, 1),
              useNativeDriver: true,
            }),
            Animated.timing(backdrop, {
              toValue: 0,
              duration: 220,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setRendered(false);
            animating.current = false;
            onCloseRef.current();
          });
        } else {
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              stiffness: 200,
              damping: 28,
              mass: 1,
              useNativeDriver: true,
            }),
            Animated.timing(backdrop, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => { animating.current = false; });
        }
      },
    }),
  ).current;

  if (!rendered) return null;

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={() => { if (!canCloseRef.current || canCloseRef.current()) animateClose(() => onCloseRef.current()); }}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: '#000',
            opacity: backdrop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => { if (!canCloseRef.current || canCloseRef.current()) animateClose(() => onCloseRef.current()); }} />
        </Animated.View>

        <Animated.View
          style={[
            {
              backgroundColor: '#1d2024',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -3 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 24,
              ...(height ? { height } : {}),
            } as any,
            { transform: [{ translateY }] },
          ]}
          onLayout={(e) => { panelH.current = e.nativeEvent.layout.height; }}
        >
          {dragToDismiss && (
            <View {...panResponder.panHandlers} style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#44474f' }} />
            </View>
          )}

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: height ? 1 : undefined }}
          >
            {children}
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}
