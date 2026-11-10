import { RECOMMENDATION_CONSENT_VERSION, normalizeRecommendation } from './recommendation-utils.js';

function recommendationError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

export function retryAfterMessage(value) {
  const retry = Number(value);
  if (!Number.isFinite(retry) || retry <= 0) return '';
  const seconds = Math.min(86400, Math.ceil(retry));
  const amount = seconds >= 3600 ? Math.ceil(seconds / 3600) : seconds >= 60 ? Math.ceil(seconds / 60) : seconds;
  const unit = seconds >= 3600 ? 'hour' : seconds >= 60 ? 'minute' : 'second';
  return ` Try again in ${amount} ${unit}${amount === 1 ? '' : 's'}.`;
}

// The original photo and prediction come from the owner's saved scan. The client
// sends only the explicit consent version and whether this is a regeneration.
export async function requestRecommendation({ user, uid, scanId, generate = false, regenerate = false, signal, fetchImpl = globalThis.fetch }) {
  if (!user || user.uid !== uid) throw recommendationError('Sign in to this account to view its recommendations.');
  const token = await user.getIdToken();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  let response;
  try { response = await fetchImpl(`/api/workspace/scans/${encodeURIComponent(scanId)}/recommendations`, {
    method: generate ? 'POST' : 'GET', signal,
    headers: { Authorization: `Bearer ${token}`, ...(generate ? { 'Content-Type': 'application/json' } : {}) },
    ...(generate ? { body: JSON.stringify({ regenerate, consentVersion: RECOMMENDATION_CONSENT_VERSION }) } : {})
  }); } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw recommendationError('Could not reach the recommendation service. Your scan is saved. Check your connection and try again.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const knownProviderMessages = {
      AI_TIMEOUT: 'Gemini took too long to respond. Your scan is saved. Try recommendations again; standard guidance remains available.',
      AI_RESPONSE_REJECTED: 'Gemini returned advice that could not be validated against this scan. Existing advice or standard guidance remains available. You can retry recommendations.',
      AI_PROVIDER_UNAVAILABLE: 'Google Gemini is temporarily unavailable. Your scan is saved. Standard guidance remains available; try again later.',
      AI_RESPONSE_INVALID: 'Gemini returned an unreadable response. Your scan is saved. You can retry recommendations.',
      AI_INCOMPLETE: 'Gemini did not finish its response. Your scan is saved. You can retry recommendations.',
      AI_BLOCKED: 'Gemini could not provide advice for this request. Your scan and standard guidance remain available.',
      AI_CONFIGURATION: 'Recommendations need a server configuration check. Your scan and standard guidance remain available.',
      AI_STORAGE_UNAVAILABLE: 'The recommendation could not be saved. Your scan and existing advice remain available. Try again later.',
      AI_PHOTO_UNAVAILABLE: 'The saved scan photo is unavailable. You can still use the standard guidance.',
      AI_PHOTO_CONSENT_REQUIRED: 'Enable photo-based recommendations before sending this scan to Gemini.'
    };
    const providerMessage = Object.hasOwn(knownProviderMessages, result?.errorCode) ? knownProviderMessages[result.errorCode] : '';
    const serviceMessage = [500, 502, 504].includes(response.status) ? 'The recommendation service is unavailable. Your saved scan is safe. Please try again.' : '';
    const message = providerMessage || serviceMessage || ({ 400: 'This saved result cannot be used for recommendations. The scanner’s standard guidance remains available.', 401: 'Your session expired. Sign in again to view recommendations.', 403: 'This account does not have access to these recommendations.', 404: 'This scan is no longer available.', 409: 'Another recommendation is being generated. Please try again shortly.', 429: 'The recommendation service has reached a request limit.', 503: 'Recommendations are temporarily unavailable. Standard guidance remains available.' })[response.status] || 'Recommendations are temporarily unavailable. Please try again.';
    const error = recommendationError(`${message}${retryAfterMessage(response.headers.get('Retry-After'))}`);
    error.recommendation = normalizeRecommendation(result?.recommendation);
    throw error;
  }
  if (!result || typeof result.available !== 'boolean') throw recommendationError('The recommendation service returned an unreadable response. Please try again.');
  const recommendation = normalizeRecommendation(result.recommendation);
  if (result.recommendation && !recommendation) throw recommendationError('The saved advice could not be read. Please try again.');
  return { available: result.available, recommendation };
}
