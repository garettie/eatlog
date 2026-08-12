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
  type MealCardLayout,
  type ShareContent,
  shareContentKey,
} from '../../utils/shareCards';
import LogToast from '../LogToast';
import SegmentedControl from '../SegmentedControl';
import Sheet from '../Sheet';
import DaySummaryCard from './DaySummaryCard';
import MealCard from './MealCard';
import StreakCard from './StreakCard';

type ExportOperation = null | 'save' | 'share';
type ShareContentKind = ShareContent['kind'];

const CONTENT_PRIORITY: ShareContentKind[] = ['meal', 'day', 'streak'];
const CONTENT_LABELS: Record<ShareContentKind, string> = {
  meal: 'Meal',
  day: 'Day',
  streak: 'Streak',
};

const LAYOUT_OPTIONS: Array<{ value: MealCardLayout; label: string }> = [
  { value: 'full-bleed', label: 'Full bleed' },
  { value: 'framed', label: 'Framed' },
  { value: 'stat', label: 'Stat' },
];

function deleteCacheFile(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

function BrandingToggle({
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
      accessibilityLabel="Eatlog badge"
      accessibilityState={{ checked: value, disabled }}
      accessibilityHint="Toggles the Eatlog badge on share cards"
      className={`flex-row items-center justify-between gap-4 px-2 py-2.5 active:opacity-70 ${disabled ? 'opacity-40' : ''}`}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-m3-on-surface">Eatlog badge</Text>
        <Text className="mt-0.5 text-xs text-m3-on-surface-variant">Shown on every card you post</Text>
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
    return `${layout} meal image preview. ${content.data.name}. ${Math.round(content.data.calories)} kilocalories. Protein ${Math.round(content.data.protein.grams)} grams, carbohydrates ${Math.round(content.data.carbs.grams)} grams, fat ${Math.round(content.data.fat.grams)} grams.`;
  }
  return `Logging streak image preview. Current streak ${content.data.currentStreak} days. Longest streak ${content.data.longestStreak} days. ${content.data.lastSevenDays.filter((day) => day.complete).length} of the last 7 days logged.`;
}

function overlayTitle(content: ShareContent): string {
  if (content.kind === 'day') return 'Share day';
  if (content.kind === 'meal') return 'Share meal';
  return 'Share streak';
}

export default function ShareOverlay({
  contents,
  onClose,
}: {
  contents: readonly ShareContent[] | null;
  onClose: () => void;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const operationRef = useRef<Exclude<ExportOperation, null> | null>(null);
  const [selectedKind, setSelectedKind] = useState<ShareContentKind>('meal');
  const [layout, setLayout] = useState<MealCardLayout>('full-bleed');
  const [showBranding, setShowBranding] = useState(true);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [operation, setOperation] = useState<ExportOperation>(null);
  const [cardReady, setCardReady] = useState(false);
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const [saveConfirmationId, setSaveConfirmationId] = useState(0);

  const busy = operation != null;
  const canCloseRef = useRef<() => boolean>(() => true);
  canCloseRef.current = () => !busy;

  const orderedContents = useMemo(() => {
    const seen = new Set<ShareContentKind>();
    return [...(contents ?? [])]
      .sort((a, b) => CONTENT_PRIORITY.indexOf(a.kind) - CONTENT_PRIORITY.indexOf(b.kind))
      .filter((item) => {
        if (seen.has(item.kind)) return false;
        seen.add(item.kind);
        return true;
      });
  }, [contents]);
  const content = orderedContents.find((item) => item.kind === selectedKind) ?? orderedContents[0] ?? null;
  const contentOptions = useMemo(() => orderedContents.map((item) => ({
    value: item.kind,
    label: CONTENT_LABELS[item.kind],
  })), [orderedContents]);
  const requestKey = orderedContents.map(shareContentKey).join('|');

  useEffect(() => {
    let active = true;
    void getShareBrandingEnabled()
      .then((enabled) => {
        if (active) setShowBranding(enabled);
      })
      .catch((error) => console.error('[share-overlay] branding preference load failed', error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const firstContent = orderedContents[0] ?? null;
    setSelectedKind(firstContent?.kind ?? 'meal');
    setLayout('full-bleed');
    setPhotoUnavailable(false);
    setCardReady(firstContent?.kind !== 'meal' && firstContent != null);
    setSaveConfirmationId(0);
  }, [requestKey]);

  const sheetWidth = windowWidth >= 600 ? Math.min(windowWidth - 64, 720) : windowWidth;
  const reservedHeight = (contentOptions.length > 1 ? 60 : 0) + (content?.kind === 'meal' ? 272 : 212);
  const previewHeight = Math.max(260, Math.min(520, windowHeight * 0.92 - reservedHeight));
  const cardWidth = Math.max(146, Math.min(300, sheetWidth - 80, previewHeight * 9 / 16));
  const cardHeight = cardWidth * 16 / 9;
  const actionsDisabled = busy || !cardReady || photoUnavailable;

  const stateKey = content == null ? 'share-closed' : `share-${requestKey}`;
  const snapPoints = useMemo(() => ['92%'], []);

  const changeLayout = (nextLayout: MealCardLayout) => {
    if (busy || nextLayout === layout) return;
    setCardReady(false);
    setPhotoUnavailable(false);
    setLayout(nextLayout);
  };

  const changeContent = (nextKind: ShareContentKind) => {
    if (busy || nextKind === content?.kind) return;
    const nextContent = orderedContents.find((item) => item.kind === nextKind);
    if (!nextContent) return;
    setPhotoUnavailable(false);
    setCardReady(nextContent.kind !== 'meal');
    setSelectedKind(nextKind);
  };

  const changeBranding = async (enabled: boolean) => {
    if (brandingSaving || busy) return;
    const previous = showBranding;
    setShowBranding(enabled);
    setBrandingSaving(true);
    try {
      await setShareBrandingEnabled(enabled);
    } catch (error) {
      console.error('[share-overlay] branding preference save failed', error);
      setShowBranding(previous);
      Alert.alert('Couldn’t save the branding preference.', 'Try again.');
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
    if (!cardRef.current || !cardReady || photoUnavailable) {
      throw new Error('Share card is not ready');
    }
    let capturedUri: string | null = null;
    let cacheUri: string | null = null;
    try {
      const pixelRatio = PixelRatio.get();
      capturedUri = await captureRef(cardRef.current, {
        result: 'tmpfile',
        format: 'png',
        quality: 1,
        width: Platform.OS === 'ios' ? 1080 / pixelRatio : 1080,
        height: Platform.OS === 'ios' ? 1920 / pixelRatio : 1920,
      });
      const cacheFile = new File(Paths.cache, `eatlog-share-${Date.now()}.png`);
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
          Alert.alert('Photo access is needed', 'Allow Eatlog to save this image to your photo library.');
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
      Alert.alert('Couldn’t save the share image.', 'Try again.');
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
        Alert.alert('Sharing isn’t available on this device.');
        return;
      }
      const captured = await captureCard();
      capturedUri = captured.capturedUri;
      cacheUri = captured.cacheUri;
      await Sharing.shareAsync(cacheUri, {
        mimeType: 'image/png',
        dialogTitle: content ? overlayTitle(content) : 'Share Eatlog image',
        UTI: 'public.png',
      });
    } catch (error) {
      console.error('[share-overlay] share failed', error);
      Alert.alert('Couldn’t share the image.', 'Try again.');
    } finally {
      if (capturedUri) releaseCapture(capturedUri);
      deleteCacheFile(capturedUri);
      deleteCacheFile(cacheUri);
      endOperation();
    }
  };

  return (
    <Sheet
      visible={orderedContents.length > 0}
      snapPoints={snapPoints}
      stateKey={stateKey}
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
            contentContainerStyle={{ paddingBottom: 16 }}
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

            {contentOptions.length > 1 && (
              <View className="px-4 pb-2 pt-1">
                <SegmentedControl
                  options={contentOptions}
                  value={content.kind}
                  onChange={changeContent}
                  disabled={busy}
                />
              </View>
            )}

            <View className="items-center px-4 py-2">
              {photoUnavailable ? (
                <View
                  className="items-center justify-center gap-3 rounded-3xl bg-m3-surface-container-high px-8"
                  style={{ width: cardWidth, height: cardHeight }}
                  accessibilityRole="alert"
                >
                  <MaterialIcons name="broken-image" size={36} color={M3.onSurfaceVariant} />
                  <Text className="text-center text-sm text-m3-on-surface-variant">
                    This meal photo is no longer available.
                  </Text>
                </View>
              ) : (
                <View
                  ref={cardRef}
                  collapsable={false}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={previewAccessibilityLabel(content, layout)}
                  style={{ width: cardWidth, height: cardHeight }}
                  onLayout={() => {
                    if (content.kind !== 'meal') setCardReady(true);
                  }}
                >
                  {content.kind === 'day' ? (
                    <DaySummaryCard data={content.data} showBranding={showBranding} width={cardWidth} height={cardHeight} />
                  ) : content.kind === 'meal' ? (
                    <MealCard
                      data={content.data}
                      layout={layout}
                      showBranding={showBranding}
                      width={cardWidth}
                      height={cardHeight}
                      onPhotoLoad={() => setCardReady(true)}
                      onPhotoError={() => {
                        setCardReady(false);
                        setPhotoUnavailable(true);
                      }}
                    />
                  ) : (
                    <StreakCard data={content.data} showBranding={showBranding} width={cardWidth} height={cardHeight} />
                  )}
                </View>
              )}
            </View>

            {content.kind === 'meal' && (
              <View className="px-4 pb-1 pt-3">
                <SegmentedControl
                  options={LAYOUT_OPTIONS}
                  value={layout}
                  onChange={changeLayout}
                  disabled={busy || photoUnavailable}
                />
              </View>
            )}

            <View className="px-4 pt-2">
              <View className="border-b border-m3-outline-variant pb-4 pt-1">
                <BrandingToggle
                  value={showBranding}
                  disabled={busy || brandingSaving}
                  onChange={(enabled) => { void changeBranding(enabled); }}
                />
              </View>
              <Text className="pt-3 text-xs text-m3-placeholder">
                To post a Story, choose Instagram from Share when it's available on your device.
              </Text>
            </View>

            <View className="mt-2 flex-row gap-3 border-t border-m3-outline-variant px-4 pb-2 pt-4">
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
                accessibilityHint="Opens the system share sheet with the visible image"
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
          </ScrollView>

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
