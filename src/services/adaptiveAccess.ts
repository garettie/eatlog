let adaptiveAccessEnabled = false;

export class AdaptiveAccessRequiredError extends Error {
  constructor() {
    super('Adaptive plans are available with Manok or Itik.');
    this.name = 'AdaptiveAccessRequiredError';
  }
}

export function setAdaptiveAccess(enabled: boolean): void {
  adaptiveAccessEnabled = enabled;
}

export function requireAdaptiveAccess(): void {
  if (!adaptiveAccessEnabled) throw new AdaptiveAccessRequiredError();
}
