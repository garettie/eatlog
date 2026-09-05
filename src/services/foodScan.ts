import { serviceConfig } from '../config/services';
import { buildFoodPortions, normalizeFoodName } from './foodSearchCore';
import type { FoodResult } from './foodSearch';
import { getInstallationToken, isInstallationToken } from './installIdentity';
import { hasRemoteEstimateConsent } from './remoteEstimateConsent';
import { acceptAiGrant, getAiAuthorization, type AiAuthorizationFailure } from './subscriptionApi';
import {
    type FoodEstimateResponse,
    isRecognizedFoodEstimate,
    isUnrecognizedFoodEstimate,
    mealDivisionOf,
} from './foodScanContract';

export interface MealDivision {
    servesTotal: number;
    servingUnit: string;
}

export interface DescribeResult {
    mealName: string;
    components: FoodResult[];
    originalDescription?: string;
    /**
     * Present when the estimate covers a food larger than one serving, so the
     * review sheet can offer "3 of 8 slices" instead of making the user divide
     * every component by hand.
     */
    division?: MealDivision;
}

export interface EstimateContextComponent {
    name: string;
    estimatedGrams: number;
}

export interface MealClarificationInput {
    name: string;
    originalDescription?: string;
    components: EstimateContextComponent[];
    imageBase64?: string;
}

export interface ComponentClarificationInput extends MealClarificationInput {
    mealName: string;
}

export type FoodEstimationFailureKind =
    | 'unavailable'
    | 'consent-required'
    | 'paid-access-required'
    | 'pugo-daily-limit'
    | 'trial-daily-limit'
    | 'trial-allowance-exhausted'
    | 'fair-use-daily-limit'
    | 'fair-use-30-day-limit'
    | 'refund-daily-limit'
    | 'entitlement-unavailable'
    | 'rate-limited'
    | 'network'
    | 'timeout'
    | 'provider'
    | 'invalid-response'
    | 'unrecognized';
export type FoodEstimationResult =
    | { ok: true; result: DescribeResult }
    | { ok: false; kind: FoodEstimationFailureKind; message: string };

type EstimateOperation = 'scan' | 'describe' | 'clarify-meal' | 'clarify-component';
const MAX_CONTEXT_COMPONENTS = 20;
const MAX_CONTEXT_DESCRIPTION_LENGTH = 500;
const MAX_CONTEXT_NAME_LENGTH = 120;
const MAX_CONTEXT_GRAMS = 10_000;
const MAX_CLARIFICATION_NAME_LENGTH = 200;
const MAX_SCAN_MEAL_TITLE_LENGTH = 120;

interface EstimateContext {
    originalDescription?: string;
    mealName?: string;
    components: EstimateContextComponent[];
}

interface EstimateInput {
    text?: string;
    imageBase64?: string;
    context?: EstimateContext;
}

export interface FoodEstimateClientOptions {
    workerUrl: string;
    fetchImpl?: typeof fetch;
    getInstallationToken?: () => string | Promise<string>;
    now?: () => number;
    timeoutMs?: number;
    hasConsent?: () => boolean | Promise<boolean>;
    getAiAuthorization?: () => { ok: true; grant: string } | { ok: false; kind: AiAuthorizationFailure };
    acceptAiGrant?: (token: string, expiresAt: string) => void;
    requestId?: (payload: string) => string | Promise<string>;
}

const RESET_KINDS = new Set<FoodEstimationFailureKind>([
    'pugo-daily-limit',
    'trial-daily-limit',
    'fair-use-daily-limit',
]);

function formatResetTime(nextEligibleAt: string | null | undefined): string | null {
    if (!nextEligibleAt) return null;
    const date = new Date(nextEligibleAt);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function failure(kind: FoodEstimationFailureKind, nextEligibleAt?: string | null): FoodEstimationResult {
    const messages: Record<FoodEstimationFailureKind, string> = {
        unavailable: 'Estimates are unavailable in this build.',
        'consent-required': 'Enable online estimates to use this.',
        'paid-access-required': 'Eatlog Manok or Itik is required for AI estimates.',
        'pugo-daily-limit': "You've used your 3 free estimates for this 24-hour window. Try again after it resets.",
        'trial-daily-limit': 'The estimate allowance for this 24-hour window is used. Try again when it resets.',
        'trial-allowance-exhausted': 'The estimate allowance is used. Manual logging still works.',
        'fair-use-daily-limit': 'The 30-operation rolling 24-hour fair-use limit is reached. Try again when it resets.',
        'fair-use-30-day-limit': 'The 250-operation rolling 30-day fair-use limit is reached. Try again when it resets.',
        'refund-daily-limit': 'Too many recent estimate attempts could not be completed. Try again when the window resets.',
        'entitlement-unavailable': 'Could not start the estimate. Check your connection and try again.',
        'rate-limited': 'Too many estimates in a short time. Wait a minute, then try again.',
        network: 'Could not reach the estimation service. Check your connection and try again.',
        timeout: 'The estimation service took too long. Try again.',
        provider: 'The estimation service could not complete this request. Try again.',
        'invalid-response': 'The estimation service returned an unusable result. Try again or enter it manually.',
        unrecognized: 'No usable food was recognized. Try a clearer photo or a more specific description.',
    };
    const resetTime = RESET_KINDS.has(kind) ? formatResetTime(nextEligibleAt) : null;
    const message = resetTime
        ? messages[kind].replace(/Try again (?:after|when)[^.]*\./, `Try again after ${resetTime}.`)
        : messages[kind];
    return { ok: false, kind, message };
}

function titleCaseWord(word: string): string {
    // A word the model already capitalized inside itself is a real name ("McDonald's",
    // "iPhone"); lowering it would be wrong. Shouted words carry no such intent.
    const shouted = word === word.toUpperCase();
    if (!shouted && /[A-Z]/.test(word.slice(1))) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizeScanName(name: string): string {
    return name
        .replace(/[^A-Za-z0-9'\u2019\-\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(titleCaseWord)
        .join(' ');
}

function buildEstimateContext(input: {
    originalDescription?: string;
    mealName?: string;
    components: EstimateContextComponent[];
}): EstimateContext | undefined {
    const components = input.components
        .map((component) => ({
            name: component.name.trim().slice(0, MAX_CONTEXT_NAME_LENGTH),
            estimatedGrams: component.estimatedGrams,
        }))
        .filter((component) => component.name
            && Number.isFinite(component.estimatedGrams)
            && component.estimatedGrams > 0
            && component.estimatedGrams <= MAX_CONTEXT_GRAMS)
        .slice(0, MAX_CONTEXT_COMPONENTS);
    if (components.length === 0) return undefined;
    const originalDescription = input.originalDescription?.trim().slice(0, MAX_CONTEXT_DESCRIPTION_LENGTH);
    const mealName = input.mealName?.trim().slice(0, MAX_CONTEXT_NAME_LENGTH);
    return {
        ...(originalDescription ? { originalDescription } : {}),
        ...(mealName ? { mealName } : {}),
        components,
    };
}

function mapComponents(
    components: FoodEstimateResponse['components'],
    source: 'scan' | 'describe',
    timestamp: number,
): FoodResult[] {
    return components.map((component, index) => {
        const name = normalizeScanName(component.name);
        const normalized = normalizeFoodName(name, component.brand ?? null);
        const portions = buildFoodPortions([
            { id: 'serving', label: component.servingLabel ?? `${component.servingSizeGrams ?? 0} g`, grams: component.servingSizeGrams },
        ]);
        const serving = portions[0] ?? null;
        return {
            id: `${source}-${timestamp}-${index}`,
            name,
            source,
            sourceFoodId: '',
            dataType: source,
            brand: component.brand ?? null,
            preparation: component.preparation ?? normalized.preparation,
            normalizedName: normalized.normalizedName,
            caloriesPer100g: Math.round(component.caloriesPer100g * 10) / 10,
            proteinPer100g: Math.round(component.proteinPer100g * 10) / 10,
            carbsPer100g: Math.round(component.carbsPer100g * 10) / 10,
            fatPer100g: Math.round(component.fatPer100g * 10) / 10,
            portions,
            defaultAmount: {
                kind: 'reviewed',
                grams: component.estimatedGrams,
                servingId: serving?.id ?? null,
            },
            confidence: component.confidence,
            confidenceReason: component.confidenceReason,
            alternateSourceIds: [],
        };
    });
}

export function createFoodEstimateClient(options: FoodEstimateClientOptions) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const loadInstallationToken = options.getInstallationToken ?? getInstallationToken;
    const now = options.now ?? Date.now;
    const timeoutMs = options.timeoutMs ?? 35000;
    const checkConsent = options.hasConsent ?? hasRemoteEstimateConsent;
    const authorize = options.getAiAuthorization ?? getAiAuthorization;
    const acceptGrant = options.acceptAiGrant ?? acceptAiGrant;
    const createRequestId = options.requestId ?? (async (payload: string) => {
        const Crypto = await import('expo-crypto');
        return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
    });

    async function estimate(
        operation: EstimateOperation,
        input: EstimateInput,
    ): Promise<FoodEstimationResult> {
        if (!options.workerUrl) return failure('unavailable');
        const authorization = authorize();
        if (!authorization.ok && authorization.kind === 'paid-access-required') return failure(authorization.kind);
        try {
            if (!await checkConsent()) return failure('consent-required');
        } catch {
            return failure('consent-required');
        }
        let installId: string;
        try {
            installId = await loadInstallationToken();
            if (!isInstallationToken(installId)) return failure('unavailable');
        } catch {
            return failure('unavailable');
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const payload = JSON.stringify({ operation, ...input });
            const headers: Record<string, string> = {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Eatlog-Install-ID': installId,
                'X-Eatlog-Request-ID': await createRequestId(payload),
            };
            // Re-read: consent, the install token, and hashing the payload above can take long
            // enough on a cold start for a grant that was pending at the top of estimate() to
            // land during the wait.
            const latestAuthorization = authorize();
            if (latestAuthorization.ok) headers.Authorization = `Bearer ${latestAuthorization.grant}`;
            const response = await fetchImpl(`${options.workerUrl}/v1/estimate`, {
                method: 'POST',
                headers,
                body: payload,
                signal: controller.signal,
            });
            if (!response.ok) {
                if ((response.headers.get('content-type') ?? '').includes('application/json')) {
                    let code: unknown;
                    let nextEligibleAt: unknown;
                    try {
                        const body = (await response.json()) as { error?: { code?: unknown; nextEligibleAt?: unknown } };
                        code = body.error?.code;
                        nextEligibleAt = body.error?.nextEligibleAt;
                    } catch { code = null; }
                    const mapping: Record<string, FoodEstimationFailureKind> = {
                        PAID_ACCESS_REQUIRED: 'paid-access-required',
                        PUGO_DAILY_LIMIT: 'pugo-daily-limit',
                        TRIAL_DAILY_LIMIT: 'trial-daily-limit',
                        TRIAL_ALLOWANCE_EXHAUSTED: 'trial-allowance-exhausted',
                        FAIR_USE_DAILY_LIMIT: 'fair-use-daily-limit',
                        FAIR_USE_30_DAY_LIMIT: 'fair-use-30-day-limit',
                        REFUND_DAILY_LIMIT: 'refund-daily-limit',
                        ENTITLEMENT_UNAVAILABLE: 'entitlement-unavailable',
                        // The Worker gives up on the provider before the client's own timeout
                        // fires, so without these a slow or malformed upstream reached the user
                        // as the generic "couldn't complete" copy and looked like every other
                        // failure.
                        UPSTREAM_TIMEOUT: 'timeout',
                        // The Worker now stops before the client's own 35s deadline, so a
                        // request that ran out of time comes back named rather than as the
                        // app's generic abort. Both mean the same thing to the user: it took
                        // too long, and trying again is worth it.
                        REQUEST_TIMEOUT: 'timeout',
                        STATE_TIMEOUT: 'timeout',
                        MALFORMED_UPSTREAM: 'invalid-response',
                        // Throttling is a wait, not a failure, and the Worker asks for 60s
                        // back. Saying so beats the catch-all telling the user to retry now.
                        RATE_LIMITED: 'rate-limited',
                    };
                    if (typeof code === 'string' && mapping[code]) {
                        return failure(mapping[code], typeof nextEligibleAt === 'string' ? nextEligibleAt : null);
                    }
                }
                return failure('provider');
            }
            const refreshedGrant = response.headers.get('x-eatlog-ai-grant');
            const refreshedGrantExpiry = response.headers.get('x-eatlog-ai-grant-expires-at');
            if (refreshedGrant && refreshedGrantExpiry) acceptGrant(refreshedGrant, refreshedGrantExpiry);
            if (!(response.headers.get('content-type') ?? '').includes('application/json')) return failure('invalid-response');
            // A body that claims to be JSON and is not is a bad answer, not a bad connection.
            // Letting it reach the outer catch told the user their network had failed and
            // offered a retry that could only produce the same reply.
            let result: FoodEstimateResponse;
            try {
                result = await response.json() as FoodEstimateResponse;
            } catch {
                return failure('invalid-response');
            }
            if (!result || typeof result !== 'object') return failure('invalid-response');
            if (isUnrecognizedFoodEstimate(result)) return failure('unrecognized');
            if (!isRecognizedFoodEstimate(result)) return failure('invalid-response');
            const division = mealDivisionOf(result);
            const source = operation === 'scan' || input.imageBase64 ? 'scan' : 'describe';
            // A scan title carrying a stated amount ("72g Bear Brand", "2 servings of adobo")
            // is a portion instruction, not a label. The estimate applies the amount and
            // returns a clean name, so echoing the raw title back would restate the quantity.
            const scanTitle = operation === 'scan' ? input.text?.trim() : undefined;
            const providedMealTitle = scanTitle && !/\d/.test(scanTitle) ? scanTitle : undefined;
            const originalDescription = operation === 'describe' || operation === 'scan'
                ? input.text
                : input.context?.originalDescription;
            return {
                ok: true,
                result: {
                    mealName: providedMealTitle || result.mealName.trim(),
                    components: mapComponents(result.components, source, now()),
                    ...(originalDescription ? { originalDescription } : {}),
                    ...(division ? { division } : {}),
                },
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return failure('timeout');
            return failure('network');
        } finally {
            clearTimeout(timeout);
        }
    }

    async function scanFood(imageBase64: string, mealTitle?: string): Promise<FoodEstimationResult> {
        if (!imageBase64.trim()) return failure('unrecognized');
        const title = mealTitle?.trim().slice(0, MAX_SCAN_MEAL_TITLE_LENGTH);
        return estimate('scan', {
            imageBase64,
            ...(title ? { text: title } : {}),
        });
    }

    async function describeMeal(text: string): Promise<FoodEstimationResult> {
        const trimmed = text.trim();
        if (!trimmed) return failure('unrecognized');
        return estimate('describe', { text: trimmed });
    }

    async function clarifyMeal(options: MealClarificationInput): Promise<DescribeResult | null> {
        const result = await estimate('clarify-meal', {
            text: options.name.trim().slice(0, MAX_CLARIFICATION_NAME_LENGTH),
            imageBase64: options.imageBase64,
            context: buildEstimateContext(options),
        });
        return result.ok ? result.result : null;
    }

    async function clarifyComponent(options: ComponentClarificationInput): Promise<FoodResult | null> {
        const result = await estimate('clarify-component', {
            text: options.name.trim().slice(0, MAX_CLARIFICATION_NAME_LENGTH),
            imageBase64: options.imageBase64,
            context: buildEstimateContext(options),
        });
        return result.ok ? result.result.components[0] ?? null : null;
    }

    return { scanFood, describeMeal, clarifyMeal, clarifyComponent };
}

const defaultClient = createFoodEstimateClient({ workerUrl: serviceConfig.foodWorkerUrl });

export const scanFood = defaultClient.scanFood;
export const describeMeal = defaultClient.describeMeal;
export const clarifyMeal = defaultClient.clarifyMeal;
export const clarifyComponent = defaultClient.clarifyComponent;
