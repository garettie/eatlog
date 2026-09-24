import { normalizeFoodEstimate, type EstimateInput } from './foodEstimateCore';
import {
    GEMINI_ESTIMATE_MODELS,
    attemptBudget,
    blockedFinish,
    buildGeminiEstimateBody,
    candidateText,
    geminiModelUrl,
} from './foodEstimateGemini';

/**
 * My key: the estimate goes from this device straight to Google, authenticated with the user's
 * own key. Nothing about it reaches Eatlog — no install identity, grant, request identifier, or
 * usage report — and it never uses the Worker or its regional relay.
 */

export type DirectEstimateFailure =
    | 'key-invalid'
    | 'key-limit'
    | 'location-unsupported'
    | 'timeout'
    | 'network'
    | 'provider'
    | 'invalid-response';

export type DirectEstimateOutcome =
    | { ok: true; estimate: Record<string, unknown> }
    | { ok: false; kind: DirectEstimateFailure };

export interface DirectEstimateOptions {
    fetchImpl?: typeof fetch;
    now?: () => number;
    /** The whole request, every model attempt included. */
    totalMs: number;
}

/**
 * Google's ErrorInfo reasons that mean the key itself cannot be used, whichever model is asked.
 * Unverified against live unpaid and billed projects; the "API key" message check below is the
 * backstop when a response carries no reason at all.
 */
const KEY_REASONS = new Set([
    'API_KEY_INVALID',
    'API_KEY_EXPIRED',
    'API_KEY_SERVICE_BLOCKED',
    'API_KEY_ANDROID_APP_BLOCKED',
    'API_KEY_IOS_APP_BLOCKED',
    'API_KEY_HTTP_REFERRER_BLOCKED',
    'API_KEY_IP_ADDRESS_BLOCKED',
    'SERVICE_DISABLED',
    'CONSUMER_SUSPENDED',
]);

type Rejection = 'key-invalid' | 'key-limit' | 'location-unsupported' | 'next-model';

/** Decided by status, `error.status`, and ErrorInfo reason. The message is only a key backstop. */
export function classifyDirectRejection(httpStatus: number, body: string): Rejection {
    let status = '';
    let message = '';
    let reasons: string[] = [];
    try {
        const error = (JSON.parse(body) as { error?: { status?: unknown; message?: unknown; details?: unknown } }).error;
        status = typeof error?.status === 'string' ? error.status : '';
        message = typeof error?.message === 'string' ? error.message : '';
        reasons = Array.isArray(error?.details)
            ? error.details.map((detail) => (detail as { reason?: unknown } | null)?.reason).filter((reason): reason is string => typeof reason === 'string')
            : [];
    } catch {
        // An unreadable error body is judged on its status alone.
    }
    if (httpStatus === 401 || reasons.some((reason) => KEY_REASONS.has(reason))) return 'key-invalid';
    if ((httpStatus === 400 || httpStatus === 403) && /\bapi key\b/i.test(message)) return 'key-invalid';
    // Where the call came from, not which model: no other model or retry changes the answer.
    if (httpStatus === 400 && status === 'FAILED_PRECONDITION') return 'location-unsupported';
    // Quota is per model, so the next model may still have some; the key stays the same.
    if (httpStatus === 429) return 'key-limit';
    // A missing or unavailable model (404, or 403 on that model), overload, or a server fault.
    return 'next-model';
}

export async function requestDirectEstimate(
    input: EstimateInput,
    apiKey: string,
    options: DirectEstimateOptions,
): Promise<DirectEstimateOutcome> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const now = options.now ?? Date.now;
    const started = now();
    const body = buildGeminiEstimateBody(input);
    let last: DirectEstimateFailure = 'provider';
    let limited = false;
    for (const [index, model] of GEMINI_ESTIMATE_MODELS.entries()) {
        const remaining = started + options.totalMs - now();
        if (remaining <= 0) return { ok: false, kind: 'timeout' };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), attemptBudget(remaining, GEMINI_ESTIMATE_MODELS.length - 1 - index));
        let status: number;
        let text: string;
        try {
            const response = await fetchImpl(geminiModelUrl(model), {
                method: 'POST',
                // A header, never the URL: URLs end up in logs and crash reports.
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body,
                signal: controller.signal,
            });
            status = response.status;
            text = await response.text();
        } catch {
            last = controller.signal.aborted ? 'timeout' : 'network';
            continue;
        } finally {
            clearTimeout(timer);
        }
        if (status < 200 || status >= 300) {
            const rejection = classifyDirectRejection(status, text);
            if (rejection === 'key-invalid' || rejection === 'location-unsupported') return { ok: false, kind: rejection };
            if (rejection === 'key-limit') limited = true;
            last = rejection === 'key-limit' ? 'key-limit' : 'provider';
            continue;
        }
        let upstream: unknown;
        try {
            upstream = JSON.parse(text);
        } catch {
            last = 'invalid-response';
            continue;
        }
        const candidate = (upstream as { candidates?: unknown[] } | null)?.candidates?.[0];
        const finishReason = (candidate as { finishReason?: unknown } | undefined)?.finishReason;
        // The provider looked and refused; another model refuses the same content the same way.
        if (blockedFinish(finishReason)) return { ok: false, kind: 'invalid-response' };
        const answer = candidateText(candidate);
        let parsed: unknown = null;
        try { parsed = answer === null ? null : JSON.parse(answer); } catch { parsed = null; }
        const estimate = normalizeFoodEstimate(parsed, input.operation);
        if (estimate) return { ok: true, estimate };
        last = 'invalid-response';
    }
    // A later model that was merely unavailable must not hide that the key ran out of quota.
    return { ok: false, kind: last === 'provider' && limited ? 'key-limit' : last };
}
