import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Modal, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';

import { M3 } from '../theme/tokens';
import type { MealSharePayload } from '../utils/mealSharing';
import MealShareComposer from './MealShareComposer';

interface MealPhotoViewerProps {
  payload: MealSharePayload | null;
  initialMode: 'photo' | 'share';
  onClose: () => void;
}

export default function MealPhotoViewer({
  payload,
  initialMode,
  onClose,
}: MealPhotoViewerProps) {
  const reducedMotion = useReducedMotion();
  const shareButtonRef = useRef<View>(null);
  const restoreShareFocusRef = useRef(false);
  const [mode, setMode] = useState<'photo' | 'share'>(initialMode);
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const [composerBusy, setComposerBusy] = useState(false);

  useEffect(() => {
    restoreShareFocusRef.current = false;
    setMode(initialMode);
    setPhotoUnavailable(false);
    setComposerBusy(false);
  }, [payload?.mealId, payload?.photoUri, initialMode]);

  useEffect(() => {
    if (mode !== 'photo' || !restoreShareFocusRef.current) return;
    restoreShareFocusRef.current = false;
    const frame = requestAnimationFrame(() => {
      if (shareButtonRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(shareButtonRef.current, 'focus');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const handleRequestClose = useCallback(() => {
    if (composerBusy) return;
    if (mode === 'share' && initialMode === 'photo') {
      restoreShareFocusRef.current = true;
      setMode('photo');
      return;
    }
    onClose();
  }, [composerBusy, initialMode, mode, onClose]);

  return (
    <Modal
      visible={payload != null}
      animationType={reducedMotion ? 'none' : 'fade'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleRequestClose}
    >
      {payload && mode === 'share' ? (
        <SafeAreaView className="flex-1 bg-m3-surface" edges={['top', 'left', 'right']}>
          <MealShareComposer
            key={`${payload.mealId}-${payload.photoUri}-${initialMode}`}
            payload={payload}
            leadingAction={initialMode === 'photo' ? 'back' : 'close'}
            onLeadingPress={handleRequestClose}
            onBusyChange={setComposerBusy}
          />
        </SafeAreaView>
      ) : payload ? (
        <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom', 'left', 'right']}>
          <View className="min-h-[64px] flex-row items-center px-2">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close photo"
              className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
            >
              <MaterialIcons name="close" size={24} color={M3.onSurface} />
            </Pressable>
            <Text className="flex-1 text-center text-sm font-semibold text-m3-on-surface" numberOfLines={1}>
              {payload.name}
            </Text>
            <Pressable
              ref={shareButtonRef}
              onPress={() => setMode('share')}
              disabled={photoUnavailable}
              accessibilityRole="button"
              accessibilityLabel="Share meal"
              accessibilityHint="Opens image choices"
              accessibilityState={{ disabled: photoUnavailable }}
              className={`h-12 w-12 items-center justify-center rounded-full active:opacity-60 ${photoUnavailable ? 'opacity-40' : ''}`}
            >
              <MaterialIcons name="share" size={24} color={M3.onSurface} />
            </Pressable>
          </View>
          {photoUnavailable ? (
            <View className="flex-1 items-center justify-center gap-3 px-8">
              <MaterialIcons name="broken-image" size={36} color={M3.onSurfaceVariant} />
              <Text className="text-center text-sm text-m3-on-surface-variant">This meal photo is no longer available.</Text>
            </View>
          ) : (
            <Image
              source={{ uri: payload.photoUri }}
              className="flex-1 w-full"
              resizeMode="contain"
              fadeDuration={0}
              onError={() => setPhotoUnavailable(true)}
              accessibilityLabel={`${payload.name} photo`}
            />
          )}
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}
