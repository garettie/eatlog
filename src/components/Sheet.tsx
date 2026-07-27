import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { BackHandler, Keyboard, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import Animated, {
  FadeInUp,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { M3 } from '../theme/tokens';

interface SheetProps {
  visible: boolean;
  snapPoints: (string | number)[];
  stateKey: string | number;
  canCloseRef: React.MutableRefObject<() => boolean>;
  children: React.ReactNode;
  fabScale?: SharedValue<number>;
  enableDynamicSizing?: boolean;
  enablePanDownToClose?: boolean;
  onGoBack?: () => boolean;
  onSheetClosed?: () => void;
  sheetCloseRef?: React.MutableRefObject<() => void>;
  forceClose?: boolean;
}

export default function Sheet({
  visible,
  snapPoints,
  stateKey,
  canCloseRef,
  children,
  fabScale,
  enableDynamicSizing = false,
  enablePanDownToClose = true,
  onGoBack,
  onSheetClosed,
  sheetCloseRef,
  forceClose = false,
}: SheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const lastIndexRef = useRef(0);
  const wasVisible = useRef(false);
  const prevStateKeyRef = useRef(stateKey);
  const forceCloseRef = useRef(forceClose);
  forceCloseRef.current = forceClose;

  useEffect(() => {
    if (sheetCloseRef) {
      sheetCloseRef.current = () => sheetRef.current?.close();
    }
    return () => {
      if (sheetCloseRef) {
        sheetCloseRef.current = () => {};
      }
    };
  }, [sheetCloseRef]);

  useEffect(() => {
    const openedNow = visible && !wasVisible.current;
    const stateChanged = visible && prevStateKeyRef.current !== stateKey;

    if (openedNow || stateChanged) {
      prevStateKeyRef.current = stateKey;
      sheetRef.current?.snapToIndex(0);
    }

    wasVisible.current = visible;
  }, [visible, stateKey]);

  useEffect(() => {
    if (!visible) {
      sheetRef.current?.close();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (onGoBack?.()) return true;
      handleClose();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, onGoBack]);

  const handleClose = useCallback(() => {
    if (forceCloseRef.current) {
      Keyboard.dismiss();
      sheetRef.current?.close();
      return;
    }
    const allowed = canCloseRef.current();
    if (allowed) {
      Keyboard.dismiss();
      sheetRef.current?.close();
    } else {
      sheetRef.current?.snapToIndex(lastIndexRef.current);
    }
  }, [canCloseRef]);

  const handleChange = useCallback(
    (index: number) => {
      if (index >= 0) lastIndexRef.current = index;
      if (index === -1) {
        const allowed = canCloseRef.current();
        if (allowed) {
          onSheetClosed?.();
        } else {
          sheetRef.current?.snapToIndex(lastIndexRef.current);
        }
      }
    },
    [canCloseRef, onSheetClosed],
  );

  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={M3.scrimOpacityDefault}
        pressBehavior="close"
      />
    ),
    [],
  );

  const containerStyle = useMemo(
    () => ({
      overflow: 'hidden' as const,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    }),
    [],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      animateOnMount={false}
      enableDynamicSizing={enableDynamicSizing}
      enablePanDownToClose={enablePanDownToClose}
      onChange={handleChange}
      onClose={handleClose}
      backdropComponent={backdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
      handleStyle={styles.handleArea}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      topInset={insets.top}
      bottomInset={Math.max(insets.bottom, 8)}
      containerStyle={containerStyle}
      animationConfigs={{
        duration: 300,
      }}
    >
      <Animated.View
        key={`${stateKey}-${visible}`}
        entering={enableDynamicSizing ? undefined : FadeInUp.duration(220)}
        style={styles.content}
      >
        {enableDynamicSizing ? (
          <BottomSheetView style={{ flex: 1 }}>{children}</BottomSheetView>
        ) : (
          children
        )}
      </Animated.View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  handle: {
    backgroundColor: M3.outlineVariant,
    width: 32,
    height: 4,
    borderRadius: 4,
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  background: {
    backgroundColor: M3.surfaceContainer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: M3.outlineVariant,
  },
});
