import type { RemoteEstimateConsentDecision } from './remoteEstimateConsent';

export interface RemoteEstimateConsentCoordinatorOptions {
  getDecision: () => Promise<RemoteEstimateConsentDecision | null>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  onDecision: (decision: RemoteEstimateConsentDecision | null) => void;
  onPresent: () => void;
  onClose: () => void;
  onAcceptError?: () => void;
}

export function createRemoteEstimateConsentCoordinator(options: RemoteEstimateConsentCoordinatorOptions) {
  let decision: RemoteEstimateConsentDecision | null = null;
  let pending: { promise: Promise<boolean>; resolve: (value: boolean) => void } | null = null;
  let requestPromise: Promise<boolean> | null = null;
  let loadPromise: Promise<RemoteEstimateConsentDecision | null> | null = null;
  let requestGeneration = 0;
  let presented = false;

  function setDecision(next: RemoteEstimateConsentDecision | null): void {
    decision = next;
    options.onDecision(next);
  }

  async function refresh(): Promise<RemoteEstimateConsentDecision | null> {
    try {
      const next = await options.getDecision();
      setDecision(next);
      return next;
    } catch {
      setDecision(null);
      return null;
    }
  }

  function closePending(value: boolean): void {
    const current = pending;
    pending = null;
    requestPromise = null;
    const wasPresented = presented;
    presented = false;
    if (wasPresented) options.onClose();
    current?.resolve(value);
  }

  function createPendingRequest(): Promise<boolean> {
    if (pending) return pending.promise;
    let resolve!: (value: boolean) => void;
    const promise = new Promise<boolean>((finish) => {
      resolve = finish;
    });
    pending = { promise, resolve };
    presented = true;
    options.onPresent();
    return promise;
  }

  function requestConsent(): Promise<boolean> {
    if (decision === 'accepted') return Promise.resolve(true);
    if (pending) return pending.promise;
    if (requestPromise) return requestPromise;
    if (!loadPromise) {
      loadPromise = refresh().finally(() => {
        loadPromise = null;
      });
    }
    const generation = ++requestGeneration;
    const nextRequest = loadPromise.then((next) => {
      if (generation !== requestGeneration) return false;
      return next === 'accepted' ? true : createPendingRequest();
    });
    requestPromise = nextRequest;
    void nextRequest.then(
      () => { if (requestPromise === nextRequest) requestPromise = null; },
      () => { if (requestPromise === nextRequest) requestPromise = null; },
    );
    return nextRequest;
  }

  async function accept(): Promise<boolean> {
    requestGeneration += 1;
    try {
      await options.accept();
      setDecision('accepted');
      closePending(true);
      return true;
    } catch {
      setDecision('declined');
      options.onAcceptError?.();
      return false;
    }
  }

  async function decline(): Promise<void> {
    requestGeneration += 1;
    try {
      await options.decline();
    } catch {
      // A failed decline still closes the prompt and leaves the coordinator
      // fail-closed for the current process.
    }
    setDecision('declined');
    closePending(false);
  }

  async function dismiss(): Promise<void> {
    if (!presented && !pending) return;
    await decline();
  }

  return {
    requestConsent,
    accept,
    decline,
    dismiss,
    refresh,
    getDecision: () => decision,
    isPresented: () => presented,
  };
}
