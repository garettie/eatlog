import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
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
  onImageSaved: () => void;
}

export default function MealPhotoViewer({
  payload,
  initialMode,
  onClose,
  onImageSaved,
}: MealPhotoViewerProps) {
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<'photo' | 'share'>(initialMode);
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const [composerBusy, setComposerBusy] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setPhotoUnavailable(false);
    setComposerBusy(false);
  }, [payload?.mealId, payload?.photoUri, initialMode]);

  const handleRequestClose = useCallback(() => {
    if (composerBusy) return;
    if (mode === 'share' && initialMode === 'photo') {
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
      onRequestClose={handleRequestClose}
    >
      {payload && (
        <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom', 'left', 'right']}>
          {mode === 'share' ? (
            <MealShareComposer
              key={`${payload.mealId}-${payload.photoUri}-${initialMode}`}
              payload={payload}
              leadingAction={initialMode === 'photo' ? 'back' : 'close'}
              onLeadingPress={handleRequestClose}
              onImageSaved={onImageSaved}
              onBusyChange={setComposerBusy}
            />
          ) : (
            <>
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
            </>
          )}
        </SafeAreaView>
      )}
    </Modal>
  );
}
