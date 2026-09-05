import { DurableObject } from 'cloudflare:workers';

import { geminiGenerateUrl } from './geminiEndpoint';

interface RelayEnv { GEMINI_API_KEY: string }

/** A JSON estimate or a provider error envelope; anything larger is corruption, not an answer. */
const MAX_RELAY_BODY_BYTES = 256 * 1024;
/** Only used when the caller sent no budget, which an older Worker revision would not. */
const DEFAULT_RELAY_TIMEOUT_MS = 9000;

/**
 * Google refuses Gemini calls that leave from a territory its API does not serve, and the
 * colo a request lands on is not the user's choice: a phone in Manila can be routed to
 * Hong Kong, which is unsupported, and every model then fails with FAILED_PRECONDITION.
 * This object is pinned to a supported region when it is created, so the call it makes
 * originates there rather than wherever the request arrived.
 */
export class GeminiRelay extends DurableObject<RelayEnv> {
  // fallow-ignore-next-line unused-class-member -- Cloudflare invokes the Durable Object fetch entry point.
  async fetch(request: Request): Promise<Response> {
    const model = request.headers.get('x-eatlog-gemini-model') ?? '';
    // The caller is this Worker, never a client, so a malformed model can only be a bug.
    if (!/^[a-z0-9.-]{1,64}$/.test(model)) return new Response('Invalid model.', { status: 400 });
    // This hop is invisible to the caller's own abort, so the budget it was given is enforced
    // here as well. Without it a stalled relay outlives the request that started it and the
    // fallback model is never reached.
    const budget = Number(request.headers.get('x-eatlog-deadline-ms'));
    const timeoutMs = Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_RELAY_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(geminiGenerateUrl(model, this.env.GEMINI_API_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await request.text(),
        signal: controller.signal,
      });
      // Buffered here, still under the same timer, so a response that stalls part-way through
      // its body fails the relay rather than the caller's whole budget.
      const body = await response.arrayBuffer();
      if (body.byteLength > MAX_RELAY_BODY_BYTES) {
        return new Response('Upstream body too large.', { status: 502 });
      }
      return new Response(body, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
      });
    } catch {
      return new Response('Relay upstream unavailable.', { status: 504 });
    } finally {
      clearTimeout(timeout);
    }
  }
}
