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
    | 'fair-use-daily-limit'
    | 'fair-use-30-day-limit'
    | 'refund-daily-limit'
    | 'entitlement-unavailable'
    | 'rate-limited'
    | 'network'
    | 'timeout'
    | 'provider'
    | 'invalid-response'
    | 'description-too-long'
    | 'cancelled'
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
/** The Worker's own limit for a description. Checked here so the upload is not wasted. */
const MAX_DESCRIPTION_LENGTH = 2000;
/**
 * How long a failed action keeps its identity so an explicit Retry is recognised as the same
 * submission rather than a second one. It matches the Worker's replay window: past it the
 * server has forgotten the action too, and a retry is honestly a new request.
 */
const ACTION_RETRY_WINDOW_MS = 120_000;

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
        'fair-use-daily-limit': 'The 30-operation rolling 24-hour fair-use limit is reached. Try again when it resets.',
        'fair-use-30-day-limit': 'The 250-operation rolling 30-day fair-use limit is reached. Try again when it resets.',
        'refund-daily-limit': 'Too many recent estimate attempts could not be completed. Try again when the window resets.',
        'entitlement-unavailable': 'Could not start the estimate. Check your connection and try again.',
        'rate-limited': 'Too many estimates in a short time. Wait a minute, then try again.',
        network: 'Could not reach the estimation service. Check your connection and try again.',
        timeout: 'The estimation service took too long. Try again.',
        provider: 'The estimation service could not complete this request. Try again.',
        'description-too-long': `Descriptions are limited to ${MAX_DESCRIPTION_LENGTH} characters. Shorten it and try again.`,
        cancelled: 'Estimate cancelled.',
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

/** Passed to any estimate call so leaving a screen or an explicit cancel can detach the caller. */
export interface EstimateCallOptions {
    signal?: AbortSignal;
}

/**
 * One intentional estimate, tracked by the payload that defines it.
 *
 * The identifier used to be a hash of that payload, which made a genuine transport retry and a
 * genuine second submission of the same meal look identical: logging yesterday's rice again sent
 * an identifier the Worker still had on file. Here the identifier is random and belongs to the
 * action, not the food. It survives an explicit Retry of an unchanged draft, and it is retired
 * the moment the action delivers a result, so logging the same meal again is a new action.
 */
interface EstimateAction {
    id: string;
    startedAt: number;
    inFlight: Promise<FoodEstimationResult> | null;
}

function randomActionId(): string {
    // 32 hex characters, inside the Worker's /^[A-Za-z0-9-]{16,128}$/ identifier contract.
    let id = '';
    for (let index = 0; index < 4; index += 1) {
        id += Math.floor(Math.random() * 0x1_0000_0000).toString(16).padStart(8, '0');
    }
    return id;
}

export function createFoodEstimateClient(options: FoodEstimateClientOptions) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const loadInstallationToken = options.getInstallationToken ?? getInstallationToken;
    const now = options.now ?? Date.now;
    const timeoutMs = options.timeoutMs ?? 35000;
    const checkConsent = options.hasConsent ?? hasRemoteEstimateConsent;
    const authorize = options.getAiAuthorization ?? getAiAuthorization;
    const acceptGrant = options.acceptAiGrant ?? acceptAiGrant;

    /**
     * Live and recently failed actions, keyed by the payload that defines them. Memory only, and
     * bounded: an action is dropped as soon as it succeeds, and a failed one is forgotten once
     * the Worker has forgotten it too.
     */
    const actions = new Map<string, EstimateAction>();

    /** Consent withdrawal, a change of entitlement or identity, and Delete all data all land here. */
    function clearActions(): void {
        actions.clear();
    }

    function actionFor(payload: string): EstimateAction {
        const existing = actions.get(payload);
        if (existing && (existing.inFlight !== null || existing.startedAt > now() - ACTION_RETRY_WINDOW_MS)) {
            return existing;
        }
        for (const [key, action] of actions) {
            if (action.inFlight === null && action.startedAt <= now() - ACTION_RETRY_WINDOW_MS) actions.delete(key);
        }
        const created: EstimateAction = { id: randomActionId(), startedAt: now(), inFlight: null };
        actions.set(payload, created);
        return created;
    }

    /**
     * A caller that gives up stops waiting; it does not stop the work. Another subscriber may
     * still be waiting for the same estimate, and the provider tokens are spent either way —
     * abandoning the request would not hand them back.
     */
    function detachable(work: Promise<FoodEstimationResult>, signal?: AbortSignal): Promise<FoodEstimationResult> {
        if (!signal) return work;
        if (signal.aborted) return Promise.resolve(failure('cancelled'));
        return new Promise((resolve) => {
            const onAbort = (): void => resolve(failure('cancelled'));
            signal.addEventListener('abort', onAbort, { once: true });
            work.then(
                (result) => { signal.removeEventListener('abort', onAbort); resolve(result); },
                () => { signal.removeEventListener('abort', onAbort); resolve(failure('network')); },
            );
        });
    }

    function estimate(
        operation: EstimateOperation,
        input: EstimateInput,
        call: EstimateCallOptions = {},
    ): Promise<FoodEstimationResult> {
        const payload = JSON.stringify({ operation, ...input });
        const action = actionFor(payload);
        // Duplicate taps on one button share the estimate already running rather than starting
        // a second one behind it.
        if (!action.inFlight) {
            action.inFlight = run(operation, input, payload, action).then((result) => {
                action.inFlight = null;
                // A delivered estimate ends its action. Submitting the same meal again is a new
                // intention, and the next one gets an identifier of its own.
                if (result.ok || result.kind === 'unrecognized') actions.delete(payload);
                return result;
            });
        }
        return detachable(action.inFlight, call.signal);
    }

    async function run(
        operation: EstimateOperation,
        input: EstimateInput,
        payload: string,
        action: EstimateAction,
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
            const headers: Record<string, string> = {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Eatlog-Install-ID': installId,
                'X-Eatlog-Request-ID': options.requestId ? await options.requestId(payload) : action.id,
                // The Worker advertises which coordination protocol it speaks; the body contract
                // is unchanged, so an older Worker simply ignores this.
                'X-Eatlog-Request-Version': '2',
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

    async function scanFood(imageBase64: string, mealTitle?: string, call?: EstimateCallOptions): Promise<FoodEstimationResult> {
        if (!imageBase64.trim()) return failure('unrecognized');
        const title = mealTitle?.trim().slice(0, MAX_SCAN_MEAL_TITLE_LENGTH);
        return estimate('scan', {
            imageBase64,
            ...(title ? { text: title } : {}),
        }, call);
    }

    async function describeMeal(text: string, call?: EstimateCallOptions): Promise<FoodEstimationResult> {
        const trimmed = text.trim();
        if (!trimmed) return failure('unrecognized');
        // Checked before the upload rather than after it, so an over-long description costs the
        // user a message instead of a round trip that was always going to be rejected.
        if ([...trimmed].length > MAX_DESCRIPTION_LENGTH) return failure('description-too-long');
        return estimate('describe', { text: trimmed }, call);
    }

    async function clarifyMeal(options: MealClarificationInput, call?: EstimateCallOptions): Promise<DescribeResult | null> {
        const result = await estimate('clarify-meal', {
            text: options.name.trim().slice(0, MAX_CLARIFICATION_NAME_LENGTH),
            imageBase64: options.imageBase64,
            context: buildEstimateContext(options),
        }, call);
        return result.ok ? result.result : null;
    }

    async function clarifyComponent(options: ComponentClarificationInput, call?: EstimateCallOptions): Promise<FoodResult | null> {
        const result = await estimate('clarify-component', {
            text: options.name.trim().slice(0, MAX_CLARIFICATION_NAME_LENGTH),
            imageBase64: options.imageBase64,
            context: buildEstimateContext(options),
        }, call);
        return result.ok ? result.result.components[0] ?? null : null;
    }

    return { scanFood, describeMeal, clarifyMeal, clarifyComponent, clearActions };
}

const defaultClient = createFoodEstimateClient({ workerUrl: serviceConfig.foodWorkerUrl });

export const scanFood = defaultClient.scanFood;
export const describeMeal = defaultClient.describeMeal;
export const clarifyMeal = defaultClient.clarifyMeal;
export const clarifyComponent = defaultClient.clarifyComponent;
/**
 * Drops every remembered action identity. Consent withdrawal, a change of entitlement or
 * identity, and Delete all data must each call this: an identifier that outlived the account it
 * belonged to would attach one person's retry to another's allowance.
 */
export const clearFoodEstimateActions = defaultClient.clearActions;
