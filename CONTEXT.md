# Eatlog

Eatlog is a local-first calorie and weight tracker. Every local feature is free; AI food estimates depend on the user's tier and AI route.

## Language

### Tiers and AI access

**Tier**:
The user's plan level, always derived from their entitlement and saved key and never stored on its own.
_Avoid_: Plan state, account type

**Pugo**:
The free tier with no AI: no active entitlement and no saved key.
_Avoid_: Free plan, basic

**Manok**:
The free tier where AI estimates go directly from the device to Google using the user's own Google AI Studio key.
_Avoid_: BYOK tier, subscription (the old recurring-purchase meaning is obsolete)

**Itik**:
The tier with an active paid or complimentary entitlement to Eatlog-hosted AI, which uses the owner's server-held key.
_Avoid_: Premium; naming Itik by its billing cadence

**Complimentary access**:
An Itik entitlement granted without a purchase, used for owner and friend testing.
_Avoid_: Promo, free Itik

**AI route**:
The saved choice of who funds an estimate: Eatlog AI or My key. Only an Itik user with a saved key chooses; Manok is always My key.
_Avoid_: Mode, provider, AI source

**Eatlog AI**:
The AI route through Eatlog's hosted service, funded by the owner and bounded by the hosted allowance.
_Avoid_: Server mode, hosted key

**My key**:
The AI route that sends requests directly to Google with the user's saved key, bounded by the limits of the user's Google project.
_Avoid_: BYOK mode, direct mode

### Consent

**Hosted consent**:
The user's agreement to send meal inputs to Eatlog AI; once accepted it is never asked again unless withdrawn.
_Avoid_: Online estimates consent

**Manok consent**:
The user's agreement, given while saving a key, to send meal inputs directly to Google under Google's terms; removing the key withdraws it.
_Avoid_: Google consent, BYOK consent
