import { t } from './i18n.js';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleCheck, CloudOff, ImagePlus, LoaderCircle, Plus, RefreshCw, ScanLine, ShieldCheck, Trash2 } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { cleanupUnsavedScan, deleteScan, saveScan, shareScan, userCollection } from './data';
import { prepareImage, readableError } from './utils';
import { ScanNextStep, ScanResultIndicators } from './components';
import RecommendationCard, { RecommendationPreference } from './Recommendations.jsx';
import { formatConfidence } from './recommendation-utils.js';
import { useWorkspaceServices } from './services';
import { newBrowserId } from './browser-store.js';
import { PageHelp } from './Guidance.jsx';
import { scanAssessment } from './scan-assessment.js';
import { isDetectionOnly } from './detection-regions.js';

export default function ScanView({ uid, user, plots, farms, initialPlotId, onNotify, onNavigate, online, initialFile = null, onInitialFileConsumed }) {
  const services = useWorkspaceServices();
  const [plotId, setPlotId] = useState(initialPlotId || (services.browser ? plots.find(plot => !plot.archivedAt)?.id || '' : ''));
  const [preparedFile, setPreparedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [prediction, setPrediction] = useState(null);
  const [stage, setStage] = useState('idle');
  const [flowStep, setFlowStep] = useState(0);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [removing, setRemoving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareWanted, setShareWanted] = useState(false);
  const [userCondition, setUserCondition] = useState('');
  const [growthStage, setGrowthStage] = useState('');
  const fileInput = useRef(null);
  const receivedInitialFile = useRef(null);
  const resultHeading = useRef(null);
  const plotSelect = useRef(null);
  const stepHeading = useRef(null);
  const deleteTrigger = useRef(null);
  const cancelDelete = useRef(null);
  const previousStep = useRef(0);
  const activePlots = plots.filter(plot => !plot.archivedAt && farms.some(farm => farm.id === plot.farmId && !farm.archivedAt));

  useEffect(() => {
    if (!initialFile || receivedInitialFile.current === initialFile) return;
    receivedInitialFile.current = initialFile;
    receiveImage(initialFile);
    onInitialFileConsumed?.();
  }, [initialFile]);

  useEffect(() => { if (initialPlotId) setPlotId(initialPlotId); }, [initialPlotId]);
  useEffect(() => { if (confirmDelete) cancelDelete.current?.focus(); }, [confirmDelete]);
  useEffect(() => {
    if (!preparedFile) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(preparedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preparedFile]);

  useEffect(() => {
    if (previousStep.current === flowStep) return;
    previousStep.current = flowStep;
    const heading = flowStep === 2 ? resultHeading.current : stepHeading.current;
    heading?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 760px)').matches) heading?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [flowStep]);

  async function receiveImage(file) {
    if (!file) return;
    if (stage === 'unsaved' && pendingId) {
      try { await cleanupUnsavedScan(uid, pendingId); }
      catch { onNotify('The previous unsaved upload could not be cleared yet. It will be removed with your account.', 'error'); }
    }
    if (flowStep === 2) {
      setFlowStep(0);
      setShareWanted(false);
      setConfirmDelete(false);
      setUserCondition('');
      setGrowthStage('');
    }
    setStage('preparing');
    setPreparedFile(null);
    setError('');
    setPrediction(null);
    setSavedId('');
    setPendingId('');
    try {
      setPreparedFile(await prepareImage(file));
      setStage('ready');
    } catch (error) {
      setPreparedFile(null);
      setStage('idle');
      setError(readableError(error));
    }
  }
  async function persistResult(result, scanId) {
    const plot = activePlots.find(item => item.id === plotId);
    if (!plot) { setStage('unsaved'); setError("Choose an active growing area before saving this result."); return; }
    setStage('saving');
    setError('');
    try {
      await saveScan(uid, scanId, plot.id, plot.farmId, preparedFile, result, userCondition, {
        cultivar: plot.variety, growthStage
      });
      setSavedId(scanId);
      setStage('saved');
      if (shareWanted && formatConfidence(result.top_confidence) === 'Unavailable') {
        onNotify("Check saved. This result is unavailable for research sharing.", 'error');
      } else if (shareWanted) {
        try { await shareScan(scanId); onNotify("Check saved and shared for research."); }
        catch (error) { onNotify(t('Check saved. Research sharing could not be completed: {reason}', { reason: t(readableError(error)) }), 'error'); }
      } else onNotify(result.is_photo_only ? 'Photo saved in this browser.' : "Check saved to this growing area.");
    } catch (error) {
      setStage('unsaved');
      setError(t(result.is_photo_only ? 'Your photo has not been saved: {reason}' : 'The model result is ready, but it has not been saved: {reason}', { reason: t(readableError(error)) }));
    }
  }
  async function analyze() {
    if (!online) { setError('Connect to the internet before scanning.'); return; }
    if (!services.scanner || (!services.photos && !services.demo)) { setError('Scanning and photo saving are temporarily unavailable.'); return; }
    if ((!plotId && !services.demo) || !preparedFile || stage === 'analyzing' || stage === 'saving') return;
    setStage('analyzing');
    setError('');
    setPrediction(null);
    try {
      const token = await user.getIdToken();
      const body = new FormData();
      body.append('image', preparedFile);
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body
      });
      let result;
      try { result = await response.json(); } catch { throw new Error('The scanner returned an unreadable response.'); }
      if (!response.ok || !result.success) throw new Error(result.error || "The check could not be completed.");
      setPrediction(result);
      setFlowStep(2);
      if (services.demo) { setStage('demo'); return; }
      const id = doc(userCollection(uid, 'scans')).id;
      setPendingId(id);
      await persistResult(result, id);
    } catch (error) {
      setStage('ready');
      setError(readableError(error));
    }
  }
  async function savePhotoForLater() {
    if (!services.browser || !preparedFile || !plotId || ['analyzing', 'saving'].includes(stage)) return;
    const result = { success: true, is_photo_only: true, top_class: 'Not analyzed', top_confidence: null,
      status_type: 'monitor', status_label: 'Photo saved', detection_count: 0, model_version: 'not-analyzed',
      message: 'Your photo is saved for later. The trained model has not analyzed it.',
      recommendation: "Record your field notes and plan a follow-up visit from this growing area." };
    const id = newBrowserId();
    setPrediction(result);
    setFlowStep(2);
    setPendingId(id);
    await persistResult(result, id);
  }
  async function reset() {
    if (stage === 'unsaved' && pendingId) {
      try { await cleanupUnsavedScan(uid, pendingId); }
      catch { onNotify('The unsaved upload could not be cleared yet. It will be removed with your account.', 'error'); }
    }
    setPreparedFile(null);
    setPrediction(null);
    setStage('idle');
    setFlowStep(0);
    setError('');
    setSavedId('');
    setPendingId('');
    setShareWanted(false);
    setConfirmDelete(false);
    setUserCondition('');
    setGrowthStage('');
    if (fileInput.current) fileInput.current.value = '';
    requestAnimationFrame(() => {
      plotSelect.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }
  async function removeResult() {
    if (!confirmDelete || removing || stage !== 'saved' || !savedId) return;
    if (!services.browser && !online) {
      setError('Connect to the internet to delete this check.');
      return;
    }
    setRemoving(true);
    setError('');
    try {
      await deleteScan(savedId);
      await reset();
      onNotify('Check deleted.');
    } catch (error) {
      setError(t('This check could not be removed: {reason}', { reason: t(readableError(error)) }));
    } finally { setRemoving(false); }
  }
  const selectedPlot = activePlots.find(item => item.id === plotId);
  const detectionOnly = isDetectionOnly(prediction);
  const assessment = scanAssessment(prediction?.top_class, Boolean(prediction?.is_photo_only), detectionOnly);

  const processing = removing || ['preparing', 'analyzing', 'saving'].includes(stage);
  const stageText = { preparing: 'Preparing your photo for scanning…', analyzing: services.classification ? 'Analyzing the photo with the pineapple model…' : 'Finding candidate regions with YOLO…', saving: services.browser ? 'Saving your photo in this browser…' : 'Saving your result and private photos…', saved: 'Your photo is saved. Find it again in Records.', unsaved: 'Your result is ready but has not been saved.', demo: 'Demo result ready. It stays on this page until you start another check.' }[stage] || '';

  function receiveTransferredPhoto(event, transfer) {
    const file = transfer?.files?.[0];
    if (!file) return;
    event.preventDefault();
    if (flowStep !== 0 || processing) return;
    receiveImage(file);
  }

  const steps = [
    [0, 'Photo & details'],
    [2, services.browser ? 'Saved photo' : 'Result']
  ];

  return <div className="view scan-view guided-scan">
    <div className="journal-capture-heading"><button className="text-link" type="button" onClick={()=>onNavigate(services.demo ? 'dashboard' : 'plot',plotId)}><ArrowLeft size={16}/>{t("Back to records")}</button><h1>{t(services.browser ? 'Add photo' : 'Scan pineapple')}</h1><p>{t(services.browser ? 'Keep a pineapple photo with your field records.' : 'Choose a pineapple photo and check it for a possible condition.')}</p></div>
    {services.demo && <div className="callout subtle"><ShieldCheck size={19} /><span>{t('Demo mode sends your photo to the model server. Photos and results are not saved; recommendations are unavailable.')}</span></div>}
    <div className="ribbon-wrap"><div className="ribbon-track" aria-hidden="true"><span style={{ width: `${flowStep * 50}%` }} /></div>
    <ol className="guided-ribbon" aria-label={t("Scanning steps")}>
      {steps.map(([step,label], index) => <li key={step} className={flowStep === step ? 'is-current' : flowStep > step ? 'is-complete' : ''} aria-current={flowStep === step ? 'step' : undefined}><span className="ribbon-step"><span className="ribbon-number" aria-hidden="true">{flowStep > step ? <Check size={18} /> : index + 1}</span><strong>{t(label)}</strong></span></li>)}
    </ol></div>
    <p className={`scan-stage ${processing ? 'is-processing' : ''}`} role="status" aria-live="polite">{processing && <LoaderCircle className="spin" size={17} />}{t(stageText)}</p>
    {(!services.scanner || (!services.photos && !services.demo)) && <div className="callout subtle service-callout" role="status"><CloudOff size={17} /><span className="scan-guest-message">{services.browser ? t('Guest photos are saved as Not analyzed. Sign in to use the scanner.') : services.checking ? t("Checking scanner availability…") : t("Scanning is temporarily unavailable. You can preview a photo and keep recording field notes and care tasks.")}</span>{services.browser ? <a className="text-link" href="?guest=0">{t('Sign in to scan')}<ArrowRight size={16} /></a> : !services.checking && <button className="button button-text" type="button" onClick={services.retry}>{t("Check availability")}</button>}</div>}
    {activePlots.length === 0 && !services.demo ? <div className="panel scan-no-plots"><div className="empty-icon"><ImagePlus size={28} /></div><h2>{t("Create a growing area to begin scanning")}</h2><p>{t("Every new check belongs to a pineapple growing area or batch, so its history stays organized.")}</p><button className="button button-primary" onClick={() => onNavigate('farms', '', farms.some(farm => !farm.archivedAt) ? 'add-plot' : 'add-farm')}>{t("Set up a farm and growing area ")}<ArrowRight size={17} /></button></div> : <>
      <input ref={fileInput} hidden type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; receiveImage(file); }} />
      {flowStep < 2 ? <section key={flowStep} className="guided-stage grid items-center gap-8 md:grid-cols-2 md:gap-12" aria-labelledby="scan-step-title">
        <div className={`photo-composition ${stage === 'analyzing' ? 'is-scanning' : ''}`} role="group" aria-label={flowStep === 0 ? t("Photo preview. You can drop or paste a photo here.") : t("Photo ready for scanning")} tabIndex={flowStep === 0 ? 0 : -1} onDragOver={event => event.preventDefault()} onDrop={event => receiveTransferredPhoto(event, event.dataTransfer)} onPaste={event => receiveTransferredPhoto(event, event.clipboardData)}>
          <div className={`scan-preview ${previewUrl ? 'has-photo' : ''}`}>{previewUrl ? <img src={previewUrl} alt={t("Prepared pineapple photo to check")} /> : <div><ImagePlus size={36} strokeWidth={1.3} aria-hidden="true" /><strong>{t('Choose a pineapple photo')}</strong><span>{t('One clear photo, in good daylight.')}</span><button className="button button-primary photo-choose" type="button" onClick={() => fileInput.current?.click()} disabled={processing}><ImagePlus size={18} aria-hidden="true" />{t('Choose photo')}</button></div>}</div>
          {stage === 'analyzing' && <span className="scan-sweep" aria-hidden="true" />}
          <span className="photo-caption"><ShieldCheck size={14} />{t(services.demo ? 'Demo photos are not saved' : services.browser ? 'Saved only after you choose Save photo' : 'Your photo stays private')}</span>
          {flowStep === 0 && preparedFile && <button className="button button-soft photo-replace" type="button" onClick={() => fileInput.current?.click()} disabled={processing}><ImagePlus size={18} aria-hidden="true" />{t('Replace photo')}</button>}
        </div>
        <div className="guided-action">
          <h2 id="scan-step-title" ref={stepHeading} tabIndex={-1}>{t(preparedFile ? services.demo ? 'Review your photo' : 'Review and save' : 'Choose your photo')}</h2>
          <p>{t(services.browser ? 'Check that your photo is clear, choose its growing area, and save. Guest photos are not analyzed.' : services.demo ? 'Use a clear photo of one pineapple. The model result will appear on this screen.' : 'Check that your pineapple is clear and in focus, then choose where to save the result.')}</p>
          <p className="helper-text">{t('On a phone, your image picker may offer the camera or photo library.')}</p>
          {!services.demo && <label className="field plot-picker"><span>{t("Save this check to")}</span><select ref={plotSelect} value={plotId} onChange={event => setPlotId(event.target.value)} disabled={processing} required aria-label={t("Farm / growing area")}><option value="">{t("Choose a growing area or batch")}</option>{activePlots.map(plot => <option key={plot.id} value={plot.id}>{farms.find(farm => farm.id === plot.farmId)?.name || t("Farm")} · {plot.name}</option>)}</select></label>}
            {!services.demo && <details className="scan-options"><summary>{t(services.classification ? "Field note & optional advice" : "Field note")}</summary><div>
              <label className="field"><span>{t("Your field note ")}<em>{t("(optional)")}</em></span><select value={userCondition} onChange={event => setUserCondition(event.target.value)} disabled={processing}><option value="">{t("I have not observed a condition")}</option><option value="normal">{t("Looks normal")}</option><option value="concerning">{t("Looks concerning")}</option><option value="unsure">{t("I am unsure")}</option></select></label>
              {services.classification && <label className="field">
                <span>{t("Growth stage")} <em>{t("(optional)")}</em></span>
                <select value={growthStage} onChange={event => setGrowthStage(event.target.value)} disabled={processing}>
                  <option value="">{t("Unknown or not recorded")}</option>
                  <option value="vegetative">{t("Leaf growth")}</option>
                  <option value="floral_forcing">{t("Flower induction")}</option>
                  <option value="fruit_development">{t("Fruit development")}</option>
                  <option value="harvest_window">{t("Approaching harvest")}</option>
                </select>
              </label>}
              <label className="check-label" hidden={!services.sharing}><input type="checkbox" checked={shareWanted} onChange={event => setShareWanted(event.target.checked)} disabled={!services.sharing || !services.classification || processing} /><span><strong>{t("Share results for research")}</strong><small>{t("Only the result, model version, month, and your reported condition are shared. Photos, notes, and account details stay private.")}</small></span></label>
              {services.classification && <details className="optional-ai-settings"><summary>{t("Optional recommendations")}</summary><RecommendationPreference uid={uid} compact /></details>}
            </div></details>}
            {!services.browser && <button className={'button '+(services.scanner&&(services.photos||services.demo)?'button-primary':'button-soft')+' button-large guided-next'} type="button" disabled={!services.scanner || (!services.photos && !services.demo) || (!plotId && !services.demo) || !preparedFile || !online || processing} onClick={analyze}>{stage === 'analyzing' ? <><LoaderCircle className="spin" size={18} />{t(" Analyzing image…")}</> : <><ScanLine size={18} />{t(services.classification ? 'Scan pineapple' : " Find regions ")}<ArrowRight size={18} /></>}</button>}
            {services.browser && <button className="button button-primary button-large guided-next" type="button" disabled={!preparedFile || !plotId || processing} onClick={savePhotoForLater}>{t('Save photo')}<ArrowRight size={18} /></button>}
            {!services.browser && !services.classification && <p className="helper-text">{t(services.scanner ? "Detection only · No condition classifier installed." : services.checking ? "Checking scanner availability…" : "Scanner unavailable · Model status could not be checked.")}</p>}
            {!online && <p className="helper-text error-text"><CloudOff size={16} />{t(" Connect to the internet to check.")}</p>}
          <p className="helper-text">{!plotId && !services.demo ? t("Choose a growing area above to continue.") : !preparedFile ? t('Choose a photo to continue. JPG and PNG are supported.') : null}</p>
          {error && <div className="inline-error" role="alert">{t(error)}</div>}
        </div>
      </section> : prediction && <section className="guided-report" aria-labelledby="scan-result-title">
        <header className="scan-result-heading">
          <div>
            <span className="eyebrow">{t(prediction.is_photo_only ? 'PHOTO RECORD' : 'PHOTO ASSESSMENT')}</span>
            <h2 id="scan-result-title" ref={resultHeading} tabIndex={-1}>
              {t(prediction.is_photo_only ? stage === 'saved' ? 'Photo saved' : stage === 'saving' ? 'Saving photo…' : 'Photo not saved' : assessment.title)}
            </h2>
            <ScanResultIndicators statusType={prediction.status_type} label={prediction.status_label}
              confidence={detectionOnly ? null : prediction.top_confidence} photoOnly={prediction.is_photo_only} />
          </div>
          <button className="button button-primary" type="button" disabled={processing}
            onClick={() => fileInput.current?.click()}>
            <ImagePlus size={18} aria-hidden="true" />
            {t(prediction.is_photo_only ? 'Add another photo' : 'Scan another image')}
          </button>
        </header>
        <div className="report-summary-grid scan-result-body">
          <ScanNextStep assessment={assessment} userCondition={userCondition} />
          <figure className="report-photo">
            {previewUrl && <img src={previewUrl} alt={t("Original pineapple photo")} />}
            {selectedPlot && <figcaption className="photo-caption">{selectedPlot.name}</figcaption>}
          </figure>
        </div>
        {stage === 'saving' && <p className="helper-text"><LoaderCircle className="spin" size={17} />{t(" Saving your check…")}</p>}
        {stage === 'demo' && <p className="callout subtle">{t('This demo result is shown on screen only. The photo and prediction have not been saved to Records.')}</p>}
        {stage === 'saved' && error && <p className="inline-error" role="alert">{t(error)}</p>}
        {removing && <p className="helper-text" role="status">{t('Removing this check and its saved files…')}</p>}
        {stage === 'unsaved' && <div className="unsaved-box" role="alert"><CloudOff size={20} /><div><strong>{t("This result is unsaved")}</strong><p>{t(error)}</p><button className="button button-primary" type="button" disabled={!online} onClick={() => persistResult(prediction, pendingId)}><RefreshCw size={16} />{t(" Retry saving")}</button></div></div>}
        {stage === 'saved' && <div className="saved-box"><CircleCheck size={19} /><span>{t("Saved to ")}{selectedPlot?.name || t("your growing area")}.</span><button className="button button-primary" type="button" onClick={() => onNavigate('plot', plotId)}>{t("View records ")}<ArrowRight size={15} /></button></div>}

        {stage === 'saved' && !prediction.is_photo_only && !detectionOnly && !removing && <RecommendationCard uid={uid} scanId={savedId} autoGenerate />}
        {stage === 'saved' && savedId && <details className="full-scan-report">
          <summary><strong>{t("Record actions")}</strong><Plus size={20} aria-hidden="true" /></summary>
          <div className="report-details">
            <button className="button button-text danger-text result-delete" type="button"
              ref={deleteTrigger} disabled={removing || !services.deletion} aria-expanded={confirmDelete}
              aria-controls={confirmDelete ? 'delete-result-confirmation' : undefined} onClick={() => setConfirmDelete(true)}>
              {removing ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}
              {t(removing ? 'Removing…' : prediction.is_photo_only ? 'Delete photo' : 'Delete check')}
            </button>
            {confirmDelete && <div id="delete-result-confirmation" className="result-delete-confirm"
              role="group" aria-labelledby="delete-result-title" onKeyDown={event => {
                if (event.key === 'Escape' && !removing) {
                  event.preventDefault();
                  setConfirmDelete(false);
                  deleteTrigger.current?.focus();
                }
              }}>
              <strong id="delete-result-title">{t('Delete this check?')}</strong>
              <p>{t('This removes the check, its photos, saved recommendations, and any research contribution. This cannot be undone.')}</p>
              <div className="result-delete-confirm-actions">
                <button className="button button-soft" type="button" ref={cancelDelete} disabled={removing}
                  onClick={() => { setConfirmDelete(false); deleteTrigger.current?.focus(); }}>{t('Cancel')}</button>
                <button className="button button-text danger-text" type="button" disabled={removing} onClick={removeResult}>
                  {removing ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}
                  {t(removing ? 'Removing…' : 'Delete permanently')}
                </button>
              </div>
            </div>}
          </div>
        </details>}
      </section>}
    </>}
    <PageHelp><p>{t(services.demo ? "Take a clear photo in daylight and keep the sample in focus. The demo does not require a growing area or save a record." : "Choose where the pineapple is growing so you can find this check later. Take a clear photo in daylight and keep the affected area in focus.")}</p><p>{t("A result suggests what the photo may show. Check the plant in person too. If analysis is unavailable, guest users can save the photo as Not analyzed.")}</p></PageHelp>

  </div>;
}
