import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import AiChoiceContent from '../components/ai/AiChoiceContent';
import KeySetupContent, { type KeySetupMode } from '../components/ai/KeySetupContent';
import { useSheetDialog } from '../components/SheetDialog';
import { clearFoodEstimateActions } from '../services/foodScan';
import { TIER_NAMES } from '../services/tierNames';
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

  // Gaining Itik moves a saved key's route to Eatlog AI. An unsettled plan says nothing either way.
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

  const finishSetup = useCallback((saved: boolean) => {
    const current = presentedRef.current;
    if (current?.kind !== 'setup') return;
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
      <Modal
        visible={presented !== null}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={dismiss}
      >
        <SafeAreaView className="flex-1 bg-m3-surface" accessibilityViewIsModal>
          {presented?.kind === 'choice' ? (
            <AiChoiceContent
              scrollable
              onUseKey={chooseKeyFromChoice}
              onEatlogAi={() => finishChoice('plans')}
              onNotNow={() => finishChoice('dismissed')}
            />
          ) : presented?.kind === 'setup' ? (
            <KeySetupContent
              mode={presented.mode}
              itik={hasItik}
              onSaved={() => finishSetup(true)}
              onCancel={() => finishSetup(false)}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </AiSetupContext.Provider>
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
        title: `${TIER_NAMES.itik} has ended`,
        message: `Keep estimating with your Google key, or get ${TIER_NAMES.itik} again.`,
        actions: [
          { label: 'Use my key', tone: 'primary', onPress: () => resolve('key') },
          { label: 'See plans', tone: 'neutral', onPress: () => resolve('plans') },
          { label: 'Not now', tone: 'cancel', onPress: () => resolve('none') },
        ],
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
