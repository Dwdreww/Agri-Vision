import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOMMENDATION_CONSENT_VERSION, normalizeRecommendation, readRecommendationPreference, recommendationPreferenceKey, recommendationText, writeRecommendationPreference } from '../src/recommendation-utils.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('AI consent is explicit, versioned, and isolated between accounts', () => {
  const storage = memoryStorage();
  assert.deepEqual(readRecommendationPreference('first', storage), { enabled: false, choice: null, storageAvailable: true });
  assert.equal(writeRecommendationPreference('first', true, storage), true);
  assert.equal(readRecommendationPreference('first', storage).enabled, true);
  assert.equal(readRecommendationPreference('second', storage).enabled, false);
  assert.equal(writeRecommendationPreference('first', false, storage), true);
  assert.equal(readRecommendationPreference('first', storage).choice, false);
  storage.setItem(recommendationPreferenceKey('first'), JSON.stringify({ version: 'outdated', enabled: true }));
  assert.equal(readRecommendationPreference('first', storage).enabled, false);
  storage.setItem(recommendationPreferenceKey('first'), JSON.stringify({ version: RECOMMENDATION_CONSENT_VERSION, enabled: 'true' }));
  assert.equal(readRecommendationPreference('first', storage).enabled, false);
});

test('blocked or corrupted preference storage never enables external generation', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(readRecommendationPreference('first', blocked), { enabled: false, choice: null, storageAvailable: false });
  assert.equal(writeRecommendationPreference('first', true, blocked), false);
  assert.equal(writeRecommendationPreference('', true, memoryStorage()), false);
  const storage = memoryStorage();
  storage.setItem(recommendationPreferenceKey('first'), 'broken JSON');
  assert.equal(readRecommendationPreference('first', storage).enabled, false);
  assert.equal(readRecommendationPreference('first', storage).storageAvailable, true);
  assert.equal(writeRecommendationPreference('first', true, storage), true);
  assert.equal(readRecommendationPreference('first', storage).enabled, true);
});

test('advice cards reject malformed responses and bound displayed text and lists', () => {
  assert.equal(normalizeRecommendation({ source: 'provider', analysis: 'Unvalidated' }), null);
  assert.equal(normalizeRecommendation({ source: 'gemini', analysis: {} }), null);
  const advice = normalizeRecommendation({ source: 'gemini', analysis: 'a'.repeat(4000), concerns: Array(30).fill('Check symptoms'), actions: [{ text: 'Review', reason: 'Verify symptoms' }, { text: {} }], tips: [null, 'Monitor'], provider: 'Google', unknownField: 'excluded' });
  assert.equal(advice.analysis.length, 3000);
  assert.equal(advice.concerns.length, 12);
  assert.deepEqual(advice.actions, [{ text: 'Review', reason: 'Verify symptoms' }]);
  assert.deepEqual(advice.tips, ['Monitor']);
  assert.equal('unknownField' in advice, false);
});

test('copied standard guidance stays labelled separately and includes action reasons', () => {
  const text = recommendationText({ source: 'standard', analysis: 'The image result is inconclusive.', concerns: ['Symptoms need review'], actions: [{ text: 'Retake the photo', reason: 'Use even daylight' }], tips: ['Keep a monitoring record'] });
  assert.match(text, /^Standard guidance/);
  assert.match(text, /Retake the photo — Use even daylight/);
  assert.match(text, /Symptoms need review/);
  assert.equal(recommendationText(null), '');
});
