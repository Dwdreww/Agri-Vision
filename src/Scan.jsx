import { t } from './i18n.js';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Leaf, Camera, Check, CircleCheck, CloudOff, ImagePlus, LoaderCircle, Plus, RefreshCw, ScanLine, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { cleanupUnsavedScan, saveScan, shareScan, userCollection } from './data';
import { prepareImage, readableError } from './utils';
import { ConditionBadge, ConfidenceHelp, PredictionDetails, StatusPill } from './components';
import RecommendationCard, { RecommendationPreference } from './Recommendations.jsx';
import { formatConfidence } from './recommendation-utils.js';
import { useWorkspaceServices } from './services';
import { newBrowserId } from './browser-store.js';
import { PageHelp } from './Guidance.jsx';

export default function ScanView({ uid, user, plots, farms, initialPlotId, onNotify, onNavigate, online }) {
  const services = useWorkspaceServices();
  const [plotId, setPlotId] = useState(initialPlotId || (services.browser ? plots.find(plot => !plot.archivedAt)?.id || '' : ''));
  const [preparedFile, setPreparedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [stage, setStage] = useState('idle');
  const [flowStep, setFlowStep] = useState(0);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [shareWanted, setShareWanted] = useState(false);
  const [userCondition, setUserCondition] = useState('');
  const fileInput = useRef(null);
  const video = useRef(null);
  const cameraStream = useRef(null);
  const cameraTrigger = useRef(null);
  const captureButton = useRef(null);
  const resultHeading = useRef(null);
  const plotSelect = useRef(null);
  const stepHeading = useRef(null);
  const previousStep = useRef(0);
  const activePlots = plots.filter(plot => !plot.archivedAt && farms.some(farm => farm.id === plot.farmId && !farm.archivedAt));

  useEffect(() => { if (initialPlotId) setPlotId(initialPlotId); }, [initialPlotId]);
  useEffect(() => {
    if (!preparedFile) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(preparedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preparedFile]);
  useEffect(() => {
    if (!cameraOpen) return undefined;
    if (video.current && cameraStream.current) video.current.srcObject = cameraStream.current;
    captureButton.current?.focus();
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); stopCamera(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [cameraOpen]);
  useEffect(() => () => {
    cameraStream.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (previousStep.current === flowStep) return;
    previousStep.current = flowStep;
    const heading = flowStep === 2 ? resultHeading.current : stepHeading.current;
    heading?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 760px)').matches) heading?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [flowStep]);

  function stopCamera() {
    const wasOpen = Boolean(cameraStream.current);
    cameraStream.current?.getTracks().forEach(track => track.stop());
    cameraStream.current = null;
    setCameraOpen(false);
    if (wasOpen) cameraTrigger.current?.focus();
  }
  async function receiveImage(file) {
    if (!file) return;
    if (stage === 'unsaved' && pendingId) {
      try { await cleanupUnsavedScan(uid, pendingId); }
      catch { onNotify('The previous unsaved upload could not be cleared yet. It will be removed with your account.', 'error'); }
    }
    stopCamera();
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
  async function openCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is unavailable here. You can upload a photo instead.');
      return;
    }
    try {
      cameraStream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      setCameraOpen(true);
    } catch {
      setError('Camera access was denied or is unavailable. You can upload a photo instead.');
    }
  }
  function capture() {
    const current = video.current;
    if (!current?.videoWidth) { setError('The camera is still starting. Try again in a moment.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = current.videoWidth;
    canvas.height = current.videoHeight;
    canvas.getContext('2d').drawImage(current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) { setError('The photo could not be captured.'); return; }
      receiveImage(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.82);
  }
  async function persistResult(result, scanId) {
    const plot = activePlots.find(item => item.id === plotId);
    if (!plot) { setStage('unsaved'); setError("Choose an active growing area before saving this result."); return; }
    setStage('saving');
    setError('');
    try {
      await saveScan(uid, scanId, plot.id, plot.farmId, preparedFile, result, userCondition);
      setSavedId(scanId);
      setStage('saved');
      if (shareWanted && formatConfidence(result.top_confidence) === 'Unavailable') {
        onNotify("Check saved. Research sharing requires a valid model confidence value.", 'error');
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
    if (!services.scanner || !services.photos) { setError('Scanning and photo saving are temporarily unavailable.'); return; }
    if (!plotId || !preparedFile || stage === 'analyzing' || stage === 'saving') return;
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
    stopCamera();
    setPreparedFile(null);
    setPrediction(null);
    setStage('idle');
    setFlowStep(0);
    setError('');
    setSavedId('');
    setPendingId('');
    setShareWanted(false);
    setUserCondition('');
    if (fileInput.current) fileInput.current.value = '';
    requestAnimationFrame(() => {
      plotSelect.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }
  const selectedPlot = activePlots.find(item => item.id === plotId);
  const displayResult = prediction ? {
    ...prediction,
    modelVersion: prediction.model_version,
    detectionCount: prediction.detection_count,
    preprocessingSteps: prediction.preprocessing_steps,
    preprocessingSummary: prediction.preprocessing_summary,
    topClass: prediction.top_class,
    topConfidence: prediction.top_confidence,
    isPhotoOnly: Boolean(prediction.is_photo_only),
    userCondition
  } : null;
  const resultImage = prediction?.annotated_image?.startsWith('data:image/jpeg;base64,') ? prediction.annotated_image : '';

  const processing = ['preparing', 'analyzing', 'saving'].includes(stage);
  const stageText = { preparing: 'Preparing your photo for scanning…', analyzing: 'Analyzing the photo with the pineapple model…', saving: services.browser ? 'Saving your photo in this browser…' : 'Saving your result and private photos…', saved: 'Your check is saved. Find it again in History.', unsaved: 'Your result is ready but has not been saved.' }[stage] || '';

  function receiveTransferredPhoto(event, transfer) {
    const file = transfer?.files?.[0];
    if (!file) return;
    event.preventDefault();
    if (flowStep !== 0 || processing) return;
    receiveImage(file);
  }

  const steps = [
    ['Add photo', 'Check your photo'],
    [services.browser ? 'Save photo' : 'Check photo', services.browser ? 'Keep a photo record' : 'Look for a condition'],
    ['Review & care', 'Understand the findings']
  ];

  return <div className="view scan-view guided-scan">
    <div className="guided-hero text-center"><span className="eyebrow">{t("ONE PHOTO. A CLEARER NEXT STEP.")}</span><h1>{t("Check a pineapple")}</h1><p>{t("Choose a growing area, add a clear photo, and review the next step. Each check is for the photographed sample.")}</p></div>
    <PageHelp><p>{t("Choose where the pineapple is growing so you can find this check later. Take a clear photo in daylight and keep the affected area in focus.")}</p><p>{t("A result suggests what the photo may show. Check the plant in person too. If analysis is unavailable, guest users can save the photo as Not analyzed.")}</p></PageHelp>
    <div className="ribbon-wrap"><div className="ribbon-track" aria-hidden="true"><span style={{ width: `${flowStep * 50}%` }} /></div>
    <ol className="guided-ribbon" aria-label={t("Scanning steps")}>
      {steps.map(([label, description], index) => <li key={label} className={flowStep === index ? 'is-current' : flowStep > index ? 'is-complete' : ''} aria-current={flowStep === index ? 'step' : undefined}><button type="button" className="ribbon-step" aria-label={t("Step {value0}: {value1}", { value0: index + 1, value1: t(label) })} disabled={processing || (prediction ? index !== 2 : index === 2 || (index === 1 && (!preparedFile || !plotId)))} onClick={() => { stopCamera(); setFlowStep(index); }}><span className="ribbon-number" aria-hidden="true">{flowStep > index ? <Check size={18} /> : `0${index + 1}`}</span><strong>{t(label)}</strong><small>{t(description)}</small></button></li>)}
    </ol></div>
    <p className={`scan-stage ${processing ? 'is-processing' : ''}`} role="status" aria-live="polite">{processing && <LoaderCircle className="spin" size={17} />}{t(stageText)}</p>
    {(!services.scanner || !services.photos) && <div className="callout subtle service-callout" role="status"><CloudOff size={17} /><span>{services.browser ? t("Photo analysis is not available in guest mode. You can still save a photo, write field notes, and plan care tasks. Saved photos will be marked Not analyzed.") : services.checking ? t("Checking scanner availability…") : t("Scanning is temporarily unavailable. You can preview a photo and keep recording field notes and care tasks.")}</span>{!services.browser && !services.checking && <button className="button button-text" type="button" onClick={services.retry}>{t("Check availability")}</button>}</div>}
    {activePlots.length === 0 ? <div className="panel scan-no-plots"><div className="empty-icon"><ImagePlus size={28} /></div><h2>{t("Create a growing area to begin scanning")}</h2><p>{t("Every new check belongs to a pineapple growing area or batch, so its history stays organized.")}</p><button className="button button-primary" onClick={() => onNavigate('farms', '', farms.some(farm => !farm.archivedAt) ? 'add-plot' : 'add-farm')}>{t("Set up a farm and growing area ")}<ArrowRight size={17} /></button></div> : <>
      <input ref={fileInput} className="visually-hidden" type="file" tabIndex={-1} aria-label={t("Choose a pineapple photo")} accept="image/*" onChange={event => receiveImage(event.target.files?.[0])} />
      {flowStep < 2 ? <section key={flowStep} className="guided-stage grid items-center gap-8 md:grid-cols-2 md:gap-12" aria-labelledby="scan-step-title">
        <div className={`photo-composition ${stage === 'analyzing' ? 'is-scanning' : ''}`} role="group" aria-label={flowStep === 0 ? t("Photo preview. You can drop or paste a photo here.") : t("Photo ready for scanning")} tabIndex={flowStep === 0 ? 0 : -1} onDragOver={event => event.preventDefault()} onDrop={event => receiveTransferredPhoto(event, event.dataTransfer)} onPaste={event => receiveTransferredPhoto(event, event.clipboardData)}>
          {cameraOpen ? <div className="camera-preview"><video ref={video} autoPlay playsInline muted /><div className="camera-controls"><button className="button button-primary" type="button" ref={captureButton} onClick={capture}><Camera size={17} />{t(" Capture photo")}</button><button className="icon-button" type="button" onClick={stopCamera} aria-label={t("Close camera")}><X size={19} /></button></div></div> : <div className={`scan-preview ${previewUrl ? 'has-photo' : ''}`}>{previewUrl ? <img src={previewUrl} alt={t("Prepared pineapple photo to check")} /> : <div><ImagePlus size={36} strokeWidth={1.3} /><strong>{t("Your photo goes here")}</strong><span>{t("One sample, in clear daylight.")}</span><button className="button button-soft" type="button" onClick={() => fileInput.current?.click()} disabled={processing}><Plus size={16} />{t(" Add photo")}</button></div>}</div>}
          {stage === 'analyzing' && <span className="scan-sweep" aria-hidden="true" />}
          <span className="photo-caption">{preparedFile ? t("Your photo · prepared for scanning") : t("PHOTO PREVIEW")}<ShieldCheck size={14} /> {services.browser ? t("Saved on this device") : t("Private to you")}</span>
        </div>
        <div className="guided-action">
          <span className="eyebrow">{t("STEP ")}{flowStep === 0 ? t("01 / YOUR PHOTO") : t("02 / THE SCAN")}</span>
          <h2 id="scan-step-title" ref={stepHeading} tabIndex={-1}>{flowStep === 0 ? <>{t("Start with")}<br />{t(" one clear photo.")}</> : <>{t("Ready for")}<br />{t(" a closer look?")}</>}</h2>
          <p>{flowStep === 0 ? t("Fill the frame with your sample or the affected area. Keep it in focus and avoid glare or heavy shadows.") : services.browser ? t("Save this photo in your growing area’s history. It will be marked Not analyzed. You can add field notes and care tasks from the growing area.") : t("The trained model checks your photo. We’ll save its findings to your growing area, then help you review the next step.")}</p>
          {flowStep === 0 ? <>
            <div className="upload-actions"><button className="button button-soft" type="button" onClick={() => fileInput.current?.click()} disabled={processing}><UploadCloud size={17} /> {preparedFile ? t("Replace photo") : t("Upload image")}</button><button className="button button-soft" type="button" ref={cameraTrigger} onClick={openCamera} disabled={processing}><Camera size={17} />{t(" Use camera")}</button></div>
            <label className="field plot-picker"><span>{t("Save this check to")}</span><select ref={plotSelect} value={plotId} onChange={event => setPlotId(event.target.value)} disabled={processing} required aria-label={t("Farm / growing area")}><option value="">{t("Choose a growing area or batch")}</option>{activePlots.map(plot => <option key={plot.id} value={plot.id}>{farms.find(farm => farm.id === plot.farmId)?.name || t("Farm")} · {plot.name}</option>)}</select></label>
            <button className="button button-primary button-large guided-next" type="button" disabled={!plotId || !preparedFile || processing || cameraOpen} onClick={() => setFlowStep(1)}>{t("Review photo ")}<ArrowRight size={18} /></button>
            <p className="helper-text">{!plotId ? t("Choose a growing area above to continue.") : preparedFile ? <><CircleCheck size={15} />{t(" Photo ready. Check that the sample is clear.")}</> : t("Upload, drop, or paste a photo. JPG and PNG are resized for scanning.")}</p>
          </> : <>
            <div className="scan-destination"><SproutLabel /><div><small>{t("SCANNING FOR")}</small><strong>{selectedPlot?.name}</strong><span>{farms.find(farm => farm.id === selectedPlot?.farmId)?.name}</span></div></div>
            <details className="scan-options"><summary>{t("Field note & optional advice")}</summary><div>
              <label className="field"><span>{t("Your field note ")}<em>{t("(optional)")}</em></span><select value={userCondition} onChange={event => setUserCondition(event.target.value)} disabled={processing}><option value="">{t("I have not observed a condition")}</option><option value="normal">{t("Looks normal")}</option><option value="concerning">{t("Looks concerning")}</option><option value="unsure">{t("I am unsure")}</option></select></label>
              <label className="check-label"><input type="checkbox" checked={shareWanted} onChange={event => setShareWanted(event.target.checked)} disabled={!services.sharing || processing} /><span><strong>{t("Share results for research")}</strong><small>{t("Only the result, model version, month, and your reported condition are shared. Photos, notes, and account details stay private.")}</small></span></label>
              <details className="optional-ai-settings"><summary>{t("Optional text-only AI advice")}</summary><RecommendationPreference uid={uid} compact /></details>
            </div></details>
            <button className="button button-primary button-large guided-next" type="button" disabled={!services.scanner || !services.photos || !plotId || !preparedFile || !online || processing} onClick={analyze}>{stage === 'analyzing' ? <><LoaderCircle className="spin" size={18} />{t(" Analyzing image…")}</> : <><ScanLine size={18} />{t(" Check pineapple ")}<ArrowRight size={18} /></>}</button>
            {services.browser && !services.scanner && <button className="button button-soft button-large" type="button" disabled={!preparedFile || !plotId || processing} onClick={savePhotoForLater}>{t("Save photo for later ")}<ArrowRight size={18} /></button>}
            <button className="text-link guided-back" type="button" disabled={processing} onClick={() => setFlowStep(0)}><ArrowLeft size={16} />{t(" Back to photo")}</button>
            {!online && <p className="helper-text error-text"><CloudOff size={16} />{t(" Connect to the internet to check.")}</p>}
          </>}
          {error && <div className="inline-error" role="alert">{t(error)}</div>}
        </div>
      </section> : prediction && <section className="guided-report" aria-labelledby="scan-result-title">
        <div className="report-summary-grid grid gap-8 md:grid-cols-[1fr_1.6fr]">
          <div className="report-photo"><img src={previewUrl} alt={prediction.is_photo_only ? t("Your saved pineapple photo") : t("Your scanned pineapple sample")} /><span className="photo-caption">{selectedPlot?.name}{t(" · Your sample")}</span></div>
          <div className="result-summary"><span className="eyebrow">{prediction.is_photo_only ? t("STEP 03 / SAVED PHOTO") : t("STEP 03 / MODEL FINDINGS")}</span><div className="result-top"><h2 id="scan-result-title" ref={resultHeading} tabIndex={-1}>{t(prediction.top_class || "No detection")}</h2><StatusPill type={prediction.status_type}>{prediction.status_label}</StatusPill></div><ConditionBadge label={prediction.top_class} /><p>{t(prediction.message)}</p>{!prediction.is_photo_only && <div className="result-numbers"><div><strong>{formatConfidence(prediction.top_confidence)}</strong><span>{t("Model confidence")}</span></div><div><strong>{prediction.detection_count ?? 0}</strong><span>{t("Detected regions")}</span></div></div>}
          {prediction.recommendation && <div className="recommendation-box"><ShieldCheck size={19} /><p><strong>{t("Suggested next step")}</strong><br />{t(prediction.recommendation)}</p></div>}
          <p className="helper-text">{prediction.is_photo_only ? t("No diagnosis or AI recommendation has been generated for this photo.") : t("Check the plant in person too. Model confidence does not confirm a diagnosis.")}</p></div>
        </div>
        {stage === 'saving' && <p className="helper-text"><LoaderCircle className="spin" size={17} />{t(" Saving your check…")}</p>}
        {stage === 'unsaved' && <div className="unsaved-box" role="alert"><CloudOff size={20} /><div><strong>{t("This result is unsaved")}</strong><p>{t(error)}</p><button className="button button-primary" type="button" disabled={!online} onClick={() => persistResult(prediction, pendingId)}><RefreshCw size={16} />{t(" Retry saving")}</button></div></div>}
        {stage === 'saved' && <div className="saved-box"><CircleCheck size={19} /><span>{t("Saved to ")}{selectedPlot?.name || t("your growing area")}.</span><button className="button button-text" type="button" onClick={() => onNavigate('plot', plotId)}>{t("View timeline ")}<ArrowRight size={15} /></button></div>}
        {stage === 'saved' && <RecommendationCard uid={uid} scanId={savedId} autoGenerate />}
        <details className="full-scan-report"><summary><span><strong>{t("Open detailed report")}</strong><small>{prediction.is_photo_only ? t("Saved photo details") : t("Detected regions, model details & photo preparation")}</small></span><Plus size={20} /></summary><div className="report-details">{resultImage && <figure><img className="result-image" src={resultImage} alt={t("Pineapple image with detected regions marked by the model")} /><figcaption>{t("Regions marked by the model")}</figcaption></figure>}<PredictionDetails scan={displayResult} /><ConfidenceHelp /></div></details>
        {stage !== 'saving' && <div className="report-actions"><button className="button button-primary" type="button" onClick={reset}><ImagePlus size={17} />{t(" Start another check")}</button><button className="button button-soft" type="button" onClick={() => onNavigate('guide')}>{t("Understand the conditions ")}<ArrowRight size={16} /></button></div>}
      </section>}
    </>}
    <div className="scan-footer"><div className="scan-guide-link"><Leaf size={18} /><span>{t("What can the scanner recognize?")}</span><button className="text-link" type="button" onClick={() => onNavigate('guide')}>{t("Explore all 7 conditions ")}<ArrowRight size={16} /></button></div>{services.local && <p><ShieldCheck size={15} />{t(" Your photos stay private on this computer.")}</p>}</div>
  </div>;
}

function SproutLabel() {
  return <Leaf size={22} strokeWidth={1.5} aria-hidden="true" />;
}
