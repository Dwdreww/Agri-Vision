import { t } from './i18n.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, Copy, LoaderCircle, RefreshCw, ShieldCheck, BookOpen } from 'lucide-react';
import { auth, db, browserWorkspace, workspaceMode } from './firebase';
import { doc, onSnapshot, runTransaction, updateDoc } from 'firebase/firestore';
import { useWorkspaceServices } from './services';
import { readableError } from './utils';
import { RECOMMENDATION_CONSENT_VERSION, RECOMMENDATION_PREFERENCE_EVENT, readRecommendationPreference, recommendationPreferenceKey, recommendationText, writeRecommendationPreference } from './recommendation-utils.js';
import { requestRecommendation } from './recommendation-api.js';

export function useRecommendationPreference(uid) {
  const [preference, setPreference] = useState(() => readRecommendationPreference(uid));
  const cloud=workspaceMode==='cloud'&&Boolean(uid);
  const [saving,setSaving]=useState(false);
  useEffect(() => {
    if(cloud){
      setPreference({enabled:false,choice:null,storageAvailable:false});
      const ref=doc(db,'users',uid);
      return onSnapshot(ref,snapshot=>{
        const value=snapshot.data()?.preferences?.recommendations;
        const valid=value?.version===RECOMMENDATION_CONSENT_VERSION&&typeof value.enabled==='boolean';
        setPreference({enabled:valid&&value.enabled,choice:valid?value.enabled:null,storageAvailable:snapshot.exists()});
        const previous=readRecommendationPreference(uid);
        if(!value&&previous.choice!==null)runTransaction(db,async tx=>{const current=await tx.get(ref);if(current.exists()&&!current.data().preferences?.recommendations)tx.update(ref,{'preferences.recommendations':{version:RECOMMENDATION_CONSENT_VERSION,enabled:previous.choice}});}).catch(()=>{});
      },()=>setPreference({enabled:false,choice:null,storageAvailable:false,error:'Your recommendation preference could not be loaded. Please try again.'}));
    }
    const update = event => {
      if (!event || event.type !== 'storage' || event.key === null || event.key === recommendationPreferenceKey(uid)) setPreference(readRecommendationPreference(uid));
    };
    update();
    window.addEventListener('storage', update);
    window.addEventListener(RECOMMENDATION_PREFERENCE_EVENT, update);
    return () => { window.removeEventListener('storage', update); window.removeEventListener(RECOMMENDATION_PREFERENCE_EVENT, update); };
  }, [uid,cloud]);
  const setEnabled = useCallback(async enabled => {
    if(cloud){
      setSaving(true);
      try{await updateDoc(doc(db,'users',uid),{'preferences.recommendations':{version:RECOMMENDATION_CONSENT_VERSION,enabled:Boolean(enabled)}});return true;}
      catch{setPreference(current=>({...current,error:'Your recommendation preference could not be saved. Please try again.'}));return false;}
      finally{setSaving(false);}
    }
    const saved = writeRecommendationPreference(uid, enabled);
    setPreference(saved ? readRecommendationPreference(uid) : { enabled: false, choice: null, storageAvailable: false });
    if (saved) window.dispatchEvent(new Event(RECOMMENDATION_PREFERENCE_EVENT));
    return saved;
  }, [uid,cloud]);
  return { ...preference, saving, setEnabled };
}

export function RecommendationPreference({ uid, compact = false }) {
  const { enabled, choice, storageAvailable, saving, error, setEnabled } = useRecommendationPreference(uid);
  const services = useWorkspaceServices();
  if (workspaceMode === 'demo') return <section className="recommendation-preference"><h3>{t('Optional recommendations')}</h3><p>{t('Gemini recommendations are available in the local workspace. This public demo shows model predictions only.')}</p></section>;
  if (browserWorkspace) return <section className="panel recommendation-preference"><h3>{t("Optional recommendations")}</h3><p>{t("Recommendations are not available in guest mode. You can still save photos, write field notes, and plan care tasks.")}</p></section>;
  return <section className={`recommendation-preference ${compact ? 'recommendation-preference-compact' : ''}`} aria-label={t("Recommendation preference")}>
    <div className="recommendation-preference-title"><ShieldCheck size={19} /><h3>{t("Optional recommendations")}</h3></div>
    <p>{t("When enabled, AgriVision sends your original scan photo and the scanner’s result to Google Gemini to generate advice. This happens automatically for new checks and when you request advice for a saved check. AgriVision keeps your account details, farm names, saved locations, and field notes private.")}</p>
    <p>{t("AgriVision uses a recorded variety or growth stage to tailor the report privately.")}</p>
    <p>{t("With the free service, Google may use inputs and responses to improve its products. ")}<a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">{t("Read Google’s data-use terms")}</a>.</p>
    <p className="helper-text">{t(workspaceMode==='cloud'?"Your choice is saved in your private account across devices. You can turn it off here or in Settings. Existing saved advice remains available.":"Your choice is saved for this account on this device. You can turn it off here or in Settings. Existing saved advice remains available.")}</p>
    {!storageAvailable && <p className="error-text" role="status">{t("Recommendations stay off until your preference can be loaded and saved.")}</p>}
    {error&&<p className="error-text" role="alert">{t(error)}</p>}
    {!services.checking && !services.recommendations && <p className="helper-text">{t("Gemini recommendations are not configured in this workspace. Scanning and standard guidance remain available.")}</p>}
    <label className="check-label"><input type="checkbox" checked={Boolean(enabled)} disabled={!storageAvailable||saving} onChange={event => setEnabled(event.target.checked)} /><span><strong>{enabled ? t("Automatic recommendations enabled") : t("Enable automatic recommendations")}</strong><small>{choice === false ? t("Off. New checks will use the scanner’s standard guidance.") : t("I agree to send my scan photos and scanner results to Google Gemini for recommendations.")}</small></span></label>
  </section>;
}

function displayError(error) { return error?.userMessage || readableError(error); }

export default function RecommendationCard(props) {
  if (workspaceMode === 'demo') return <section className="panel"><h3>{t('Recommendations')}</h3><p>{t('Gemini recommendations are available in the local workspace. This public demo shows model predictions only.')}</p></section>;
  if (browserWorkspace) return <section className="panel" aria-label={t("Recommendations")}><h3>{t("Recommendations")}</h3><p className="helper-text">{t("Recommendations are not available in guest mode. Write a field note about what you see and use the health guide to understand condition labels.")}</p></section>;
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
  const serviceWasAvailable = useRef(services.recommendations);
  const busy = phase === 'loading' || phase === 'generating';
  useEffect(() => {
    const restored = services.recommendations && !serviceWasAvailable.current;
    serviceWasAvailable.current = services.recommendations;
    if (restored && (phase === 'read-error' || phase === 'ready' && !available)) setReadAttempt(value => value + 1);
  }, [services.recommendations, phase, available]);

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
    if (autoGenerate && enabled && phase === 'ready' && available && recommendation?.source !== 'gemini' && !attemptedAuto.current.has(key)) {
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
  return <section className="ai-recommendations" aria-label={t("Recommendations")} aria-busy={busy}>
    <div className="recommendation-card-heading"><BookOpen size={19} /><h3>{t("Recommendations")}</h3></div>
    <div className="visually-hidden" role="status" aria-live="polite">{phase === 'loading' ? t("Loading saved recommendations.") : phase === 'generating' ? t("Generating text recommendations. Your check is already saved.") : copied ? t("Recommendations copied.") : recommendation ? t("Recommendations ready.") : ''}</div>
    {phase === 'loading' && <p className="scan-stage"><LoaderCircle className="spin" size={17} />{t(" Loading saved advice…")}</p>}
    {recommendation && <div className="recommendation-analysis">
      {recommendation.source === 'standard' && <p className="recommendation-source"><ShieldCheck size={16} /><strong>{t("Standard guidance · reference information")}</strong></p>}
      {recommendation.actions.length > 0 && <div>
        <h4>{t("What to do first")}</h4>
        <ul className="recommendation-list">{recommendation.actions.map((item, index) => <li key={index}>
          <strong>{item.text}</strong>{item.reason && <p>{item.reason}</p>}
        </li>)}</ul>
      </div>}
      {recommendation.photoObservations && <div>
        <h4>{t("What Gemini sees in your photo")}</h4>
        {recommendation.photoObservations.length ? <ul className="recommendation-list">
          {recommendation.photoObservations.map((item, index) => <li key={index}>{item}</li>)}
        </ul> : <p>{t("Gemini could not identify clear features in this photo.")}</p>}
        <p>{recommendation.analysis}</p>
      </div>}
      {recommendation.sections?.length ? <details className="agronomist-report">
        <summary>{t("Read the full report")}</summary>
        {!recommendation.photoObservations && <p>{recommendation.analysis}</p>}
        <ol>{recommendation.sections.map(section => <li key={section.title}>
          <h4>{section.title}</h4>
          {recommendation.sections.length === 10
            ? <ul className="recommendation-list">{section.text.split('\n').map((line, index) => <li key={index}>{line}</li>)}</ul>
            : <p>{section.text}</p>}
        </li>)}</ol>
      </details> : <>
        <p>{recommendation.analysis}</p>
        {recommendation.concerns.length > 0 && <div><h4>{t("Concerns to check")}</h4><ul className="recommendation-list">{recommendation.concerns.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        {recommendation.tips.length > 0 && <div><h4>{t("Additional tips")}</h4><ul className="recommendation-list">{recommendation.tips.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      </>}
      {recommendation.source === 'gemini' && <p className="recommendation-footer">{t("Powered by Google Gemini")}</p>}
    </div>}
    {phase === 'generating' && <p className="scan-stage"><LoaderCircle className="spin" size={17} />{t(" Generating recommendations… Your check is saved.")}</p>}
    {error && <p className="inline-error" role="alert"><CircleAlert size={17} /> {t(error)}</p>}
    {!busy && !recommendation && !error && <p>{available ? enabled ? t("No saved advice yet. Generate text recommendations for this result.") : t("Enable optional recommendations below to get text advice for this result.") : t("Recommendation generation is unavailable. Your check and the scanner’s standard guidance are still available.")}</p>}
    <div className="recommendation-actions">
      {recommendation && <button type="button" className="button button-soft" onClick={copy}><Copy size={15} /> {copied ? t("Copied") : t("Copy advice")}</button>}
      {phase === 'read-error' && <button type="button" className="button button-soft" onClick={() => setReadAttempt(value => value + 1)}><RefreshCw size={15} />{t(" Retry loading")}</button>}
      {available && enabled && phase !== 'read-error' && <button type="button" className="button button-soft" disabled={busy} onClick={() => generate(recommendation?.source === 'gemini')}><RefreshCw className={phase === 'generating' ? 'spin' : ''} size={15} /> {recommendation?.source === 'gemini' ? t("Regenerate") : error ? t("Retry recommendations") : t("Generate recommendations")}</button>}
    </div>
    {!enabled && <details className="advice-preference-details"><summary>{t("Set up recommendations")}</summary><RecommendationPreference uid={uid} compact /></details>}
    {!busy && recommendation && !available && <p className="helper-text">{t("Saved advice remains available. Gemini recommendations are not configured in this workspace.")}</p>}
    {!services.recommendations && services.checking && <p className="helper-text">{t("Checking recommendation service availability…")}</p>}
  </section>;
}
