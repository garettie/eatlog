import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { serviceConfig } from '../config/services';
import { createBillingClient } from '../services/billing';
import {
  entitlementStatus,
  hasPaidFeatures,
  PAID_ACCESS_UNAVAILABLE_MESSAGE,
  shouldApplyAccessUpdate,
  type BillingActionResult,
  type BillingOffering,
  type EatlogAccess,
  type EatlogUsage,
  type EntitlementStatus,
  type PaidAccessDecision,
} from '../services/billing.types';
import { getInstallationToken } from '../services/installIdentity';
import { setAdaptiveAccess } from '../services/adaptiveAccess';
import {
  createSubscriptionApi,
  documentPaidAccessStore,
  getAiAuthorization,
  restorePaidAccess,
  setLocalAccessForAi,
  setPaidAccessStore,
} from '../services/subscriptionApi';

interface EntitlementContextValue {
  access: EatlogAccess | null;
  status: EntitlementStatus;
  offering: BillingOffering | null;
  usage: EatlogUsage;
  supportId: string | null;
  loadingProducts: boolean;
  refreshing: boolean;
  hasPaidFeatures: boolean;
  ensurePaidAccess(): Promise<PaidAccessDecision>;
  beginAiEstimate(operation: 'initial' | 'reestimate'): 'proceed' | 'upgrade' | 'unavailable';
  refresh(): Promise<void>;
  purchase(tier: 'manok' | 'itik'): Promise<BillingActionResult>;
  restore(): Promise<BillingActionResult>;
  manageSubscription(): Promise<BillingActionResult>;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const billing = useMemo(() => createBillingClient({ apiKey: serviceConfig.revenueCatApiKey }), []);
  const subscriptionApi = useMemo(() => createSubscriptionApi({ workerUrl: serviceConfig.foodWorkerUrl }), []);
  const [access, setAccess] = useState<EatlogAccess | null>(null);
  const accessRef = useRef<EatlogAccess | null>(null);
  const [offering, setOffering] = useState<BillingOffering | null>(null);
  const [usage, setUsage] = useState<EatlogUsage>({ kind: 'none' });
  const [supportId, setSupportId] = useState<string | null>(null);
  const supportIdRef = useRef<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const accessPromise = useRef<Promise<EatlogAccess | null> | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const supportIdPromise = useRef<Promise<string> | null>(null);
  const remoteAccessPromise = useRef<Promise<boolean> | null>(null);

  const applyAccess = useCallback((value: EatlogAccess) => {
    if (!shouldApplyAccessUpdate(accessRef.current, value)) return false;
    accessRef.current = value;
    setAccess(value);
    setLocalAccessForAi(value);
    setAdaptiveAccess(hasPaidFeatures(value));
    return true;
  }, []);

  const resolveAccess = useCallback((forceStore: boolean) => {
    if (accessPromise.current) return accessPromise.current;
    const pending = (async () => {
      const local = await billing.customerInfo(forceStore);
      applyAccess(local);
      return accessRef.current;
    })();
    accessPromise.current = pending.finally(() => { accessPromise.current = null; });
    return accessPromise.current;
  }, [applyAccess, billing]);

  const resolveSupportId = useCallback(() => {
    if (supportIdRef.current !== null) return Promise.resolve(supportIdRef.current);
    if (supportIdPromise.current) return supportIdPromise.current;
    const pending = getInstallationToken().then((installId) => {
      supportIdRef.current = installId;
      setSupportId(installId);
      return installId;
    });
    supportIdPromise.current = pending.finally(() => { supportIdPromise.current = null; });
    return supportIdPromise.current;
  }, []);

  const refreshRemoteAccess = useCallback((forceStore = false) => {
    if (remoteAccessPromise.current) return remoteAccessPromise.current;
    const pending = (async () => {
      try {
        const installId = await resolveSupportId();
        const remote = await subscriptionApi.refresh(installId, forceStore);
        setUsage(remote.usage ?? { kind: 'none' });
        return getAiAuthorization().ok;
      } catch {
        setUsage({ kind: 'none' });
        return false;
      }
    })();
    remoteAccessPromise.current = pending.finally(() => { remoteAccessPromise.current = null; });
    return remoteAccessPromise.current;
  }, [resolveSupportId, subscriptionApi]);

  const ensurePaidAccess = useCallback(async (): Promise<PaidAccessDecision> => {
    if (entitlementStatus(accessRef.current) === 'checking') await resolveAccess(false);
    const status = entitlementStatus(accessRef.current);
    return status === 'checking' ? 'unavailable' : status;
  }, [resolveAccess]);

  const beginAiEstimate = useCallback((
    operation: 'initial' | 'reestimate',
  ): 'proceed' | 'upgrade' | 'unavailable' => {
    const status = entitlementStatus(accessRef.current);
    if (operation === 'initial') {
      if (status === 'checking') void resolveAccess(false);
      return 'proceed';
    }
    if (status === 'checking') {
      void resolveAccess(false);
      return 'unavailable';
    }
    return status === 'free' ? 'upgrade' : 'proceed';
  }, [resolveAccess]);

  const refreshAccess = useCallback(async (forceStore: boolean) => {
    if (refreshPromise.current) return refreshPromise.current;
    const pending = (async () => {
      setRefreshing(true);
      try {
        const accessRequest = resolveAccess(forceStore);
        await resolveSupportId();
        await accessRequest;
        const current = accessRef.current;
        const remoteRequest = current !== null && entitlementStatus(current) !== 'checking'
          ? refreshRemoteAccess(forceStore)
          : null;
        if (remoteRequest === null) setUsage({ kind: 'none' });
        const products = await billing.offering();
        setOffering(products);
        if (remoteRequest !== null) await remoteRequest;
      } catch {
        setUsage({ kind: 'none' });
      } finally {
        setLoadingProducts(false);
        setRefreshing(false);
      }
    })();
    refreshPromise.current = pending.finally(() => { refreshPromise.current = null; });
    return refreshPromise.current;
  }, [billing, refreshRemoteAccess, resolveAccess, resolveSupportId]);

  const refresh = useCallback(() => refreshAccess(true), [refreshAccess]);

  useEffect(() => {
    setPaidAccessStore(documentPaidAccessStore());
    void (async () => {
      const restored = await restorePaidAccess().catch(() => null);
      if (restored) applyAccess(restored);
      await refreshAccess(false);
    })();
    let unsubscribe: (() => void) | undefined;
    void billing.subscribe((next) => {
      const applied = applyAccess(next);
      if (applied && entitlementStatus(next) !== 'checking') void refreshAccess(false);
    }).then((remove) => { unsubscribe = remove; }).catch(() => {});
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshAccess(false);
    });
    return () => { unsubscribe?.(); appState.remove(); };
  }, [applyAccess, billing, refreshAccess]);

  const purchase = useCallback(async (tier: 'manok' | 'itik') => {
    const current = accessRef.current;
    if (current === null || entitlementStatus(current) === 'checking') {
      return { state: 'failed' as const, message: PAID_ACCESS_UNAVAILABLE_MESSAGE };
    }
    const result = await billing.purchase(tier, current);
    applyAccess(result.access);
    if (result.state === 'success' || result.state === 'entitlement-pending') await refreshAccess(true);
    return { state: result.state, message: result.message };
  }, [applyAccess, billing, refreshAccess]);

  const restore = useCallback(async () => {
    const current = accessRef.current;
    if (current === null || entitlementStatus(current) === 'checking') {
      return { state: 'failed' as const, message: PAID_ACCESS_UNAVAILABLE_MESSAGE };
    }
    const result = await billing.restore(current);
    applyAccess(result.access);
    await refreshAccess(true);
    return { state: result.state, message: result.message };
  }, [applyAccess, billing, refreshAccess]);

  const value = useMemo<EntitlementContextValue>(() => ({
    access,
    status: entitlementStatus(access),
    offering,
    usage,
    supportId,
    loadingProducts,
    refreshing,
    hasPaidFeatures: access !== null && hasPaidFeatures(access),
    ensurePaidAccess,
    beginAiEstimate,
    refresh,
    purchase,
    restore,
    manageSubscription: billing.manageSubscription,
  }), [access, beginAiEstimate, billing.manageSubscription, ensurePaidAccess, loadingProducts, offering, purchase, refresh, refreshing, restore, supportId, usage]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const value = React.useContext(EntitlementContext);
  if (!value) throw new Error('Entitlement state is unavailable.');
  return value;
}
