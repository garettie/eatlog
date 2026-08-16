import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Linking,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { M3 } from '../../theme/tokens';
import {
  SHARE_IMAGE,
  type MealCardLayout,
  type MealShareData,
} from '../../utils/shareCards';
import LogToast from '../LogToast';
import Sheet from '../Sheet';
import MealCard from './MealCard';

type ExportOperation = null | 'save' | 'share';

const PHOTO_LAYOUTS: readonly MealCardLayout[] = ['photo', 'framed', 'nutrition'];
const NUTRITION_LAYOUTS: readonly MealCardLayout[] = ['nutrition'];
const LAYOUT_LABELS: Record<MealCardLayout, string> = {
  photo: 'Photo',
  framed: 'Framed photo',
  nutrition: 'Nutrition',
};

function deleteCacheFile(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

function previewAccessibilityLabel(data: MealShareData, layout: MealCardLayout): string {
  return `${LAYOUT_LABELS[layout]} meal image preview. ${data.name}. ${Math.round(data.calories)} kilocalories. Protein ${Math.round(data.protein.grams)} grams, carbohydrates ${Math.round(data.carbs.grams)} grams, fat ${Math.round(data.fat.grams)} grams.`;
}

export default function ShareOverlay({
  meal,
  onClose,
}: {
  meal: MealShareData | null;
  onClose: () => void;
}) {
  const carouselRef = useRef<ScrollView>(null);
  const cardRefs = useRef<Partial<Record<MealCardLayout, View | null>>>({});
  const operationRef = useRef<Exclude<ExportOperation, null> | null>(null);
  const [layout, setLayout] = useState<MealCardLayout>('photo');
  const [operation, setOperation] = useState<ExportOperation>(null);
  const [readyLayouts, setReadyLayouts] = useState<Set<MealCardLayout>>(() => new Set());
  const [photoFailed, setPhotoFailed] = useState(false);
  const [carouselSize, setCarouselSize] = useState({ width: 0, height: 0 });
  const [saveConfirmationId, setSaveConfirmationId] = useState(0);

  const busy = operation != null;
  const canCloseRef = useRef<() => boolean>(() => true);
  canCloseRef.current = () => !busy;

  const requestKey = meal == null ? 'share-closed' : `meal-${meal.mealId}`;
  const photoAvailable = meal?.photoUri != null && !photoFailed;
  const availableLayouts = photoAvailable ? PHOTO_LAYOUTS : NUTRITION_LAYOUTS;
  const activeLayout = availableLayouts.includes(layout) ? layout : availableLayouts[0];
  const layoutIndex = availableLayouts.indexOf(activeLayout);
  const cardWidth = Math.max(
    0,
    Math.min(300, carouselSize.width - 32, (carouselSize.height - 8) * 9 / 16),
  );
  const cardHeight = cardWidth * 16 / 9;
  const previewReady = meal != null
    && readyLayouts.has(activeLayout)
    && cardWidth > 0;
  const actionsDisabled = busy || !previewReady;
  const snapPoints = useMemo(() => ['100%'], []);

  useEffect(() => {
    const hasPhoto = meal?.photoUri != null;
    const initialLayout = hasPhoto ? 'photo' : 'nutrition';
    setLayout(initialLayout);
    setPhotoFailed(false);
    setReadyLayouts(new Set());
    setSaveConfirmationId(0);
  }, [requestKey]);

  useEffect(() => {
    if (carouselSize.width <= 0) return;
    carouselRef.current?.scrollTo({
      x: layoutIndex * carouselSize.width,
      animated: false,
    });
  }, [carouselSize.width, layoutIndex, photoAvailable]);

  const markLayoutReady = (readyLayout: MealCardLayout) => {
    setReadyLayouts((current) => {
      if (current.has(readyLayout)) return current;
      const next = new Set(current);
      next.add(readyLayout);
      return next;
    });
  };

  const handlePhotoError = () => {
    if (photoFailed) return;
    setPhotoFailed(true);
    setLayout('nutrition');
    setReadyLayouts(new Set());
    AccessibilityInfo.announceForAccessibility('Meal photo unavailable. Using the nutrition card.');
  };

  const selectLayout = (nextIndex: number, animated: boolean) => {
    if (busy || carouselSize.width <= 0) return;
    const boundedIndex = Math.max(0, Math.min(availableLayouts.length - 1, nextIndex));
    const nextLayout = availableLayouts[boundedIndex];
    setLayout(nextLayout);
    carouselRef.current?.scrollTo({
      x: boundedIndex * carouselSize.width,
      animated,
    });
  };

  const beginOperation = (next: Exclude<ExportOperation, null>): boolean => {
    if (operationRef.current != null || actionsDisabled) return false;
    operationRef.current = next;
    setOperation(next);
    return true;
  };

  const endOperation = () => {
    operationRef.current = null;
    setOperation(null);
  };

  const captureCard = async (): Promise<{ capturedUri: string; cacheUri: string }> => {
    const activeCard = cardRefs.current[activeLayout];
    if (!activeCard || !previewReady) {
      throw new Error('Share card is not ready');
    }
    let capturedUri: string | null = null;
    let cacheUri: string | null = null;
    try {
      const pixelRatio = PixelRatio.get();
      capturedUri = await captureRef(activeCard, {
        result: 'tmpfile',
        format: SHARE_IMAGE.format,
        quality: 1,
        width: Platform.OS === 'ios' ? SHARE_IMAGE.width / pixelRatio : SHARE_IMAGE.width,
        height: Platform.OS === 'ios' ? SHARE_IMAGE.height / pixelRatio : SHARE_IMAGE.height,
      });
      const cacheFile = new File(Paths.cache, `eatlog-share-${Date.now()}.${SHARE_IMAGE.extension}`);
      new File(capturedUri).copy(cacheFile);
      cacheUri = cacheFile.uri;
      return { capturedUri, cacheUri };
    } catch (error) {
      if (capturedUri) releaseCapture(capturedUri);
      deleteCacheFile(capturedUri);
      deleteCacheFile(cacheUri);
      throw error;
    }
  };

  const handleSave = async () => {
    if (!beginOperation('save')) return;
    let capturedUri: string | null = null;
    let cacheUri: string | null = null;
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true, []);
      if (!permission.granted) {
        if (!permission.canAskAgain) {
          Alert.alert(
            'Photo access is off',
            'Open Settings to allow Eatlog to save share images.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open settings', onPress: () => void Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert(
            'Photo access wasn’t allowed',
            'Try Save image again and allow Eatlog to add the image to your photo library.',
          );
        }
        return;
      }

      const captured = await captureCard();
      capturedUri = captured.capturedUri;
      cacheUri = captured.cacheUri;
      await MediaLibrary.saveToLibraryAsync(cacheUri);
      setSaveConfirmationId((current) => current + 1);
      AccessibilityInfo.announceForAccessibility('Share image saved.');
    } catch (error) {
      console.error('[share-overlay] save failed', error);
      Alert.alert(
        'Couldn’t save the image',
        'The card wasn’t saved. Check the preview and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try again', onPress: () => { void handleSave(); } },
        ],
      );
    } finally {
      if (capturedUri) releaseCapture(capturedUri);
      deleteCacheFile(capturedUri);
      deleteCacheFile(cacheUri);
      endOperation();
    }
  };

  const handleShare = async () => {
    if (!beginOperation('share')) return;
    let capturedUri: string | null = null;
    let cacheUri: string | null = null;
    try {
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('Sharing isn’t available', 'This device doesn’t currently offer a share destination.');
        return;
      }
      const captured = await captureCard();
      capturedUri = captured.capturedUri;
      cacheUri = captured.cacheUri;
      await Sharing.shareAsync(cacheUri, {
        mimeType: SHARE_IMAGE.mimeType,
        dialogTitle: 'Share meal',
        UTI: 'public.png',
      });
    } catch (error) {
      console.error('[share-overlay] share failed', error);
      Alert.alert(
        'Couldn’t open Share',
        'The image is still available in this preview. Try sharing it again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try again', onPress: () => { void handleShare(); } },
        ],
      );
    } finally {
      if (capturedUri) releaseCapture(capturedUri);
      deleteCacheFile(capturedUri);
      deleteCacheFile(cacheUri);
      endOperation();
    }
  };

  return (
    <Sheet
      visible={meal != null}
      snapPoints={snapPoints}
      stateKey={requestKey}
      canCloseRef={canCloseRef}
      onSheetClosed={onClose}
      enablePanDownToClose
    >
      {meal && (
        <View className="flex-1 bg-m3-surface-container">
          <View className="min-h-[52px] flex-row items-center px-2">
            <Pressable
              onPress={() => { if (!busy) onClose(); }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Close share meal"
              accessibilityState={{ disabled: busy }}
              className={`h-12 w-12 items-center justify-center rounded-full active:opacity-60 ${busy ? 'opacity-40' : ''}`}
            >
              <MaterialIcons name="close" size={24} color={M3.onSurface} />
            </Pressable>
            <Text accessibilityRole="header" className="flex-1 text-center text-base font-semibold text-m3-on-surface">
              Share meal
            </Text>
            <View className="h-12 w-12" />
          </View>

          <View
            className="min-h-0 flex-1"
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setCarouselSize((current) => current.width === width && current.height === height
                ? current
                : { width, height });
            }}
          >
            {carouselSize.width > 0 && carouselSize.height > 0 && (
              <ScrollView
                ref={carouselRef}
                horizontal
                pagingEnabled
                nestedScrollEnabled
                scrollEnabled={!busy && availableLayouts.length > 1}
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                bounces={false}
                overScrollMode="never"
                onMomentumScrollEnd={(event) => {
                  const nextIndex = Math.max(
                    0,
                    Math.min(
                      availableLayouts.length - 1,
                      Math.round(event.nativeEvent.contentOffset.x / carouselSize.width),
                    ),
                  );
                  setLayout(availableLayouts[nextIndex]);
                }}
                accessibilityRole="adjustable"
                accessibilityLabel={previewAccessibilityLabel(meal, activeLayout)}
                accessibilityValue={{
                  min: 1,
                  max: availableLayouts.length,
                  now: layoutIndex + 1,
                  text: `${LAYOUT_LABELS[activeLayout]}, ${layoutIndex + 1} of ${availableLayouts.length}`,
                }}
                accessibilityActions={[
                  { name: 'decrement', label: 'Previous card style' },
                  { name: 'increment', label: 'Next card style' },
                ]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'increment') selectLayout(layoutIndex + 1, true);
                  if (event.nativeEvent.actionName === 'decrement') selectLayout(layoutIndex - 1, true);
                }}
              >
                {availableLayouts.map((cardLayout) => (
                  <View
                    key={cardLayout}
                    className="items-center justify-center"
                    style={{ width: carouselSize.width, height: carouselSize.height }}
                  >
                    <View style={{ width: cardWidth, height: cardHeight }}>
                      <View
                        ref={(view) => { cardRefs.current[cardLayout] = view; }}
                        collapsable={false}
                        accessible={false}
                        style={{ width: cardWidth, height: cardHeight }}
                      >
                        <MealCard
                          data={photoFailed ? { ...meal, photoUri: null } : meal}
                          layout={cardLayout}
                          width={cardWidth}
                          height={cardHeight}
                          onPhotoLoad={() => markLayoutReady(cardLayout)}
                          onPhotoError={handlePhotoError}
                        />
                      </View>

                      {cardLayout === activeLayout && !previewReady && (
                        <View
                          className="absolute inset-0 items-center justify-center gap-3 rounded-3xl"
                          style={{ backgroundColor: `${M3.surfaceContainerLowest}f2` }}
                          accessibilityRole="progressbar"
                          accessibilityLabel="Preparing share preview"
                        >
                          <ActivityIndicator color={M3.onSurface} />
                          <Text className="text-sm font-medium text-m3-on-surface-variant">Preparing preview…</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View className="min-h-[24px] items-center justify-center">
            <View className="flex-row items-center gap-2" accessible={false}>
              {availableLayouts.map((cardLayout, index) => (
                <View
                  key={cardLayout}
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: index === layoutIndex ? M3.primary : M3.outline,
                  }}
                />
              ))}
            </View>
          </View>

          {photoFailed && (
            <View className="min-h-[28px] flex-row items-center justify-center gap-2 px-4" accessibilityLiveRegion="polite">
              <MaterialIcons name="image-not-supported" size={18} color={M3.onSurfaceVariant} />
              <Text className="text-xs font-medium text-m3-on-surface-variant">
                Photo unavailable · Meal details shown
              </Text>
            </View>
          )}

          <View className="flex-row gap-3 border-t border-m3-outline-variant bg-m3-surface-container px-4 pb-2 pt-3">
            <Pressable
              onPress={() => { void handleSave(); }}
              disabled={actionsDisabled}
              accessibilityRole="button"
              accessibilityLabel="Save image"
              accessibilityHint="Saves the visible meal card to your photo library"
              accessibilityState={{ disabled: actionsDisabled, busy: operation === 'save' }}
              className={`min-h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-full bg-m3-secondary-container px-3 active:opacity-80 ${actionsDisabled ? 'opacity-40' : ''}`}
            >
              {operation === 'save' ? (
                <ActivityIndicator color={M3.onSecondaryContainer} />
              ) : (
                <>
                  <MaterialIcons name="download" size={20} color={M3.onSecondaryContainer} />
                  <Text className="text-sm font-bold text-m3-on-secondary-container">Save image</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={() => { void handleShare(); }}
              disabled={actionsDisabled}
              accessibilityRole="button"
              accessibilityLabel="Share image"
              accessibilityHint="Opens the system share menu with the visible meal card"
              accessibilityState={{ disabled: actionsDisabled, busy: operation === 'share' }}
              className={`min-h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-full bg-m3-primary px-3 active:opacity-90 ${actionsDisabled ? 'opacity-40' : ''}`}
            >
              {operation === 'share' ? (
                <ActivityIndicator color={M3.onPrimary} />
              ) : (
                <>
                  <MaterialIcons name="share" size={20} color={M3.onPrimary} />
                  <Text className="text-sm font-bold text-m3-on-primary">Share</Text>
                </>
              )}
            </Pressable>
          </View>

          {saveConfirmationId > 0 && (
            <View className="absolute bottom-20 left-4 right-4 z-10">
              <LogToast
                key={saveConfirmationId}
                message="Share image saved."
                tone="success"
                onHide={() => setSaveConfirmationId(0)}
              />
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}
