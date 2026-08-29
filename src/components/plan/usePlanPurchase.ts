import { useCallback, useMemo, useState } from 'react';

import { serviceConfig } from '../../config/services';
import { useEntitlement } from '../../context/EntitlementContext';
import { canBuyItik, hasPaidFeatures, type EatlogAccess } from '../../services/billing.types';

type PlanTier = 'manok' | 'itik';

/**
 * Purchase state shared by the interrupt paywall and the Profile plan screen.
 *
 * The CTA label depends on the selected tier and its price and on nothing else. Transient
 * conditions drive `busy` and the status line instead, so the button never renames itself
 * mid-decision, and a background refresh never disables it.
 */
export function usePlanPurchase(access: EatlogAccess | null) {
  const { offering, loadingProducts, purchase, refresh } = useEntitlement();
  const [selected, setSelected] = useState<PlanTier>('manok');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const manokActive = access?.kind === 'manok' || access?.kind === 'manok-trial';
  const paid = access !== null && hasPaidFeatures(access);
  // An active Manok subscriber can only move to Itik, so the selection is already settled.
  const selectedTier: PlanTier = manokActive ? 'itik' : selected;
  const product = selectedTier === 'manok' ? offering?.manok : offering?.itik;

  const itikBlocked = selectedTier === 'itik'
    && !serviceConfig.revenueCatTestStore
    && access !== null
    && !canBuyItik(access);
  const alreadyActive = selectedTier === 'itik' ? access?.kind === 'itik' : manokActive;
  const trialEligible = offering?.manok?.trialEligible === true;

  // Named by tier, priced when the price is known. The label never becomes a status line and
  // never becomes a retry control, so the button means the same thing every time it is read.
  const title = useMemo(() => {
    if (selectedTier === 'itik') return product ? `Buy lifetime · ${product.priceString}` : 'Buy lifetime';
    if (trialEligible) return 'Start free month';
    return product ? `Start monthly · ${product.priceString}` : 'Start monthly';
  }, [product, selectedTier, trialEligible]);

  const disabled = busy || loadingProducts || !product || alreadyActive || itikBlocked;

  const run = useCallback(async () => {
    if (busy || !product) return;
    setBusy(true);
    setMessage(null);
    try {
      setMessage((await purchase(selectedTier)).message);
    } catch {
      setMessage("The purchase didn't finish. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, product, purchase, selectedTier]);

  const retryStore = useCallback(() => {
    setMessage(null);
    void refresh();
  }, [refresh]);

  return {
    selected: selectedTier,
    setSelected,
    manokActive,
    paid,
    product,
    trialEligible,
    itikBlocked,
    alreadyActive,
    title,
    disabled,
    busy,
    loadingProducts,
    message,
    setMessage,
    run,
    retryStore,
    storeUnreachable: !loadingProducts && !offering?.manok && !offering?.itik,
    onePriceMissing: !loadingProducts && (!offering?.manok || !offering?.itik) && (!!offering?.manok || !!offering?.itik),
    manokPrice: offering?.manok
      ? `${offering.manok.priceString} / month`
      : loadingProducts ? 'Checking price…' : 'Price unavailable',
    manokDescription: trialEligible && offering?.manok
      ? `1 month free, then ${offering.manok.priceString} / month until canceled in Google Play.`
      : 'Renews monthly.',
    itikPrice: offering?.itik
      ? `${offering.itik.priceString} once`
      : loadingProducts ? 'Checking price…' : 'Price unavailable',
  };
}
