import React, { createContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import AiChoiceContent from '../components/ai/AiChoiceContent';
import KeySetupContent, { type KeySetupMode } from '../components/ai/KeySetupContent';
import { useSheetDialog } from '../components/SheetDialog';
import { DURATION, EASING } from '../theme/motion';
import { clearFoodEstimateActions } from '../services/foodScan';
import { planName } from '../services/tierNames';
import { decideAiGate, userApiKeyStore, type AiRoute, type UserKeyState } from '../services/userApiKey';
import { useEntitlement } from './EntitlementContext';
import { useRemoteEstimateConsent } from './RemoteEstimateConsentContext';

type AiChoiceOutcome = 'key-saved' | 'plans' | 'dismissed';

interface AiSetupContextValue {
  keyState: UserKeyState;
  /** Resolves true once a key is saved (add) or replaced (replace). */
  openKeySetup(mode: KeySetupMode): Promise<boolean>;
  /** Pugo's setup: their own key, Itik, or not now. Nothing is sent either way. */
  openAiChoice(): Promise<AiChoiceOutcome>;
  /** Throws when the credential store refuses; the key then stays saved and in use. */
  removeKey(): Promise<void>;
  setRoute(route: AiRoute): Promise<void>;
}

type Presented =
  | { kind: 'choice'; resolve: (outcome: AiChoiceOutcome) => void }
  | { kind: 'setup'; mode: KeySetupMode; resolve: (saved: boolean) => void; fromChoice?: (outcome: AiChoiceOutcome) => void };

const AiSetupContext = createContext<AiSetupContextValue | null>(null);

export function AiSetupProvider({ children }: { children: React.ReactNode }) {
  const { status, hasItik } = useEntitlement();
  const [keyState, setKeyState] = useState<UserKeyState>(userApiKeyStore.getState());
  const [presented, setPresented] = useState<Presented | null>(null);
  const presentedRef = useRef<Presented | null>(null);

  useEffect(() => {
    const unsubscribe = userApiKeyStore.subscribe(setKeyState);
    void userApiKeyStore.load().then(setKeyState);
    return unsubscribe;
  }, []);

  // Entitlement changes update the observed plan without changing the selected AI route.
  useEffect(() => {
    if (status === 'checking') return;
    void userApiKeyStore.observeItik(hasItik);
  }, [hasItik, status]);

  const present = useCallback((next: Presented | null) => {
    presentedRef.current = next;
    setPresented(next);
  }, []);

  /** A second request replaces the first, which settles as dismissed rather than hanging. */
  const settleCurrent = useCallback(() => {
    const current = presentedRef.current;
    if (current?.kind === 'setup') {
      current.resolve(false);
      current.fromChoice?.('dismissed');
    } else {
      current?.resolve('dismissed');
    }
  }, []);

  const openKeySetup = useCallback((mode: KeySetupMode) => new Promise<boolean>((resolve) => {
    settleCurrent();
    present({ kind: 'setup', mode, resolve });
  }), [present, settleCurrent]);

  const openAiChoice = useCallback(() => new Promise<AiChoiceOutcome>((resolve) => {
    settleCurrent();
    present({ kind: 'choice', resolve });
  }), [present, settleCurrent]);

  const finishSetup = useCallback(async (saved: boolean) => {
    const current = presentedRef.current;
    if (current?.kind !== 'setup') return;
    if (presentedRef.current !== current) return;
    present(null);
    current.resolve(saved);
    current.fromChoice?.(saved ? 'key-saved' : 'dismissed');
  }, [present]);

  const finishChoice = useCallback((outcome: AiChoiceOutcome) => {
    const current = presentedRef.current;
    if (current?.kind !== 'choice') return;
    present(null);
    current.resolve(outcome);
  }, [present]);

  const chooseKeyFromChoice = useCallback(() => {
    const current = presentedRef.current;
    if (current?.kind !== 'choice') return;
    present({ kind: 'setup', mode: 'add', resolve: () => undefined, fromChoice: current.resolve });
  }, [present]);

  const removeKey = useCallback(async () => {
    await userApiKeyStore.remove();
    // Estimates still running on the removed key are discarded, not delivered.
    clearFoodEstimateActions();
  }, []);

  const value = useMemo<AiSetupContextValue>(() => ({
    keyState,
    openKeySetup,
    openAiChoice,
    removeKey,
    setRoute: userApiKeyStore.setRoute,
  }), [keyState, openAiChoice, openKeySetup, removeKey]);

  const dismiss = useCallback(() => {
    if (presentedRef.current?.kind === 'setup') finishSetup(false);
    else finishChoice('dismissed');
  }, [finishChoice, finishSetup]);

  return (
    <AiSetupContext.Provider value={value}>
      {children}
      <AiSetupModal
        presented={presented}
        hasItik={hasItik}
        onDismiss={dismiss}
        onUseKey={chooseKeyFromChoice}
        onEatlogAi={() => finishChoice('plans')}
        onNotNow={() => finishChoice('dismissed')}
        onSetupDone={finishSetup}
      />
    </AiSetupContext.Provider>
  );
}

/** The opaque surface, padded clear of the status and navigation bars of the modal's window. */
function InsetSurface({
  style,
  interactive,
  children,
}: {
  style: ReturnType<typeof useAnimatedStyle>;
  interactive: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      style={[style, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}
      pointerEvents={interactive ? 'auto' : 'none'}
      accessibilityViewIsModal
      className="flex-1 bg-m3-surface"
    >
      {children}
    </Animated.View>
  );
}

/** Matches the onboarding step offset, so setup moves like one more step. */
const STEP_OFFSET = 28;

/** Which screen a presentation shows; a change of screen runs the exit and entrance. */
function screenOf(presented: Presented): string {
  return presented.kind === 'setup' ? `setup:${presented.mode}` : 'choice';
}

/**
 * The full-screen AI setup surface. It moves exactly like an onboarding step: opening arrives from
 * the forward side, closing leaves like Back, and moving from the choice to key setup exits the
 * choice, swaps while nothing is visible, then brings the new screen in from the forward side.
 */
function AiSetupModal({
  presented,
  hasItik,
  onDismiss,
  onUseKey,
  onEatlogAi,
  onNotNow,
  onSetupDone,
}: {
  presented: Presented | null;
  hasItik: boolean;
  onDismiss: () => void;
  onUseKey: () => void;
  onEatlogAi: () => void;
  onNotNow: () => void;
  onSetupDone: (saved: boolean) => void;
}) {
  const reduced = useReducedMotion();
  // What is on screen trails `presented` by the exit animation.
  const [shown, setShown] = useState<Presented | null>(presented);
  const presentedRef = useRef(presented);
  presentedRef.current = presented;
  // Onboarding's step motion: leave 28dp toward travel in 90ms, arrive from 28dp in 200ms.
  const surfaceX = useSharedValue(0);
  const surfaceOpacity = useSharedValue(presented ? 1 : 0);
  const contentX = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const swapping = useRef(false);

  const clearShown = useCallback(() => setShown(null), []);
  const swapToPresented = useCallback(() => setShown(presentedRef.current), []);

  const enter = useCallback((x: typeof surfaceX, opacity: typeof surfaceOpacity) => {
    x.value = withTiming(0, { duration: reduced ? 0 : DURATION.short, easing: EASING.emphasizedDecelerate });
    opacity.value = withTiming(1, { duration: reduced ? 0 : DURATION.short });
  }, [reduced]);

  useEffect(() => {
    if (!presented) {
      // Closing reads as Back: the surface leaves the way it came in.
      surfaceX.value = withTiming(STEP_OFFSET, { duration: reduced ? 0 : DURATION.exit, easing: EASING.emphasizedAccelerate });
      surfaceOpacity.value = withTiming(0, { duration: reduced ? 0 : DURATION.exit }, (finished) => {
        if (finished) runOnJS(clearShown)();
      });
      return;
    }
    if (!shown) {
      // Opening reads as the next step: it arrives from the forward side.
      setShown(presented);
      contentX.value = 0;
      contentOpacity.value = 1;
      surfaceX.value = STEP_OFFSET;
      surfaceOpacity.value = 0;
      enter(surfaceX, surfaceOpacity);
      return;
    }
    // A presentation arriving during the close takes the surface back instead of losing it.
    enter(surfaceX, surfaceOpacity);
    if (screenOf(shown) === screenOf(presented)) {
      setShown(presented);
      return;
    }
    swapping.current = true;
    contentX.value = withTiming(-STEP_OFFSET, { duration: reduced ? 0 : DURATION.exit, easing: EASING.emphasizedAccelerate });
    contentOpacity.value = withTiming(0, { duration: reduced ? 0 : DURATION.exit }, (finished) => {
      if (finished) runOnJS(swapToPresented)();
    });
    // `shown` is deliberately left out: this reacts to new presentations, not to its own swaps.
  }, [presented]);

  // The new screen has rendered while invisible; only now does it enter.
  const shownScreen = shown ? screenOf(shown) : null;
  useLayoutEffect(() => {
    if (shownScreen === null || !swapping.current) return;
    swapping.current = false;
    contentX.value = STEP_OFFSET;
    enter(contentX, contentOpacity);
  }, [contentOpacity, contentX, enter, shownScreen]);

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: surfaceOpacity.value,
    transform: [{ translateX: surfaceX.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateX: contentX.value }],
  }));

  return (
    <Modal
      visible={shown !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onDismiss}
    >
      {/* The modal is its own window: its insets come from a provider inside it. */}
      <SafeAreaProvider>
        <InsetSurface style={surfaceStyle} interactive={presented !== null}>
          {/* Keyed by screen so Add and Replace never share a half-typed field; it swaps while invisible. */}
          <Animated.View key={shown ? screenOf(shown) : 'none'} style={contentStyle} className="flex-1">
            {shown?.kind === 'choice' ? (
              <AiChoiceContent
                scrollable
                topBar={{ icon: 'close', label: 'Close. Continue without AI meal estimates.', onPress: onNotNow }}
                onUseKey={onUseKey}
                onEatlogAi={onEatlogAi}
                onNotNow={onNotNow}
              />
            ) : shown?.kind === 'setup' ? (
              <KeySetupContent
                mode={shown.mode}
                itik={hasItik}
                onSaved={() => onSetupDone(true)}
                onCancel={() => onSetupDone(false)}
              />
            ) : (
              <View className="flex-1" />
            )}
          </Animated.View>
        </InsetSurface>
      </SafeAreaProvider>
    </Modal>
  );
}

export function useAiSetup(): AiSetupContextValue {
  const value = React.useContext(AiSetupContext);
  if (!value) throw new Error('AI setup is unavailable.');
  return value;
}

/**
 * The one check every AI entry point makes before sending anything. It replaces asking for
 * hosted consent directly: My key never asks for it, and no one without a key or Itik is sent
 * anywhere. Resolves true when the estimate may start on the route the client will read.
 */
export function useAiGate(): () => Promise<boolean> {
  const { openAiChoice } = useAiSetup();
  const { ensurePaidAccess } = useEntitlement();
  const { requestConsent } = useRemoteEstimateConsent();
  const showDialog = useSheetDialog();
  const navigation = useNavigation<any>();

  return useCallback(async () => {
    const keyState = await userApiKeyStore.load();
    // My key never waits on RevenueCat.
    const paid = keyState.hasKey && keyState.route === 'my-key' ? 'free' : await ensurePaidAccess();
    const gate = decideAiGate(keyState, paid);
    if (gate === 'my-key') return true;
    if (gate === 'eatlog-ai') return requestConsent();
    if (gate === 'setup') {
      const outcome = await openAiChoice();
      if (outcome === 'plans') navigation.navigate('Paywall');
      return outcome === 'key-saved';
    }
    const choice = await new Promise<'key' | 'plans' | 'none'>((resolve) => {
      showDialog({
        title: `${planName('itik')} isn't active`,
        message: 'Your Google key is still saved. You can use it for estimates or check your purchase.',
        actions: [
          { label: 'See plans', tone: 'neutral', onPress: () => resolve('plans') },
          { label: 'Use my key', tone: 'primary', onPress: () => resolve('key') },
        ],
        onDismiss: () => resolve('none'),
      });
    });
    if (choice === 'plans') navigation.navigate('Paywall');
    if (choice !== 'key') return false;
    try {
      await userApiKeyStore.setRoute('my-key');
    } catch {
      return false;
    }
    return true;
  }, [ensurePaidAccess, navigation, openAiChoice, requestConsent, showDialog]);
}
