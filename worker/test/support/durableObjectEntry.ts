/**
 * Test-only entry point. Milestone 1 requires the real `EntitlementQuotaState` class and its
 * real SQLite statements to be exercised in a Workers runtime, not a hand-written mock of the
 * same SQL. This module exists solely so a local runtime can be given something to boot; it is
 * never bundled into a deployed Worker and never reachable from the public routes.
 */
export { EntitlementQuotaState } from '../../src/subscriptionDurableObject';

interface HarnessEnv {
  ACCESS_STATE: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: HarnessEnv): Promise<Response> {
    const url = new URL(request.url);
    const objectName = url.searchParams.get('object') ?? 'entitlement-quota-v1';
    const stub = env.ACCESS_STATE.get(env.ACCESS_STATE.idFromName(objectName));
    return await stub.fetch(`https://access.internal${url.pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
    });
  },
};
