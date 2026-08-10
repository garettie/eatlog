import { randomBytes } from 'node:crypto';

const configuredUrl = process.env.EATLOG_WORKER_URL;
if (!configuredUrl) throw new Error('Set EATLOG_WORKER_URL before running the Worker smoke check.');

const baseUrl = new URL(configuredUrl);
if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password
  || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) {
  throw new Error('EATLOG_WORKER_URL must be a public HTTPS origin without credentials, query, or fragment.');
}

async function check(name, path, init, expectedStatus, expectedCode) {
  let response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      ...init,
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error(`${name} request failed.`);
  }
  const body = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(`${name} returned HTTP ${response.status}; expected ${expectedStatus}.`);
  }
  if (expectedCode && body?.error?.code !== expectedCode) {
    throw new Error(`${name} returned an unexpected error contract.`);
  }
  if (!expectedCode && body?.ok !== true) {
    throw new Error(`${name} returned an unexpected health contract.`);
  }
  console.log(`${name}: HTTP ${response.status}`);
}

await check('health', '/healthz', { method: 'GET' }, 200);

if (process.argv.includes('--validation')) {
  await check('wrong method', '/healthz', { method: 'POST' }, 405, 'METHOD_NOT_ALLOWED');
  await check('missing install token', '/v1/usda/foods/1', { method: 'GET' }, 400, 'INVALID_INSTALL_ID');

  const headers = {
    'Content-Type': 'application/json',
    'X-Eatlog-Install-ID': randomBytes(16).toString('hex'),
  };
  await check('malformed JSON', '/v1/usda/search', {
    method: 'POST',
    headers,
    body: '{',
  }, 400, 'MALFORMED_JSON');
  await check('oversized text', '/v1/estimate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ operation: 'describe', text: 'x'.repeat(2_001) }),
  }, 400, 'INVALID_TEXT');
}
