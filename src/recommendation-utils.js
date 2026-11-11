import { numericConfidence } from './confidence.js';

export const RECOMMENDATION_CONSENT_VERSION = '2026-11-10-photo';
export const RECOMMENDATION_PREFERENCE_EVENT = 'pineapple-health:recommendation-preference';

export function recommendationPreferenceKey(uid) {
  return uid ? `pineapple-health:recommendations:${uid}` : '';
}

export function readRecommendationPreference(uid, storage) {
  const key = recommendationPreferenceKey(uid);
  if (!key) return { enabled: false, choice: null, storageAvailable: false };
  let raw;
  try { raw = (storage || globalThis.localStorage).getItem(key); }
  catch { return { enabled: false, choice: null, storageAvailable: false }; }
  let value;
  try { value = JSON.parse(raw || 'null'); } catch { value = null; }
  const valid = value?.version === RECOMMENDATION_CONSENT_VERSION && typeof value.enabled === 'boolean';
  return { enabled: valid && value.enabled, choice: valid ? value.enabled : null, storageAvailable: true };
}

export function writeRecommendationPreference(uid, enabled, storage) {
  const key = recommendationPreferenceKey(uid);
  if (!key) return false;
  try {
    (storage || globalThis.localStorage).setItem(key, JSON.stringify({ version: RECOMMENDATION_CONSENT_VERSION, enabled: Boolean(enabled) }));
    return true;
  } catch { return false; }
}

export function formatConfidence(value) {
  const number = numericConfidence(value);
  return number === null ? 'Unavailable' : `${number.toFixed(1)}%`;
}

function textValue(value, limit = 3000) { return typeof value === 'string' ? value.slice(0, limit).trim() : ''; }
function textList(value) { return Array.isArray(value) ? value.slice(0, 12).map(item => textValue(item)).filter(Boolean) : []; }

// Only plain, bounded text reaches the advice card. Never render provider HTML.
export function normalizeRecommendation(value) {
  if (!value || !['gemini', 'standard'].includes(value.source)) return null;
  const analysis = textValue(value.analysis);
  const actions = Array.isArray(value.actions) ? value.actions.slice(0, 12).map(action => ({ text: textValue(action?.text), reason: textValue(action?.reason) })).filter(action => action.text) : [];
  if (!analysis) return null;
  const sections = value.source === 'gemini' && Array.isArray(value.sections) && [10, 15].includes(value.sections.length)
    ? value.sections.map(section => ({ title: textValue(section?.title, 120), text: textValue(section?.text, 700) }))
    : [];
  const report = sections.every(section => section.title && section.text) ? sections : [];
  return {
    source: value.source, analysis, concerns: textList(value.concerns), actions, tips: textList(value.tips), sections: report,
    ...(value.source === 'gemini' && Array.isArray(value.photoObservations) && {
      photoObservations: textList(value.photoObservations.slice(0, 3))
    }),
    provider: textValue(value.provider, 100), model: textValue(value.model, 150), generatedAt: textValue(value.generatedAt, 100)
  };
}

export function recommendationText(value) {
  const recommendation = normalizeRecommendation(value);
  if (!recommendation) return '';
  return [recommendation.source === 'standard' ? 'Standard guidance' : 'Recommendations', recommendation.analysis,
    recommendation.photoObservations?.length ? `Photo observations\n${recommendation.photoObservations.map(item => `• ${item}`).join('\n')}` : '',
    recommendation.concerns.length ? `Concerns\n${recommendation.concerns.map(item => `• ${item}`).join('\n')}` : '',
    recommendation.actions.length ? `Recommended actions\n${recommendation.actions.map(item => `• ${item.text}${item.reason ? ` — ${item.reason}` : ''}`).join('\n')}` : '',
    recommendation.tips.length ? `Additional tips\n${recommendation.tips.map(item => `• ${item}`).join('\n')}` : '',
    ...recommendation.sections.map(({ title, text }, index) => {
      const content = recommendation.sections.length === 10 ? text.split('\n').map(line => `• ${line}`).join('\n') : text;
      return `${index + 1}. ${title}\n${content}`;
    })
  ].filter(Boolean).join('\n\n');
}
