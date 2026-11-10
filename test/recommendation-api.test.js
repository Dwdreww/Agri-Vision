import test from 'node:test';
import assert from 'node:assert/strict';
import { requestRecommendation, retryAfterMessage } from '../src/recommendation-api.js';
import { RECOMMENDATION_CONSENT_VERSION } from '../src/recommendation-utils.js';

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
  assert.deepEqual(JSON.parse(requests[1].options.body), { regenerate: true, consentVersion: RECOMMENDATION_CONSENT_VERSION });
  assert.equal(requests[1].options.headers.Authorization, 'Bearer private-token');
});

test('provider failures retain readable fallback advice and hide raw server errors', async () => {
  const fallback = { source: 'standard', analysis: 'Review the scan and monitor the sample.', actions: [], tips: [], concerns: [] };
  await assert.rejects(requestRecommendation({ user, uid: 'account', scanId: 'saved', generate: true, fetchImpl: async () => response({ available: true, recommendation: fallback, error: 'SECRET_PROVIDER_DEBUG' }, { status: 503 }) }), error => {
    assert.equal(error.recommendation.source, 'standard');
    assert.match(error.userMessage, /[Ss]tandard guidance remains available/);
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


test('a known timeout explains the failed AI request without exposing raw errors', async () => {
  await assert.rejects(requestRecommendation({ user, uid: 'account', scanId: 'saved', generate: true,
    fetchImpl: async () => response({ errorCode: 'AI_TIMEOUT', error: 'SECRET_PROVIDER_DEBUG' }, { status: 503 })
  }), error => {
    assert.match(error.userMessage, /Gemini took too long/);
    assert.match(error.userMessage, /[Ss]tandard guidance remains available/);
    assert.equal(error.message.includes('SECRET_PROVIDER_DEBUG'), false);
    return true;
  });
});


test('rejected response feedback explains validation without disclosing raw provider text', async () => {
  await assert.rejects(requestRecommendation({ user, uid: 'account', scanId: 'saved', generate: true,
    fetchImpl: async () => response({ errorCode: 'AI_RESPONSE_REJECTED', error: 'SECRET_PROVIDER_DEBUG' }, { status: 503 })
  }), error => {
    assert.match(error.userMessage, /could not be validated/);
    assert.equal(error.message.includes('SECRET_PROVIDER_DEBUG'), false);
    return true;
  });
});

test('all known provider failure reasons are readable and unknown reasons stay generic', async () => {
  for (const [errorCode, expected] of [
    ['AI_RESPONSE_INVALID', /unreadable/], ['AI_INCOMPLETE', /finish/], ['AI_BLOCKED', /could not provide/],
    ['AI_CONFIGURATION', /configuration/], ['AI_STORAGE_UNAVAILABLE', /save/], ['__proto__', /temporarily unavailable/]
  ]) await assert.rejects(requestRecommendation({ user, uid: 'account', scanId: 'saved', generate: true,
    fetchImpl: async () => response({ errorCode, error: 'PRIVATE_SERVER_OUTPUT' }, { status: 503 })
  }), error => expected.test(error.userMessage) && !error.userMessage.includes('PRIVATE'));
});

test('network failure gives a useful message while cancellation stays silent', async () => {
  await assert.rejects(requestRecommendation({ user, uid: 'account', scanId: 'saved', generate: true,
    fetchImpl: async () => { throw new TypeError('PRIVATE_NETWORK_DETAIL'); }
  }), error => /connection/i.test(error.userMessage) && !error.userMessage.includes('PRIVATE'));
  await assert.rejects(requestRecommendation({ user, uid: 'account', scanId: 'saved', generate: true,
    fetchImpl: async () => { throw new DOMException('Aborted', 'AbortError'); }
  }), error => error.name === 'AbortError');
});

test('workspace proxy outages explain that recommendations are offline without exposing server output', async () => {
  for (const status of [500, 502, 504]) {
    await assert.rejects(requestRecommendation({ user, uid: 'account', scanId: 'saved',
      fetchImpl: async () => response({ error: 'PRIVATE_PROXY_DETAIL' }, { status })
    }), error => {
      assert.match(error.userMessage, /recommendation service is unavailable/);
      assert.match(error.userMessage, /saved scan is safe/);
      assert.equal(error.userMessage.includes('PRIVATE_PROXY_DETAIL'), false);
      return true;
    });
  }
});
