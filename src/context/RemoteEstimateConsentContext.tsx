import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, SafeAreaView } from 'react-native';

import RemoteEstimateConsentContent from '../components/RemoteEstimateConsentContent';
import { clearFoodEstimateActions } from '../services/foodScan';
import {
  acceptRemoteEstimateConsent,
  declineRemoteEstimateConsent,
  getRemoteEstimateConsentDecision,
  type RemoteEstimateConsentDecision,
} from '../services/remoteEstimateConsent';
import { createRemoteEstimateConsentCoordinator } from '../services/remoteEstimateConsentCoordinator';

export interface RemoteEstimateConsentContextValue {
  decision: RemoteEstimateConsentDecision | null;
  requestConsent: () => Promise<boolean>;
  accept: () => Promise<boolean>;
  decline: () => Promise<void>;
  refresh: () => Promise<void>;
}

const RemoteEstimateConsentContext = createContext<RemoteEstimateConsentContextValue | null>(null);

export function RemoteEstimateConsentProvider({ children }: { children: React.ReactNode }) {
  const [decision, setDecision] = useState<RemoteEstimateConsentDecision | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const modalVisibleRef = useRef(false);
  const acceptingRef = useRef(false);

  const showModal = useCallback(() => {
    modalVisibleRef.current = true;
    setModalError(null);
    setModalVisible(true);
  }, []);

  const hideModal = useCallback(() => {
    modalVisibleRef.current = false;
    setModalVisible(false);
  }, []);

  const coordinator = useMemo(() => createRemoteEstimateConsentCoordinator({
    getDecision: getRemoteEstimateConsentDecision,
    accept: acceptRemoteEstimateConsent,
    decline: async () => {
      await declineRemoteEstimateConsent();
      // A withdrawn consent must not leave an estimate identity behind that a later request
      // could still be attached to.
      clearFoodEstimateActions();
    },
    onDecision: setDecision,
    onPresent: showModal,
    onClose: hideModal,
    onAcceptError: () => setModalError('Eatlog could not save your privacy choice. Nothing was sent. Try again.'),
  }), [hideModal, showModal]);

  useEffect(() => {
    void coordinator.refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void coordinator.refresh();
    });
    return () => subscription.remove();
  }, [coordinator]);

  const requestConsent = useCallback(() => coordinator.requestConsent(), [coordinator]);

  const accept = useCallback(async () => {
    if (acceptingRef.current) return false;
    acceptingRef.current = true;
    setAccepting(true);
    try {
      return await coordinator.accept();
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  }, [coordinator]);

  const decline = useCallback(async () => {
    if (acceptingRef.current) return;
    await coordinator.decline();
  }, [coordinator]);

  const handleDismiss = useCallback(() => {
    if (acceptingRef.current) return;
    void coordinator.dismiss();
  }, [coordinator]);

  const value = useMemo<RemoteEstimateConsentContextValue>(() => ({
    decision,
    requestConsent,
    accept,
    decline,
    refresh: async () => { await coordinator.refresh(); },
  }), [accept, coordinator.refresh, decision, decline, requestConsent]);

  return (
    <RemoteEstimateConsentContext.Provider value={value}>
      {children}
      <Modal
        visible={modalVisible}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={handleDismiss}
        onDismiss={() => {
          if (modalVisibleRef.current) handleDismiss();
        }}
      >
        <SafeAreaView className="flex-1 bg-m3-surface" accessibilityViewIsModal>
          <RemoteEstimateConsentContent
            scrollable
            busy={accepting}
            error={modalError}
            onAccept={() => { void accept(); }}
            onDecline={() => { void decline(); }}
          />
        </SafeAreaView>
      </Modal>
    </RemoteEstimateConsentContext.Provider>
  );
}

export function useRemoteEstimateConsent(): RemoteEstimateConsentContextValue {
  const value = React.useContext(RemoteEstimateConsentContext);
  if (!value) throw new Error('Remote estimate consent is unavailable.');
  return value;
}
