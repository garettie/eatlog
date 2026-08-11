import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Image,
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
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { M3 } from '../theme/tokens';
import {
  getMealShareComponentRows,
  getMealSharePreviewAccessibilityLabel,
  type MealSharePayload,
  type MealShareTemplateId,
} from '../utils/mealSharing';
import SegmentedControl from './SegmentedControl';
import LogToast from './LogToast';

interface MealShareComposerProps {
  payload: MealSharePayload;
  leadingAction: 'back' | 'close';
  onLeadingPress: () => void;
  onBusyChange: (busy: boolean) => void;
}

type Operation = null | 'capture-save' | 'capture-share';
type CardRefs = Record<MealShareTemplateId, View | null>;
type Readiness = Record<MealShareTemplateId, boolean>;

const ALL_TEMPLATES: Array<{ value: MealShareTemplateId; label: string }> = [
  { value: 'summary', label: 'Summary' },
  { value: 'macros', label: 'Macros' },
  { value: 'components', label: 'Components' },
];

function RoundedValue({ value, suffix = '' }: { value: number; suffix?: string }) {
  return <Text maxFontSizeMultiplier={1} className="text-base font-bold text-m3-on-surface tabular-nums">{Math.round(value)}{suffix}</Text>;
}

function BrandMark() {
  return <Text maxFontSizeMultiplier={1} className="text-xs font-semibold text-m3-on-surface-variant">Eatlog</Text>;
}

function MacroColumns({ payload, prominent = false }: { payload: MealSharePayload; prominent?: boolean }) {
  const macros = [
    { label: 'P', value: payload.protein, color: M3.protein },
    { label: 'C', value: payload.carbs, color: M3.carbs },
    { label: 'F', value: payload.fat, color: M3.fat },
  ];
  return (
    <View className="flex-row">
      {macros.map((macro) => (
        <View key={macro.label} className="flex-1 items-center gap-1">
          <Text maxFontSizeMultiplier={1} className="text-xs font-semibold" style={{ color: macro.color }}>{macro.label}</Text>
          <Text
            maxFontSizeMultiplier={1}
            className={`${prominent ? 'text-xl' : 'text-base'} font-bold tabular-nums`}
            style={{ color: macro.color }}
          >
            {Math.round(macro.value)}g
          </Text>
        </View>
      ))}
    </View>
  );
}

function MealShareCard({
  payload,
  template,
  width,
  height,
  setRef,
  onPhotoLoad,
  onPhotoError,
}: {
  payload: MealSharePayload;
  template: MealShareTemplateId;
  width: number;
  height: number;
  setRef: (view: View | null) => void;
  onPhotoLoad: () => void;
  onPhotoError: () => void;
}) {
  const componentRows = getMealShareComponentRows(payload.componentNames);
  const designWidth = 360;
  const designHeight = 450;
  const scale = width / designWidth;

  return (
    <View
      ref={setRef}
      collapsable={false}
      className="overflow-hidden bg-m3-surface-container-lowest"
      style={{ width, height }}
    >
      <View
        className="absolute overflow-hidden bg-m3-surface-container-lowest"
        style={{
          width: designWidth,
          height: designHeight,
          left: (width - designWidth) / 2,
          top: (height - designHeight) / 2,
          transform: [{ scale }],
        }}
      >
        <Image
          source={{ uri: payload.photoUri }}
          className="flex-1 w-full bg-m3-surface-container-lowest"
          resizeMode="contain"
          fadeDuration={0}
          onLoad={onPhotoLoad}
          onError={onPhotoError}
          accessibilityIgnoresInvertColors
        />

        {template === 'summary' && (
          <View className="h-[34%] justify-between border-t border-m3-outline-variant bg-m3-surface-container px-5 py-4">
            <View className="flex-row gap-4">
              <Text maxFontSizeMultiplier={1} className="flex-1 text-lg font-bold text-m3-on-surface" numberOfLines={2}>{payload.name}</Text>
              <View className="w-20 items-end">
                <RoundedValue value={payload.calories} />
                <Text maxFontSizeMultiplier={1} className="text-xs text-m3-on-surface-variant">kcal</Text>
              </View>
            </View>
            <View className="flex-row items-end gap-3">
              <View className="flex-1"><MacroColumns payload={payload} /></View>
              <BrandMark />
            </View>
          </View>
        )}

        {template === 'macros' && (
          <View className="h-[46%] justify-between border-t border-m3-outline-variant bg-m3-surface-container px-5 py-3">
            <Text maxFontSizeMultiplier={1} className="text-lg font-bold text-m3-on-surface" numberOfLines={2}>{payload.name}</Text>
            <View>
              <Text maxFontSizeMultiplier={1} className="text-4xl font-bold text-m3-calories tabular-nums">{Math.round(payload.calories)}</Text>
              <Text maxFontSizeMultiplier={1} className="text-xs font-medium text-m3-on-surface-variant">kcal</Text>
            </View>
            <MacroColumns payload={payload} prominent />
            <View className="items-end"><BrandMark /></View>
          </View>
        )}

        {template === 'components' && (
          <View className="h-[60%] border-t border-m3-outline-variant bg-m3-surface-container px-5 py-3">
            <View className="flex-row items-start gap-4">
              <Text maxFontSizeMultiplier={1} className="flex-1 text-base font-bold text-m3-on-surface" numberOfLines={2}>{payload.name}</Text>
              <Text maxFontSizeMultiplier={1} className="text-sm font-bold text-m3-calories tabular-nums">{Math.round(payload.calories)} kcal</Text>
            </View>
            <View className="my-2"><MacroColumns payload={payload} /></View>
            <Text maxFontSizeMultiplier={1} className="mb-1 text-xs font-semibold text-m3-on-surface-variant">{payload.componentHeading}</Text>
            <View className="flex-1 justify-center">
              {componentRows.map((name, index) => (
                <Text
                  key={`${index}-${name}`}
                  maxFontSizeMultiplier={1}
                  className="text-xs text-m3-on-surface"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {name}
                </Text>
              ))}
            </View>
            <View className="items-end"><BrandMark /></View>
          </View>
        )}
      </View>
    </View>
  );
}

function deleteCacheFile(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

export default function MealShareComposer({
  payload,
  leadingAction,
  onLeadingPress,
  onBusyChange,
}: MealShareComposerProps) {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const headingRef = useRef<View>(null);
  const initialFocusDoneRef = useRef(false);
  const focusFrameRef = useRef<number | null>(null);
  const cardRefs = useRef<CardRefs>({ summary: null, macros: null, components: null });
  const operationRef = useRef<Exclude<Operation, null> | null>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [selectorHeight, setSelectorHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<MealShareTemplateId>('summary');
  const [operation, setOperation] = useState<Operation>(null);
  const [carouselTransitioning, setCarouselTransitioning] = useState(false);
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const [saveConfirmationId, setSaveConfirmationId] = useState(0);
  const [readiness, setReadiness] = useState<Readiness>({
    summary: false,
    macros: false,
    components: false,
  });

  useEffect(() => () => {
    if (focusFrameRef.current != null) cancelAnimationFrame(focusFrameRef.current);
  }, []);

  const templates = useMemo(
    () => payload.componentNames.length > 0
      ? ALL_TEMPLATES
      : ALL_TEMPLATES.filter((template) => template.value !== 'components'),
    [payload.componentNames.length],
  );
  const pageWidth = Math.max(1, carouselWidth || windowWidth);
  const shortLayout = windowWidth > windowHeight
    || windowHeight < Math.max(640, 480 * fontScale);
  const maximumCardWidth = Math.max(1, pageWidth - 32);
  const minimumCardWidth = Math.min(216, maximumCardWidth);
  const measuredPreviewHeight = Math.max(0, bodyHeight - selectorHeight);
  const shortPreviewHeight = Math.max(0, windowHeight - headerHeight - footerHeight - 32);
  const preferredCardWidth = shortLayout
    ? Math.min(320, Math.max(minimumCardWidth, shortPreviewHeight * 0.8))
    : Math.max(minimumCardWidth, measuredPreviewHeight * 0.8);
  const cardWidth = Math.min(maximumCardWidth, preferredCardWidth);
  const cardHeight = cardWidth * 1.25;
  const selectorContentWidth = Math.max(
    maximumCardWidth,
    templates.length * Math.max(112, Math.ceil(88 * fontScale)),
  );
  const busy = operation != null;
  const navigationDisabled = busy || carouselTransitioning;
  const selectedReady = readiness[selectedTemplate] && cardRefs.current[selectedTemplate] != null;
  const actionsDisabled = navigationDisabled || photoUnavailable || !selectedReady;

  const focusComposerHeading = () => {
    if (initialFocusDoneRef.current || !headingRef.current) return;
    initialFocusDoneRef.current = true;
    focusFrameRef.current = requestAnimationFrame(() => {
      if (headingRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(headingRef.current, 'focus');
      }
      focusFrameRef.current = null;
    });
  };

  const changeTemplate = (template: MealShareTemplateId) => {
    if (navigationDisabled) return;
    const index = templates.findIndex((item) => item.value === template);
    if (index < 0) return;
    if (reducedMotion) {
      scrollRef.current?.scrollTo({ x: index * pageWidth, animated: false });
      setSelectedTemplate(template);
      return;
    }
    setCarouselTransitioning(true);
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const beginOperation = (nextOperation: Exclude<Operation, null>): boolean => {
    if (operationRef.current != null || actionsDisabled) return false;
    operationRef.current = nextOperation;
    onBusyChange(true);
    setOperation(nextOperation);
    return true;
  };

  const endOperation = () => {
    operationRef.current = null;
    onBusyChange(false);
    setOperation(null);
  };

  const captureSelected = async (): Promise<{ capturedUri: string; cacheUri: string }> => {
    const card = cardRefs.current[selectedTemplate];
    if (!card || !readiness[selectedTemplate] || photoUnavailable) {
      throw new Error('Selected meal card is not ready');
    }
    let capturedUri: string | null = null;
    let cacheUri: string | null = null;
    try {
      const pixelRatio = PixelRatio.get();
      capturedUri = await captureRef(card, {
        result: 'tmpfile',
        format: 'jpg',
        quality: 0.95,
        width: Platform.OS === 'ios' ? 1080 / pixelRatio : 1080,
        height: Platform.OS === 'ios' ? 1350 / pixelRatio : 1350,
      });
      const cacheFile = new File(Paths.cache, `eatlog-meal-${Date.now()}.jpg`);
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
    if (!beginOperation('capture-save')) return;
    let capturedUri: string | null = null;
    let cacheUri: string | null = null;
    try {
      let permission;
      try {
        permission = await MediaLibrary.requestPermissionsAsync(true, []);
      } catch {
        console.error('[meal-sharing:save] permission request failed');
        Alert.alert('Couldn’t save the meal image.', 'Try again.');
        return;
      }
      if (!permission.granted) {
        if (!permission.canAskAgain) {
          Alert.alert(
            'Photo access is off',
            'Open Settings to allow Eatlog to save meal images.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open settings', onPress: () => void Linking.openSettings() },
            ],
          );
        }
        return;
      }

      try {
        const captured = await captureSelected();
        capturedUri = captured.capturedUri;
        cacheUri = captured.cacheUri;
      } catch {
        console.error('[meal-sharing:capture] failed');
        Alert.alert('Couldn’t create the meal image.', 'Try again.');
        return;
      }

      try {
        await MediaLibrary.saveToLibraryAsync(cacheUri);
        setSaveConfirmationId((current) => current + 1);
        AccessibilityInfo.announceForAccessibility('Meal image saved.');
      } catch {
        console.error('[meal-sharing:save] failed');
        Alert.alert('Couldn’t save the meal image.', 'Try again.');
      }
    } finally {
      if (capturedUri) releaseCapture(capturedUri);
      deleteCacheFile(capturedUri);
      deleteCacheFile(cacheUri);
      endOperation();
    }
  };

  const handleShare = async () => {
    if (!beginOperation('capture-share')) return;
    let capturedUri: string | null = null;
    let cacheUri: string | null = null;
    try {
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('Sharing isn’t available on this device.');
        return;
      }
      try {
        const captured = await captureSelected();
        capturedUri = captured.capturedUri;
        cacheUri = captured.cacheUri;
      } catch {
        console.error('[meal-sharing:capture] failed');
        Alert.alert('Couldn’t create the meal image.', 'Try again.');
        return;
      }

      try {
        await Sharing.shareAsync(cacheUri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Share meal',
          UTI: 'public.jpeg',
        });
      } catch {
        console.error('[meal-sharing:share] failed');
        Alert.alert('Couldn’t share the meal image.', 'Try again.');
      }
    } catch {
      console.error('[meal-sharing:share] availability check failed');
      Alert.alert('Sharing isn’t available on this device.');
    } finally {
      if (capturedUri) releaseCapture(capturedUri);
      deleteCacheFile(capturedUri);
      deleteCacheFile(cacheUri);
      endOperation();
    }
  };

  const carousel = (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      scrollEnabled={!busy}
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      style={shortLayout ? { height: cardHeight, flexGrow: 0, marginVertical: 12 } : { flex: 1 }}
      scrollEventThrottle={16}
      onScroll={(event) => {
        const index = Math.max(0, Math.min(
          templates.length - 1,
          Math.round(event.nativeEvent.contentOffset.x / pageWidth),
        ));
        const visibleTemplate = templates[index].value;
        setSelectedTemplate((current) => current === visibleTemplate ? current : visibleTemplate);
      }}
      onScrollBeginDrag={() => setCarouselTransitioning(true)}
      onMomentumScrollEnd={(event) => {
        const index = Math.max(0, Math.min(
          templates.length - 1,
          Math.round(event.nativeEvent.contentOffset.x / pageWidth),
        ));
        setSelectedTemplate(templates[index].value);
        setCarouselTransitioning(false);
      }}
      onScrollEndDrag={(event) => {
        if (event.nativeEvent.velocity?.x === 0) {
          const index = Math.max(0, Math.min(
            templates.length - 1,
            Math.round(event.nativeEvent.contentOffset.x / pageWidth),
          ));
          setSelectedTemplate(templates[index].value);
          setCarouselTransitioning(false);
        }
      }}
      onContentSizeChange={() => {
        const index = templates.findIndex((template) => template.value === selectedTemplate);
        if (index >= 0) scrollRef.current?.scrollTo({ x: index * pageWidth, animated: false });
        setCarouselTransitioning(false);
      }}
    >
      {templates.map((template) => {
        const selected = template.value === selectedTemplate;
        return (
          <View
            key={template.value}
            accessible={selected}
            accessibilityRole={selected ? 'image' : undefined}
            accessibilityLabel={selected
              ? getMealSharePreviewAccessibilityLabel(payload, template.value)
              : undefined}
            accessibilityElementsHidden={!selected}
            importantForAccessibility={selected ? 'yes' : 'no-hide-descendants'}
            className="items-center justify-center"
            style={{ width: pageWidth, height: shortLayout ? cardHeight : '100%' }}
          >
            <MealShareCard
              payload={payload}
              template={template.value}
              width={cardWidth}
              height={cardHeight}
              setRef={(view) => { cardRefs.current[template.value] = view; }}
              onPhotoLoad={() => setReadiness((current) => ({ ...current, [template.value]: true }))}
              onPhotoError={() => setPhotoUnavailable(true)}
            />
          </View>
        );
      })}
    </ScrollView>
  );

  const templateSelector = (
    <View
      className="px-4 pb-2"
      onLayout={(event) => setSelectorHeight(event.nativeEvent.layout.height)}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: selectorContentWidth }}
      >
        <View style={{ width: selectorContentWidth }}>
          <SegmentedControl
            options={templates}
            value={selectedTemplate}
            onChange={changeTemplate}
            disabled={navigationDisabled}
          />
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View className="flex-1 bg-m3-surface">
      <View
        className="min-h-[64px] flex-row items-center px-2 py-2"
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
      >
        <Pressable
          onPress={onLeadingPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={leadingAction === 'back' ? 'Back to photo' : 'Close share meal'}
          accessibilityState={{ disabled: busy }}
          className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name={leadingAction === 'back' ? 'arrow-back' : 'close'} size={24} color={M3.onSurface} />
        </Pressable>
        <View
          ref={headingRef}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`Share meal. ${selectedTemplate === 'summary' ? 'Summary' : selectedTemplate === 'macros' ? 'Macros' : 'Components'} template selected.`}
          onLayout={focusComposerHeading}
          className="flex-1 items-center"
        >
          <Text className="text-center text-base font-semibold text-m3-on-surface">Share meal</Text>
        </View>
        <View className="h-12 w-12" />
      </View>

      <View
        className="flex-1"
        onLayout={(event) => {
          const { height, width } = event.nativeEvent.layout;
          setBodyHeight(height);
          if (width !== carouselWidth) {
            setCarouselTransitioning(true);
            setCarouselWidth(width);
          }
        }}
        accessibilityState={{ busy: !photoUnavailable && (busy || carouselTransitioning || !selectedReady) }}
      >
        {photoUnavailable ? (
          <View className="flex-1 items-center justify-center px-8 gap-3">
            <MaterialIcons name="broken-image" size={36} color={M3.onSurfaceVariant} />
            <Text className="text-center text-sm text-m3-on-surface-variant">This meal photo is no longer available.</Text>
          </View>
        ) : shortLayout ? (
          <ScrollView
            className="flex-1"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {carousel}
            {templateSelector}
          </ScrollView>
        ) : (
          <>
            {carousel}
            {templateSelector}
          </>
        )}
      </View>

      {saveConfirmationId > 0 && (
        <View
          className="absolute left-4 right-4 z-10"
          style={{ bottom: footerHeight + 12 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <LogToast
            key={saveConfirmationId}
            message="Meal image saved."
            tone="success"
            onHide={() => setSaveConfirmationId(0)}
          />
        </View>
      )}

      <View
        className="flex-row gap-3 px-4 pt-3 border-t border-m3-outline-variant bg-m3-surface-container-low"
        style={{ paddingBottom: insets.bottom + 12 }}
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
      >
        <Pressable
          onPress={() => void handleSave()}
          disabled={actionsDisabled}
          accessibilityRole="button"
          accessibilityLabel="Save image"
          accessibilityHint="Saves the selected meal image to your photo library"
          accessibilityState={{ disabled: actionsDisabled, busy: !photoUnavailable && (operation === 'capture-save' || !selectedReady) }}
          className={`flex-1 min-h-[52px] flex-row items-center justify-center gap-2 rounded-full bg-m3-secondary-container px-4 py-2 active:opacity-80 ${actionsDisabled ? 'opacity-40' : ''}`}
        >
          {operation === 'capture-save'
            ? <ActivityIndicator color={M3.onSecondaryContainer} />
            : <MaterialIcons name="download" size={20} color={M3.onSecondaryContainer} />}
          {operation !== 'capture-save' && <Text className="text-center text-sm font-bold text-m3-on-secondary-container">Save image</Text>}
        </Pressable>
        <Pressable
          onPress={() => void handleShare()}
          disabled={actionsDisabled}
          accessibilityRole="button"
          accessibilityLabel="Share"
          accessibilityHint="Opens the system share sheet with the selected meal image"
          accessibilityState={{ disabled: actionsDisabled, busy: !photoUnavailable && (operation === 'capture-share' || !selectedReady) }}
          className={`flex-1 min-h-[52px] flex-row items-center justify-center gap-2 rounded-full bg-m3-primary px-4 py-2 active:opacity-90 ${actionsDisabled ? 'opacity-40' : ''}`}
        >
          {operation === 'capture-share'
            ? <ActivityIndicator color={M3.onPrimary} />
            : <MaterialIcons name="share" size={20} color={M3.onPrimary} />}
          {operation !== 'capture-share' && <Text className="text-center text-sm font-bold text-m3-on-primary">Share</Text>}
        </Pressable>
      </View>
    </View>
  );
}
