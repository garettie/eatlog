import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { serviceConfig } from '../config/services';
import { createBillingClient } from '../services/billing';
import {
  hasPaidFeatures,
  shouldApplyAccessUpdate,
  type BillingActionResult,
  type BillingOffering,
  type EatlogAccess,
  type EatlogUsage,
} from '../services/billing.types';
import { getInstallationToken } from '../services/installIdentity';
import { setAdaptiveAccess } from '../services/adaptiveAccess';
import { createSubscriptionApi, setLocalAccessForAi } from '../services/subscriptionApi';

interface EntitlementContextValue {
  access: EatlogAccess;
  offering: BillingOffering | null;
  usage: EatlogUsage;
  supportId: string | null;
  loadingProducts: boolean;
  refreshing: boolean;
  hasPaidFeatures: boolean;
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
  const [access, setAccess] = useState<EatlogAccess>(initialAccess);
  const accessRef = useRef(access);
  const [offering, setOffering] = useState<BillingOffering | null>(null);
  const [usage, setUsage] = useState<EatlogUsage>({ kind: 'none' });
  const [supportId, setSupportId] = useState<string | null>(null);
  const supportIdRef = useRef<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshPromise = useRef<Promise<void> | null>(null);

  const applyAccess = useCallback((value: EatlogAccess) => {
    if (!shouldApplyAccessUpdate(accessRef.current, value)) return false;
    accessRef.current = value;
    setAccess(value);
    setLocalAccessForAi(value);
    setAdaptiveAccess(value.kind !== 'pugo');
    return true;
  }, []);

  const refreshAccess = useCallback(async (forceStore: boolean) => {
    if (refreshPromise.current) return refreshPromise.current;
    const pending = (async () => {
      setRefreshing(true);
      try {
        const installId = supportIdRef.current ?? await getInstallationToken();
        if (supportIdRef.current === null) {
          supportIdRef.current = installId;
          setSupportId(installId);
        }
        const local = await billing.customerInfo(forceStore);
        applyAccess(local);
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
  }, [applyAccess, billing, subscriptionApi]);

  const refresh = useCallback(() => refreshAccess(true), [refreshAccess]);

  useEffect(() => {
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
    offering,
    usage,
    supportId,
    loadingProducts,
    refreshing,
    hasPaidFeatures: hasPaidFeatures(access),
    refresh,
    purchase,
    restore,
    manageSubscription: billing.manageSubscription,
  }), [access, billing.manageSubscription, loadingProducts, offering, purchase, refresh, refreshing, restore, supportId, usage]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const value = React.useContext(EntitlementContext);
  if (!value) throw new Error('Entitlement state is unavailable.');
  return value;
}
