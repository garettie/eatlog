import { useCallback, useMemo, useState } from 'react';

import { useEntitlement } from '../../context/EntitlementContext';
import { canBuyItik, hasItik, type EatlogAccess } from '../../services/billing.types';
import { PAID_PLAN_NAME } from '../../services/tierNames';
import { packageCadence, packageDescription, packagePrice, packageTrial } from './planCopy';

/**
 * Purchase state shared by the interrupt paywall and the Profile plan screen. Every package in
 * the `itik` offering is Itik; they differ only in the store's terms, which label them.
 *
 * The CTA label depends on the selected package and its price and on nothing else. Transient
 * conditions drive `busy` and the status line instead, so the button never renames itself
 * mid-decision, and a background refresh never disables it.
 */
export function usePlanPurchase(access: EatlogAccess | null) {
  const { offering, loadingProducts, purchase, refresh } = useEntitlement();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const packages = useMemo(() => offering?.packages ?? [], [offering]);
  const product = packages.find((item) => item.packageIdentifier === selectedId) ?? packages[0] ?? null;
  const itik = access !== null && hasItik(access);
  // Anyone can open the offer; the double-payment guard only hides it from someone who would
  // be paying twice.
  const canBuy = access === null || canBuyItik(access);
  const trial = product ? packageTrial(product) : null;

  const title = useMemo(() => {
    if (trial) return 'Start free trial';
    return product ? `Get ${PAID_PLAN_NAME} · ${product.priceString}` : `Get ${PAID_PLAN_NAME}`;
  }, [product, trial]);

  const disabled = busy || loadingProducts || !product || !canBuy;

  const run = useCallback(async () => {
    if (busy || !product) return;
    setBusy(true);
    setMessage(null);
    try {
      setMessage((await purchase(product.packageIdentifier)).message);
    } catch {
      setMessage("The purchase didn't finish. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, product, purchase]);

  const retryStore = useCallback(() => {
    setMessage(null);
    void refresh();
  }, [refresh]);

  return {
    options: packages.map((item) => ({
      id: item.packageIdentifier,
      title: PAID_PLAN_NAME,
      cadence: packageCadence(item),
      badge: packageTrial(item) ? 'Free trial' : null,
      price: packagePrice(item),
      description: packageDescription(item),
    })),
    selectedId: product?.packageIdentifier ?? null,
    setSelected: setSelectedId,
    itik,
    canBuy,
    title,
    disabled,
    busy,
    loadingProducts,
    message,
    setMessage,
    run,
    retryStore,
    storeUnreachable: !loadingProducts && packages.length === 0,
  };
}
