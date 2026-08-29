import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { serviceConfig } from '../config/services';
import { createBillingClient } from '../services/billing';
import {
  entitlementStatus,
  hasPaidFeatures,
  needsRevalidation,
  PAID_ACCESS_UNAVAILABLE_MESSAGE,
  paidAndSettled,
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
  restorePaidAccess,
  setLocalAccessForAi,
  setPaidAccessStore,
} from '../services/subscriptionApi';

/**
 * `ok` resolved the plan and its usage counters, `partial` resolved the plan but not the
 * counters, and `failed` could not establish the plan at all. Callers must be able to tell
 * these apart: a refresh that quietly resolves on failure reports success it never had.
 */
export type RefreshOutcome = 'ok' | 'partial' | 'failed';

const FOREGROUND_REFRESH_INTERVAL_MS = 60 * 1000;

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
  warmEntitlement(): void;
  refresh(): Promise<RefreshOutcome>;
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
  /** Whether RevenueCat has given a real answer this session, as opposed to a restored one. */
  const accessConfirmed = useRef(false);
  const refreshPromise = useRef<Promise<RefreshOutcome> | null>(null);
  const lastRefreshAt = useRef(0);
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
      const transient = local.kind === 'pugo'
        && (local.reason === 'unavailable' || local.reason === 'malformed');
      if (!transient) accessConfirmed.current = true;
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
        return true;
      } catch {
        // Keep the last known counters. Blanking them reads as "your quota is gone" when the
        // only thing that actually happened is that this one request did not land.
        return false;
      }
    })();
    remoteAccessPromise.current = pending.finally(() => { remoteAccessPromise.current = null; });
    return remoteAccessPromise.current;
  }, [resolveSupportId, subscriptionApi]);

  /**
   * Trust runs one way. A stored paid plan is good until its own expiry date, so it answers
   * immediately and never puts a network round trip in front of a user who opened the app to
   * take one photo. A stored free plan is only last session's answer, so it is re-checked
   * before it is allowed to turn anyone away — otherwise a lapsed subscriber who resubscribed,
   * or someone who bought on another device, meets a paywall they already paid to skip.
   */
  const ensurePaidAccess = useCallback(async (): Promise<PaidAccessDecision> => {
    const stored = accessRef.current;
    if (stored !== null && hasPaidFeatures(stored)) return 'paid';
    if (needsRevalidation(stored, accessConfirmed.current)) await resolveAccess(false);
    const status = entitlementStatus(accessRef.current);
    return status === 'checking' ? 'unavailable' : status;
  }, [resolveAccess]);

  // Initial estimates never gate on entitlement: Pugo includes them and the Worker owns the
  // quota. This only starts an unresolved lookup so the re-estimate path and the plan screen
  // have an answer ready.
  const warmEntitlement = useCallback((): void => {
    if (needsRevalidation(accessRef.current, accessConfirmed.current)) void resolveAccess(false);
  }, [resolveAccess]);

  const refreshAccess = useCallback((forceStore: boolean): Promise<RefreshOutcome> => {
    if (refreshPromise.current) return refreshPromise.current;
    const pending = (async (): Promise<RefreshOutcome> => {
      setRefreshing(true);
      try {
        const accessRequest = resolveAccess(forceStore);
        await resolveSupportId();
        await accessRequest;
        const current = accessRef.current;
        const resolved = current !== null && entitlementStatus(current) !== 'checking';
        const remoteRequest = resolved ? refreshRemoteAccess(forceStore) : null;
        // Without a resolved plan there is no subject to attribute usage to, so the counters
        // are genuinely unknown rather than merely stale.
        if (remoteRequest === null) setUsage({ kind: 'none' });
        setOffering(await billing.offering());
        if (remoteRequest === null) return 'failed';
        return await remoteRequest ? 'ok' : 'partial';
      } catch {
        return 'failed';
      } finally {
        lastRefreshAt.current = Date.now();
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
      // Returning from the camera, a permission dialog, or the store sheet all count as a
      // foreground. Rate-limit them to the entitlement cache lifetime the Worker already uses.
      if (state !== 'active' || Date.now() - lastRefreshAt.current < FOREGROUND_REFRESH_INTERVAL_MS) return;
      // A settled subscription is not re-verified on every return to the app. RevenueCat's own
      // update listener still delivers renewals, cancellations, and revocations as they happen.
      if (paidAndSettled(accessRef.current)) return;
      void refreshAccess(false);
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
    warmEntitlement,
    refresh,
    purchase,
    restore,
    manageSubscription: billing.manageSubscription,
  }), [access, warmEntitlement, billing.manageSubscription, ensurePaidAccess, loadingProducts, offering, purchase, refresh, refreshing, restore, supportId, usage]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const value = React.useContext(EntitlementContext);
  if (!value) throw new Error('Entitlement state is unavailable.');
  return value;
}
