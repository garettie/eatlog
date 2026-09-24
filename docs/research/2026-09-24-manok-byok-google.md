# Google's requirements for direct Manok BYOK estimates

Retrieved: 2026-09-24

Research ticket: [Establish Google's requirements for direct BYOK food estimates](https://github.com/garettie/eatlog/issues/20)

Map: [Make Eatlog free with Manok BYOK and optional Itik hosted AI](https://github.com/garettie/eatlog/issues/19)

## Conclusion

The documented Gemini API capabilities can express Eatlog's current text-and-image estimation workload without the Worker. The two model candidates currently used by the Worker have documented text/image support, structured outputs, and standard free-tier input/output pricing.

That establishes technical feasibility in principle, not a universally free, policy-cleared feature. Google's terms restrict audience, geography, and the information that may be sent to Unpaid Services. These restrictions require a product decision before implementation. A consent checkbox cannot waive Google's service terms.

The key-security guidance also needs a precise reading: Google warns against exposing production keys in clients, specifically hardcoding and compiling them into web/mobile apps, and recommends a backend. A user entering their own key is not the same as shipping the owner's key to everyone. The reviewed documentation neither explicitly endorses this BYOK design nor establishes a blanket contractual ban on every user-owned-key client. Treat that as a security and eligibility question, not an invented prohibition.

No credentials, live provider requests, native tests, or implementation changes were used in this investigation. Recommendations below are not owner decisions or legal clearance.

## Workload and model facts

The official model pages for [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) and [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) document text and image input, text output, and structured outputs. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) lists standard free-tier input and output as free for these candidates on the retrieval date.

The [image-understanding guide](https://ai.google.dev/gemini-api/docs/image-understanding) documents inline base64 image data for suitable small requests. [Structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output) documents constrained JSON responses. These capabilities fit the shape of the existing estimation workload; they do not prove that the exact existing schema and every edge case work unchanged.

Current working-source observations:

- `src/services/foodScan.ts` supports `scan`, `describe`, `clarify-meal`, and `clarify-component`, currently sent to the Worker's `/v1/estimate` endpoint.
- The client performs consent and access handling, supplies installation/request identity, and maps normalized results into editable food records.
- `worker/src/index.ts` owns the system instruction, operation-specific prompts, response schema, inline JPEG construction, model fallback, and provider-response normalization. It sets a 2,048-token output ceiling, caps decoded images at 4 MiB and request bodies at 6 MiB, and bounds the normalized result to 20 components.
- The Worker uses `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite` as model candidates. A source comment about overload is a historical observation, not proof of current Google availability.
- `worker/src/geminiEndpoint.ts` constructs a `v1beta/models/{model}:generateContent` URL using a query-string key. `geminiRelay.ts` uses the owner's server-held key for the hosted regional relay.
- `src/services/foodScanContract.ts` validates the normalized response. Raw Gemini JSON is not the app's existing result contract.

A direct path must preserve the semantic operations and normalization without depending on Eatlog's AI grant, installation token, billing check, or estimate Worker. USDA remains a separate Worker service under the owner's approved scope. Sharing logic versus duplicating it remains a decision in [Choose shared estimation logic and direct-request behavior](https://github.com/garettie/eatlog/issues/23).

## Free pricing is not a guaranteed free experience

[Google's rate-limit guide](https://ai.google.dev/gemini-api/docs/rate-limits) states:

- Limits apply per Google Cloud project, not per API key.
- Requests per minute, input tokens per minute, and requests per day are separate constraints.
- Daily request quotas reset at midnight Pacific time, unlike Eatlog's rolling hosted allowance.
- Limits depend on model and project usage tier; actual capacity is not guaranteed.

Multiple keys in one project do not create independent free allowances. A user's other applications can consume the same project's quota. A scan followed by clarification can require multiple requests, and model fallback/retries can consume more capacity.

The [billing guide](https://ai.google.dev/gemini-api/docs/billing) distinguishes unpaid projects from billing-enabled projects. The [API key guide](https://ai.google.dev/gemini-api/docs/api-key) associates a key with a Cloud project. The sources reviewed do not document a key-only introspection mechanism that lets this app reliably classify an arbitrary project as unpaid, prepaid, funded, depleted, or immune to charges. Project settings can also change after setup.

Recommendation: distinguish "Manok is free to use in Eatlog" from "Google will never charge this key." Do not infer billing status from key syntax or one successful request. If billing is enabled on the user's project, provider charges are possible. Do not invent a guaranteed number of free estimates.

## Terms that affect the destination

The [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms), effective March 23, 2026, contain the following provisions. These are source statements, not a legal opinion about a particular deployment.

### Age and availability

The terms require API users to be at least 18. They also say the services must not be part of API clients directed towards or likely to be accessed by people under 18. This is broader language than a simple account-holder age requirement.

Services and API clients are limited to [available regions](https://ai.google.dev/gemini-api/docs/available-regions). The Philippines is listed. The terms specifically state that only Paid Services may be used when making API clients available to users in the EEA, Switzerland, or the UK.

The same terms provide paid-service data-use treatment to users in those regions even for some unpaid interactions. That data-use paragraph does not erase the separate API-client Paid Services requirement. Both provisions must be considered rather than selecting the more convenient one.

A supported network route is not proof of eligibility. The hosted Worker's regional relay is not a BYOK workaround, and the approved direct mode must not silently send user requests through the owner's key or relay.

### Unpaid information restrictions

For Unpaid Services, including unpaid Gemini API quota, Google says it uses submitted content and generated responses to improve products and machine-learning technologies. Human reviewers may read, annotate, and process inputs and outputs. The terms explicitly say:

> Do not submit sensitive, confidential, or personal information to the Unpaid Services.

A food-only image is not automatically established by this research to be prohibited personal information. However, arbitrary meal photos can include faces, receipts, identifying surroundings, and other personal content. Free-text descriptions can include health or dietary circumstances. The existing input contract does not guarantee their exclusion. Whether the intended inputs satisfy these terms needs a substantive decision; simply disclosing training use does not resolve it.

For Paid Services, Google says it does not use prompts/files/responses to improve products, while permitting limited safety/security logging and other processing described by the terms. Gemini API access qualifies as Paid Service when the project has active billing. Paying Eatlog and having a billing-enabled Google project are different facts; neither label alone proves the provider's treatment.

### Intended use

The terms describe AI Studio and Gemini API as developer services for professional or business purposes, not consumer use. Do not infer from that sentence alone that every consumer-facing application is prohibited. The intended user-owned-key deployment needs interpretation or clarification if this distinction affects eligibility.

The terms also prohibit clinical practice, medical advice, and uses requiring medical-device clearance. Nutrition estimation for an editable food log is not automatically a clinical service, but product claims and submitted context matter. The [Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy) has additional restrictions, including certain high-risk healthcare decisions.

## Credential and authentication facts

The current [API key guide](https://ai.google.dev/gemini-api/docs/api-key) distinguishes standard keys from authorization keys bound to a service account. It says:

- New AI Studio keys default to authorization keys from May 28, 2026.
- Unrestricted standard keys are rejected.
- Standard keys are scheduled for rejection in September 2026.
- Authorization keys are restricted to the Generative Language API by default and support leaked-key enforcement.

The page's month-level transition language does not establish the exact live enforcement state for an arbitrary legacy key on the retrieval date. Support current keys; do not promise every old AI Studio key still works. A backend-only service-account credential flow must not be invented merely because the new key is bound to a service account.

The guide documents `x-goog-api-key` authentication examples. The [GenerateContent REST reference](https://ai.google.dev/api/generate-content) is the relevant request contract for Eatlog's current endpoint. New Interactions API examples are not proof that a GenerateContent client should change request/response format.

Recommendation: use a supported header mechanism for direct calls rather than placing user secrets in URLs, and never log the key or unredacted request headers. This is a proposed implementation constraint, not a change made by the research.

### Exposure and restrictions

Google's security guidance warns that exposed keys can consume project quota, incur charges, and access private resources. Its production-client warning specifically discusses hardcoded/compiled secrets and recommends a backend proxy. It also documents API and origin restrictions.

A user-owned secret still exists in plaintext in the app when used. SecureStore protects persistence, not every compromised-process scenario. The reviewed Gemini guide does not prove that Android package/signature restrictions provide a tamper-proof direct-BYOK solution for the new key type. Verify applicable restrictions before making security promises.

The owner-approved destination excludes uploading user keys to the Worker. Do not silently adopt Google's generic backend recommendation as a new credential-custody architecture. If the direct model cannot meet the selected requirements, return to the owner with the concrete conflict.

## Failure contract to verify later

[Google's API error documentation](https://ai.google.dev/gemini-api/docs/api-errors) and [troubleshooting guide](https://ai.google.dev/gemini-api/docs/troubleshooting) describe authentication/permission failures, unmet billing or regional prerequisites, unavailable models, depleted credit, rate/quota exhaustion, overload, timeouts, and safety blocks.

Do not pin every error to a single numeric status based on a newer API's examples. Verify the actual `v1beta generateContent` response envelope and supported key type. In particular, invalid credentials need not always be a `401`; quota failures can carry structured provider reasons, and content blocking can appear in a generation result rather than an HTTP error.

The direct client will need to preserve the selected funding source while distinguishing these categories. It must not retry permanent key/configuration/eligibility failures blindly, turn every `429` into "daily quota exhausted," assume fallback models are accessible, or expose key/food content through raw provider errors. Retries can consume the user's quota even when the UI never received a result.

These are constraints for the architecture and setup tickets, not a new generic retry feature or quota system.

## Evidence limits

Not established by this research:

- A live call with a current authorization key on the intended Android native build.
- Acceptance of Eatlog's exact schema, nullable fields, output ceiling, and image limit by both models on unpaid projects.
- Enough unpaid quota for any promised number of meals, clarifications, or retries.
- A reliable app-visible distinction between an unpaid key and a billing-enabled key.
- Native enforcement of a proposed package/signature restriction for the chosen API/key combination.
- Legal clearance for arbitrary personal meal inputs, the intended audience, or all target regions.

This note combines read-only subagent research with parent verification of Google's current terms, key guide, and quota documentation. Claims based on code are read-only observations of the working source. No tests, provider calls, credentials, or deployments were used.

## Decision handoff

The research makes one previously vague area precise: what audience, regions, and inputs can Manok support under Google's terms while remaining a direct user-owned-key feature?

Resolve that question with the owner before finalizing the mode contract, estimation architecture, or setup prototype. Treat paid-project-only BYOK, limiting eligible inputs/audiences, obtaining clarification, or changing the intended scope as options to evaluate, not actions already approved. Paid-project-only use would change the expectation of a completely no-cost Google setup and must not be substituted silently.

Secure key persistence and reset/restore behavior are covered by [Establish a safe on-device API-key lifecycle](https://github.com/garettie/eatlog/issues/21). Architecture, setup, and failure behavior remain in their own tickets; this research does not resolve those HITL decisions.
