import { t } from './i18n.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, Copy, LoaderCircle, RefreshCw, ShieldCheck, BookOpen } from 'lucide-react';
import { auth, browserWorkspace } from './firebase';
import { useWorkspaceServices } from './services';
import { readableError } from './utils';
import { RECOMMENDATION_PREFERENCE_EVENT, readRecommendationPreference, recommendationPreferenceKey, recommendationText, writeRecommendationPreference } from './recommendation-utils.js';
import { requestRecommendation } from './recommendation-api.js';

export function useRecommendationPreference(uid) {
  const [preference, setPreference] = useState(() => readRecommendationPreference(uid));
  useEffect(() => {
    const update = event => {
      if (!event || event.type !== 'storage' || event.key === null || event.key === recommendationPreferenceKey(uid)) setPreference(readRecommendationPreference(uid));
    };
    update();
    window.addEventListener('storage', update);
    window.addEventListener(RECOMMENDATION_PREFERENCE_EVENT, update);
    return () => { window.removeEventListener('storage', update); window.removeEventListener(RECOMMENDATION_PREFERENCE_EVENT, update); };
  }, [uid]);
  const setEnabled = useCallback(enabled => {
    const saved = writeRecommendationPreference(uid, enabled);
    setPreference(saved ? readRecommendationPreference(uid) : { enabled: false, choice: null, storageAvailable: false });
    if (saved) window.dispatchEvent(new Event(RECOMMENDATION_PREFERENCE_EVENT));
    return saved;
  }, [uid]);
  return { ...preference, setEnabled };
}

export function RecommendationPreference({ uid, compact = false }) {
  const { enabled, choice, storageAvailable, setEnabled } = useRecommendationPreference(uid);
  const services = useWorkspaceServices();
  if (browserWorkspace) return <section className="panel recommendation-preference"><h3>{t("Optional AI recommendations")}</h3><p>{t("AI advice is not available in guest mode. You can still save photos, write field notes, and plan care tasks.")}</p></section>;
  return <section className={`recommendation-preference ${compact ? 'recommendation-preference-compact' : ''}`} aria-label={t("AI recommendation preference")}>
    <div className="recommendation-preference-title"><ShieldCheck size={19} /><h3>{t("Optional AI recommendations")}</h3></div>
    <p>{t("When enabled, newly saved checks automatically receive text advice from Google Gemini. Google receives only the model’s detected labels, confidence values, detection count, and model version. Photos, account details, farm names, notes, locations, and your field notes are excluded.")}</p>
    <p>{t("With the free service, Google may use inputs and responses to improve its products. ")}<a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">{t("Read Google’s data-use terms")}</a>.</p>
    <p className="helper-text">{t("Your choice is saved for this account on this device. You can turn it off here or in Settings. Existing saved advice remains available.")}</p>
    {!storageAvailable && <p className="error-text" role="status">{t("Device storage is unavailable. AI recommendations stay off until your preference can be saved.")}</p>}
    {!services.checking && !services.recommendations && <p className="helper-text">{t("AI advice is not configured in this workspace. Scanning and standard guidance remain available.")}</p>}
    <label className="check-label"><input type="checkbox" checked={Boolean(enabled)} disabled={!storageAvailable} onChange={event => setEnabled(event.target.checked)} /><span><strong>{enabled ? t("Automatic AI recommendations enabled") : t("Enable automatic AI recommendations")}</strong><small>{choice === false ? t("Off. New checks will use the scanner’s standard guidance.") : t("I understand what is sent to Google and agree to enable text-only recommendations.")}</small></span></label>
  </section>;
}

function displayError(error) { return error?.userMessage || readableError(error); }

export default function RecommendationCard(props) {
  if (browserWorkspace) return <section className="panel" aria-label={t("AI Recommendations")}><h3>{t("AI Recommendations")}</h3><p className="helper-text">{t("AI advice is not available in guest mode. Write a field note about what you see and use the health guide to understand condition labels.")}</p></section>;
  return <RecommendationContent key={`${props.uid}:${props.scanId}`} {...props} />;
}

function RecommendationContent({ uid, scanId, autoGenerate = false }) {
  const services = useWorkspaceServices();
  const { enabled } = useRecommendationPreference(uid);
  const [recommendation, setRecommendation] = useState(null);
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const generation = useRef(0);
  const activeController = useRef(null);
  const attemptedAuto = useRef(new Set());
  const busy = phase === 'loading' || phase === 'generating';

  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    activeController.current?.abort();
    activeController.current = controller;
    setRecommendation(null);
    setError('');
    setCopied(false);
    setPhase('loading');
    if (!scanId) { setPhase('ready'); return undefined; }
    requestRecommendation({ user: auth?.currentUser, uid, scanId, signal: controller.signal }).then(result => {
      if (generation.current !== request) return;
      setRecommendation(result.recommendation);
      setAvailable(result.available);
      setPhase('ready');
    }).catch(error => {
      if (generation.current !== request || error.name === 'AbortError') return;
      if (error.recommendation) setRecommendation(error.recommendation);
      setError(displayError(error));
      setPhase('read-error');
    });
    return () => { ++generation.current; controller.abort(); activeController.current?.abort(); };
  }, [uid, scanId, readAttempt]);

  const generate = useCallback(async (regenerate = false) => {
    if (!enabled || !scanId || activeController.current?.generation) return;
    const request = ++generation.current;
    const controller = new AbortController();
    controller.generation = true;
    activeController.current?.abort();
    activeController.current = controller;
    setPhase('generating');
    setError('');
    setCopied(false);
    try {
      const result = await requestRecommendation({ user: auth?.currentUser, uid, scanId, generate: true, regenerate, signal: controller.signal });
      if (generation.current !== request) return;
      setAvailable(result.available);
      if (result.recommendation) setRecommendation(result.recommendation);
      setPhase('ready');
    } catch (error) {
      if (generation.current !== request || error.name === 'AbortError') return;
      if (error.recommendation) setRecommendation(previous => previous || error.recommendation);
      setError(displayError(error));
      setPhase('ready');
    } finally { if (activeController.current === controller) controller.generation = false; }
  }, [enabled, uid, scanId]);

  useEffect(() => {
    const key = `${uid}:${scanId}`;
    if (autoGenerate && enabled && phase === 'ready' && available && !recommendation && !attemptedAuto.current.has(key)) {
      attemptedAuto.current.add(key);
      generate();
    }
  }, [autoGenerate, enabled, phase, available, recommendation, scanId, uid, generate]);

  useEffect(() => {
    if (!enabled && activeController.current?.generation) {
      activeController.current.abort();
      ++generation.current;
      setPhase('ready');
    }
  }, [enabled]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(recommendationText(recommendation));
      setCopied(true);
    } catch { setError('Copy is unavailable here. Select the advice text to copy it.'); }
  }
  return <section className="ai-recommendations" aria-label={t("AI Recommendations")} aria-busy={busy}>
    <div className="recommendation-card-heading"><BookOpen size={19} /><h3>{t("AI Recommendations")}</h3></div>
    <p className="helper-text">{t("Text advice is separate from the scanner’s classification. Review it against the plant’s actual symptoms.")}</p>
    <div className="visually-hidden" role="status" aria-live="polite">{phase === 'loading' ? t("Loading saved recommendations.") : phase === 'generating' ? t("Generating text recommendations. Your check is already saved.") : copied ? t("Recommendations copied.") : recommendation ? t("Recommendations ready.") : ''}</div>
    {phase === 'loading' && <p className="scan-stage"><LoaderCircle className="spin" size={17} />{t(" Loading saved advice…")}</p>}
    {recommendation && <div className="recommendation-analysis">
      {recommendation.source === 'standard' && <p className="recommendation-source"><ShieldCheck size={16} /><strong>{t("Standard guidance · not generated by AI")}</strong></p>}
      <p>{recommendation.analysis}</p>
      {recommendation.concerns.length > 0 && <div><h4>{t("Concerns to check")}</h4><ul className="recommendation-list">{recommendation.concerns.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      {recommendation.actions.length > 0 && <div><h4>{t("Recommended actions")}</h4><ul className="recommendation-list">{recommendation.actions.map((item, index) => <li key={index}><strong>{item.text}</strong>{item.reason && <p>{item.reason}</p>}</li>)}</ul></div>}
      {recommendation.tips.length > 0 && <div><h4>{t("Additional tips")}</h4><ul className="recommendation-list">{recommendation.tips.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      {recommendation.source === 'gemini' && <p className="recommendation-footer">{recommendation.provider || t("Google")} · {recommendation.model || t("Gemini")}{recommendation.generatedAt && Number.isFinite(Date.parse(recommendation.generatedAt)) ? ` · ${new Date(recommendation.generatedAt).toLocaleString()}` : ''}</p>}
    </div>}
    {phase === 'generating' && <p className="scan-stage"><LoaderCircle className="spin" size={17} />{t(" Generating recommendations… Your check is saved.")}</p>}
    {error && <p className="inline-error" role="alert"><CircleAlert size={17} /> {t(error)}</p>}
    {!busy && !recommendation && !error && <p>{available ? enabled ? t("No saved advice yet. Generate text recommendations for this result.") : t("Enable optional recommendations below to get text advice for this result.") : t("AI generation is unavailable. Your check and the scanner’s standard guidance are still available.")}</p>}
    <div className="recommendation-actions">
      {recommendation && <button type="button" className="button button-soft" onClick={copy}><Copy size={15} /> {copied ? t("Copied") : t("Copy advice")}</button>}
      {phase === 'read-error' && <button type="button" className="button button-soft" onClick={() => setReadAttempt(value => value + 1)}><RefreshCw size={15} />{t(" Retry loading")}</button>}
      {available && enabled && phase !== 'read-error' && <button type="button" className="button button-soft" disabled={busy} onClick={() => generate(Boolean(recommendation))}><RefreshCw className={phase === 'generating' ? 'spin' : ''} size={15} /> {recommendation ? t("Regenerate") : error ? t("Retry recommendations") : t("Generate recommendations")}</button>}
    </div>
    {!enabled && <details className="advice-preference-details"><summary>{t("Set up optional AI advice")}</summary><RecommendationPreference uid={uid} compact /></details>}
    {!busy && recommendation && !available && <p className="helper-text">{t("Saved advice remains available. AI advice is not configured in this workspace.")}</p>}
    {!services.recommendations && services.checking && <p className="helper-text">{t("Checking AI service availability…")}</p>}
  </section>;
}
