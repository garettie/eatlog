import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { serviceConfig } from '../config/services';
import { createBillingClient } from '../services/billing';
import {
  entitlementStatus,
  hasPaidFeatures,
  shouldApplyAccessUpdate,
  type BillingActionResult,
  type BillingOffering,
  type EatlogAccess,
  type EatlogUsage,
  type EntitlementStatus,
} from '../services/billing.types';
import { getInstallationToken } from '../services/installIdentity';
import { setAdaptiveAccess } from '../services/adaptiveAccess';
import { createSubscriptionApi, setLocalAccessForAi } from '../services/subscriptionApi';

interface EntitlementContextValue {
  access: EatlogAccess | null;
  status: EntitlementStatus;
  offering: BillingOffering | null;
  usage: EatlogUsage;
  supportId: string | null;
  loadingProducts: boolean;
  refreshing: boolean;
  hasPaidFeatures: boolean;
  ensurePaidAccess(): Promise<boolean>;
  refresh(): Promise<void>;
  purchase(tier: 'manok' | 'itik'): Promise<BillingActionResult>;
  restore(): Promise<BillingActionResult>;
  manageSubscription(): Promise<BillingActionResult>;
}

const initialAccess: EatlogAccess = {
  kind: 'pugo',
  checkedAt: new Date(0).toISOString(),
  reason: 'unavailable',
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const billing = useMemo(() => createBillingClient({ apiKey: serviceConfig.revenueCatApiKey }), []);
  const subscriptionApi = useMemo(() => createSubscriptionApi({ workerUrl: serviceConfig.foodWorkerUrl }), []);
  const [access, setAccess] = useState<EatlogAccess | null>(null);
  const accessRef = useRef(initialAccess);
  const [offering, setOffering] = useState<BillingOffering | null>(null);
  const [usage, setUsage] = useState<EatlogUsage>({ kind: 'none' });
  const [supportId, setSupportId] = useState<string | null>(null);
  const supportIdRef = useRef<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const accessPromise = useRef<Promise<EatlogAccess> | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);

  const applyAccess = useCallback((value: EatlogAccess) => {
    if (!shouldApplyAccessUpdate(accessRef.current, value)) return false;
    accessRef.current = value;
    setAccess(value);
    setLocalAccessForAi(value);
    setAdaptiveAccess(value.kind !== 'pugo');
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

  const ensurePaidAccess = useCallback(async () => {
    if (access === null) await resolveAccess(false);
    return hasPaidFeatures(accessRef.current);
  }, [access, resolveAccess]);

  const refreshAccess = useCallback(async (forceStore: boolean) => {
    if (refreshPromise.current) return refreshPromise.current;
    const pending = (async () => {
      setRefreshing(true);
      try {
        const accessRequest = resolveAccess(forceStore);
        const installId = supportIdRef.current ?? await getInstallationToken();
        if (supportIdRef.current === null) {
          supportIdRef.current = installId;
          setSupportId(installId);
        }
        await accessRequest;
        const products = await billing.offering();
        setOffering(products);
        if (accessRef.current.kind !== 'pugo') {
          try {
            const remote = await subscriptionApi.refresh(installId);
            setUsage(remote.usage ?? { kind: 'none' });
          } catch {
            setUsage({ kind: 'none' });
          }
        } else {
          setUsage({ kind: 'none' });
        }
      } catch {
        setUsage({ kind: 'none' });
      } finally {
        setLoadingProducts(false);
        setRefreshing(false);
      }
    })();
    refreshPromise.current = pending.finally(() => { refreshPromise.current = null; });
    return refreshPromise.current;
  }, [billing, resolveAccess, subscriptionApi]);

  const refresh = useCallback(() => refreshAccess(true), [refreshAccess]);

  useEffect(() => {
    setLocalAccessForAi(null);
    setAdaptiveAccess(false);
    void refreshAccess(false);
    let unsubscribe: (() => void) | undefined;
    void billing.subscribe((next) => {
      const applied = applyAccess(next);
      if (applied && next.kind !== 'pugo') void refreshAccess(false);
    }).then((remove) => { unsubscribe = remove; }).catch(() => {});
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshAccess(false);
    });
    return () => { unsubscribe?.(); appState.remove(); };
  }, [applyAccess, billing, refreshAccess]);

  const purchase = useCallback(async (tier: 'manok' | 'itik') => {
    const result = await billing.purchase(tier, accessRef.current);
    applyAccess(result.access);
    if (result.state === 'success' || result.state === 'entitlement-pending') await refreshAccess(false);
    return { state: result.state, message: result.message };
  }, [applyAccess, billing, refreshAccess]);

  const restore = useCallback(async () => {
    const result = await billing.restore(accessRef.current);
    applyAccess(result.access);
    await refreshAccess(false);
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
    refresh,
    purchase,
    restore,
    manageSubscription: billing.manageSubscription,
  }), [access, billing.manageSubscription, ensurePaidAccess, loadingProducts, offering, purchase, refresh, refreshing, restore, supportId, usage]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const value = React.useContext(EntitlementContext);
  if (!value) throw new Error('Entitlement state is unavailable.');
  return value;
}
