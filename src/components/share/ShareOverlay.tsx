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
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import {
  getShareBrandingEnabled,
  setShareBrandingEnabled,
} from '../../db/database';
import { DURATION, EASING } from '../../theme/motion';
import { M3 } from '../../theme/tokens';
import {
  SHARE_IMAGE,
  type MealCardLayout,
  type ShareContent,
  shareContentKey,
} from '../../utils/shareCards';
import LogToast from '../LogToast';
import SegmentedControl from '../SegmentedControl';
import Sheet from '../Sheet';
import ConsistencyCard from './ConsistencyCard';
import DaySummaryCard from './DaySummaryCard';
import MealCard from './MealCard';

type ExportOperation = null | 'save' | 'share';

const LAYOUT_OPTIONS: Array<{
  value: MealCardLayout;
  label: string;
  accessibilityLabel: string;
}> = [
  { value: 'photo', label: 'Photo', accessibilityLabel: 'Style, photo' },
  { value: 'framed', label: 'Framed', accessibilityLabel: 'Style, framed photo' },
  { value: 'nutrition', label: 'Nutrition', accessibilityLabel: 'Style, nutrition' },
];

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

function BrandMarkToggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const selected = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    selected.value = withTiming(value ? 1 : 0, {
      duration: reduced ? 0 : DURATION.short,
      easing: EASING.emphasized,
    });
  }, [reduced, selected, value]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: selected.value * 20 }],
  }));

  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel="Eatlog mark"
      accessibilityState={{ checked: value, disabled }}
      accessibilityHint="Adds the Eatlog name and egg mark to exported cards"
      className={`min-h-[56px] flex-row items-center justify-between gap-4 rounded-2xl px-3 py-2 active:opacity-70 ${disabled ? 'opacity-40' : ''}`}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-m3-on-surface">Eatlog mark</Text>
        <Text className="mt-0.5 text-xs text-m3-on-surface-variant">Shown on exported cards</Text>
      </View>
      <View
        className="h-7 w-12 rounded-full border p-0.5"
        style={{
          backgroundColor: value ? M3.primary : M3.surfaceContainerHighest,
          borderColor: value ? M3.primary : M3.outline,
        }}
      >
        <Reanimated.View
          className="h-[22px] w-[22px] rounded-full"
          style={[
            { backgroundColor: value ? M3.onPrimary : M3.onSurfaceVariant },
            thumbStyle,
          ]}
        />
      </View>
    </Pressable>
  );
}

function previewAccessibilityLabel(content: ShareContent, layout: MealCardLayout): string {
  if (content.kind === 'day') {
    return `Daily summary image preview. ${Math.round(content.data.calories)} kilocalories. Protein ${Math.round(content.data.protein.grams)} grams, carbohydrates ${Math.round(content.data.carbs.grams)} grams, fat ${Math.round(content.data.fat.grams)} grams.`;
  }
  if (content.kind === 'meal') {
    return `${LAYOUT_LABELS[layout]} meal image preview. ${content.data.name}. ${Math.round(content.data.calories)} kilocalories. Protein ${Math.round(content.data.protein.grams)} grams, carbohydrates ${Math.round(content.data.carbs.grams)} grams, fat ${Math.round(content.data.fat.grams)} grams.`;
  }
  return `Logging consistency image preview. ${content.data.currentWeekCount} of 7 days logged this week.`;
}

function overlayTitle(content: ShareContent): string {
  if (content.kind === 'day') return 'Share day';
  if (content.kind === 'meal') return 'Share meal';
  return 'Share logging consistency';
}

export default function ShareOverlay({
  content,
  onClose,
}: {
  content: ShareContent | null;
  onClose: () => void;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const operationRef = useRef<Exclude<ExportOperation, null> | null>(null);
  const [layout, setLayout] = useState<MealCardLayout>('photo');
  const [showBranding, setShowBranding] = useState<boolean | null>(null);
  const [brandingLoadError, setBrandingLoadError] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [operation, setOperation] = useState<ExportOperation>(null);
  const [cardReady, setCardReady] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [saveConfirmationId, setSaveConfirmationId] = useState(0);

  const busy = operation != null;
  const canCloseRef = useRef<() => boolean>(() => true);
  canCloseRef.current = () => !busy;

  const requestKey = content == null ? 'share-closed' : shareContentKey(content);

  useEffect(() => {
    let active = true;
    void getShareBrandingEnabled()
      .then((enabled) => {
        if (!active) return;
        setShowBranding(enabled);
        setBrandingLoadError(false);
      })
      .catch((error) => {
        console.error('[share-overlay] Eatlog mark preference load failed', error);
        if (!active) return;
        setShowBranding(false);
        setBrandingLoadError(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const hasPhoto = content?.kind === 'meal' && content.data.photoUri != null;
    setLayout(hasPhoto ? 'photo' : 'nutrition');
    setPhotoFailed(false);
    setCardReady(content != null && !hasPhoto);
    setCustomizeOpen(false);
    setSaveConfirmationId(0);
  }, [requestKey]);

  const sheetWidth = windowWidth >= 600 ? Math.min(windowWidth - 64, 720) : windowWidth;
  const previewHeight = Math.max(260, Math.min(520, windowHeight * 0.92 - 260));
  const cardWidth = Math.max(146, Math.min(300, sheetWidth - 80, previewHeight * 9 / 16));
  const cardHeight = cardWidth * 16 / 9;
  const photoAvailable = content?.kind === 'meal' && content.data.photoUri != null && !photoFailed;
  const previewReady = cardReady && showBranding != null;
  const actionsDisabled = busy || !previewReady;
  const snapPoints = useMemo(() => ['92%'], []);

  const changeLayout = (nextLayout: MealCardLayout) => {
    if (busy || !photoAvailable || nextLayout === layout) return;
    setCardReady(false);
    setLayout(nextLayout);
  };

  const changeBranding = async (enabled: boolean) => {
    if (showBranding == null || brandingSaving || busy) return;
    const previous = showBranding;
    setShowBranding(enabled);
    setBrandingSaving(true);
    try {
      await setShareBrandingEnabled(enabled);
      setBrandingLoadError(false);
    } catch (error) {
      console.error('[share-overlay] Eatlog mark preference save failed', error);
      setShowBranding(previous);
      Alert.alert(
        'Couldn’t update the Eatlog mark',
        'Your previous setting is still active. Try the switch again.',
      );
    } finally {
      setBrandingSaving(false);
    }
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
    if (!cardRef.current || !previewReady) {
      throw new Error('Share card is not ready');
    }
    let capturedUri: string | null = null;
    let cacheUri: string | null = null;
    try {
      const pixelRatio = PixelRatio.get();
      capturedUri = await captureRef(cardRef.current, {
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
        dialogTitle: content ? overlayTitle(content) : 'Share Eatlog image',
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

  const optionSummary = content?.kind === 'meal'
    ? `${photoAvailable ? LAYOUT_LABELS[layout] : 'Nutrition'} · Eatlog mark ${showBranding ? 'on' : 'off'}`
    : `Eatlog mark ${showBranding ? 'on' : 'off'}`;

  return (
    <Sheet
      visible={content != null}
      snapPoints={snapPoints}
      stateKey={requestKey}
      canCloseRef={canCloseRef}
      onSheetClosed={onClose}
      enablePanDownToClose
    >
      {content && (
        <View className="flex-1 bg-m3-surface-container">
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            <View className="min-h-[52px] flex-row items-center px-2">
              <Pressable
                onPress={() => { if (!busy) onClose(); }}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Close ${overlayTitle(content).toLowerCase()}`}
                accessibilityState={{ disabled: busy }}
                className={`h-12 w-12 items-center justify-center rounded-full active:opacity-60 ${busy ? 'opacity-40' : ''}`}
              >
                <MaterialIcons name="close" size={24} color={M3.onSurface} />
              </Pressable>
              <Text accessibilityRole="header" className="flex-1 text-center text-base font-semibold text-m3-on-surface">
                {overlayTitle(content)}
              </Text>
              <View className="h-12 w-12" />
            </View>

            <View className="items-center px-4 py-2">
              <View style={{ width: cardWidth, height: cardHeight }}>
                <View
                  ref={cardRef}
                  collapsable={false}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={previewAccessibilityLabel(content, layout)}
                  style={{ width: cardWidth, height: cardHeight }}
                  onLayout={() => {
                    if (content.kind !== 'meal' || !photoAvailable) setCardReady(true);
                  }}
                >
                  {content.kind === 'day' ? (
                    <DaySummaryCard data={content.data} showBranding={showBranding ?? false} width={cardWidth} height={cardHeight} />
                  ) : content.kind === 'meal' ? (
                    <MealCard
                      data={photoFailed ? { ...content.data, photoUri: null } : content.data}
                      layout={photoAvailable ? layout : 'nutrition'}
                      showBranding={showBranding ?? false}
                      width={cardWidth}
                      height={cardHeight}
                      onPhotoLoad={() => setCardReady(true)}
                      onPhotoError={() => {
                        setPhotoFailed(true);
                        setLayout('nutrition');
                        setCardReady(true);
                        AccessibilityInfo.announceForAccessibility('Meal photo unavailable. Using the nutrition card.');
                      }}
                    />
                  ) : (
                    <ConsistencyCard data={content.data} showBranding={showBranding ?? false} width={cardWidth} height={cardHeight} />
                  )}
                </View>

                {!previewReady && (
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

              {photoFailed && (
                <View
                  className="mt-3 flex-row items-center gap-2 rounded-full bg-m3-surface-container-high px-3 py-2"
                  accessibilityLiveRegion="polite"
                >
                  <MaterialIcons name="image-not-supported" size={18} color={M3.onSurfaceVariant} />
                  <Text className="text-xs font-medium text-m3-on-surface-variant">
                    Photo unavailable · Using nutrition
                  </Text>
                </View>
              )}
            </View>

            <View className="px-4 pt-3">
              <Pressable
                onPress={() => setCustomizeOpen((open) => !open)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Card options"
                accessibilityHint={customizeOpen ? 'Hides card style and Eatlog mark options' : 'Shows card style and Eatlog mark options'}
                accessibilityState={{ expanded: customizeOpen, disabled: busy }}
                className={`min-h-[64px] flex-row items-center gap-3 rounded-2xl px-3 active:opacity-70 ${busy ? 'opacity-40' : ''}`}
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-m3-on-surface">Card options</Text>
                  <Text className="mt-0.5 text-xs text-m3-on-surface-variant" numberOfLines={1}>
                    {showBranding == null ? 'Loading Eatlog mark preference…' : optionSummary}
                  </Text>
                </View>
                <MaterialIcons
                  name={customizeOpen ? 'expand-less' : 'expand-more'}
                  size={24}
                  color={M3.onSurfaceVariant}
                />
              </Pressable>

              {brandingLoadError && (
                <Text className="px-3 pb-2 text-xs text-m3-error" accessibilityLiveRegion="polite">
                  The Eatlog mark preference couldn’t be loaded, so the mark is off for this card.
                </Text>
              )}

              {customizeOpen && (
                <View className="gap-3 border-t border-m3-outline-variant px-3 pb-2 pt-4">
                  {content.kind === 'meal' && photoAvailable && (
                    <View className="gap-2">
                      <Text className="text-xs font-semibold text-m3-on-surface-variant">Style</Text>
                      <SegmentedControl
                        options={LAYOUT_OPTIONS}
                        value={layout}
                        onChange={changeLayout}
                        disabled={busy}
                        accessibilityLabel="Card style"
                      />
                    </View>
                  )}
                  {showBranding != null && (
                    <BrandMarkToggle
                      value={showBranding}
                      disabled={busy || brandingSaving}
                      onChange={(enabled) => { void changeBranding(enabled); }}
                    />
                  )}
                </View>
              )}
            </View>
          </ScrollView>

          <View className="flex-row gap-3 border-t border-m3-outline-variant bg-m3-surface-container px-4 pb-2 pt-3">
            <Pressable
              onPress={() => { void handleSave(); }}
              disabled={actionsDisabled}
              accessibilityRole="button"
              accessibilityLabel="Save image"
              accessibilityHint="Saves the visible share card to your photo library"
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
              accessibilityHint="Opens the system share menu with the visible image"
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
