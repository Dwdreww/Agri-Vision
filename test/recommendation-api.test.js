import test from 'node:test';
import assert from 'node:assert/strict';
import { requestRecommendation, retryAfterMessage } from '../src/recommendation-api.js';

const user = { uid: 'account', getIdToken: async () => 'private-token' };
function response(result, { status = 200, retry = '' } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => retry }, json: async () => result };
}

test('cancelling while authentication is pending never dispatches a recommendation request', async () => {
  let resolveToken;
  let requests = 0;
  const controller = new AbortController();
  const pending = requestRecommendation({ user: { uid: 'account', getIdToken: () => new Promise(resolve => { resolveToken = resolve; }) }, uid: 'account', scanId: 'saved', generate: true, signal: controller.signal, fetchImpl: async () => { requests += 1; return response({ available: true, recommendation: null }); } });
  controller.abort();
  resolveToken('private-token');
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(requests, 0);
});

test('history only reads cached advice and generation never sends caller predictions', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, options }); return response({ available: true, recommendation: null }); };
  await requestRecommendation({ user, uid: 'account', scanId: 'saved', fetchImpl });
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.body, undefined);
  await requestRecommendation({ user, uid: 'account', scanId: 'saved', generate: true, regenerate: true, fetchImpl });
  assert.deepEqual(JSON.parse(requests[1].options.body), { regenerate: true, consentVersion: '2026-10-08' });
  assert.equal(requests[1].options.headers.Authorization, 'Bearer private-token');
});

test('provider failures retain readable fallback advice and hide raw server errors', async () => {
  const fallback = { source: 'standard', analysis: 'Review the scan and monitor the sample.', actions: [], tips: [], concerns: [] };
  await assert.rejects(requestRecommendation({ user, uid: 'account', scanId: 'saved', generate: true, fetchImpl: async () => response({ available: true, recommendation: fallback, error: 'SECRET_PROVIDER_DEBUG' }, { status: 503 }) }), error => {
    assert.equal(error.recommendation.source, 'standard');
    assert.match(error.userMessage, /Standard guidance remains available/);
    assert.equal(error.message.includes('SECRET_PROVIDER_DEBUG'), false);
    return true;
  });
});

test('quota retry feedback uses readable seconds, minutes, and hours', async () => {
  assert.equal(retryAfterMessage('30'), ' Try again in 30 seconds.');
  assert.equal(retryAfterMessage('1800'), ' Try again in 30 minutes.');
  assert.equal(retryAfterMessage('3600'), ' Try again in 1 hour.');
  assert.equal(retryAfterMessage('invalid'), '');
  await assert.rejects(requestRecommendation({ user, uid: 'account', scanId: 'saved', generate: true, fetchImpl: async () => response({ error: 'raw' }, { status: 429, retry: '86400' }) }), /Try again in 24 hours/);
});
