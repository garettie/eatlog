import { DurableObject } from 'cloudflare:workers';

import { geminiGenerateUrl } from './geminiEndpoint';

interface RelayEnv { GEMINI_API_KEY: string }

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
    return await fetch(geminiGenerateUrl(model, this.env.GEMINI_API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
    });
  }
}
