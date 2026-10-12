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
    if (!plot) { setStage('unsaved'); setError('Choose an active plot before saving this result.'); return; }
    setStage('saving');
    setError('');
    try {
      await saveScan(uid, scanId, plot.id, plot.farmId, preparedFile, result, userCondition);
      setSavedId(scanId);
      setStage('saved');
      if (shareWanted && formatConfidence(result.top_confidence) === 'Unavailable') {
        onNotify('Scan saved. Research sharing requires a valid model confidence value.', 'error');
      } else if (shareWanted) {
        try { await shareScan(scanId); onNotify('Scan saved and shared for research.'); }
        catch (error) { onNotify(`Scan saved. Research sharing could not be completed: ${readableError(error)}`, 'error'); }
      } else onNotify(result.is_photo_only ? 'Photo saved in this browser.' : 'Scan saved to this plot.');
    } catch (error) {
      setStage('unsaved');
      setError(result.is_photo_only ? `Your photo has not been saved: ${readableError(error)}` : `The model result is ready, but it has not been saved: ${readableError(error)}`);
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
      if (!response.ok || !result.success) throw new Error(result.error || 'The scan could not be completed.');
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
      recommendation: 'Record your observations and plan a follow-up visit from this plot.' };
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
  const stageText = { preparing: 'Preparing your photo for scanning…', analyzing: 'Analyzing the photo with the pineapple model…', saving: services.browser ? 'Saving your photo in this browser…' : 'Saving your result and private photos…', saved: 'Your scan is saved. Review the result below.', unsaved: 'Your result is ready but has not been saved.' }[stage] || '';

  function receiveTransferredPhoto(event, transfer) {
    const file = transfer?.files?.[0];
    if (!file) return;
    event.preventDefault();
    if (flowStep !== 0 || processing) return;
    receiveImage(file);
  }

  const steps = [
    ['Add & preview', 'Check your photo'],
    ['Scan the fruit', 'Let the model look'],
    ['Review & care', 'Understand the findings']
  ];

  return <div className="view scan-view guided-scan">
    <div className="guided-hero text-center"><span className="eyebrow">ONE PHOTO. A CLEARER NEXT STEP.</span><h1>A little clarity.<br /><span>A little more care.</span></h1><p>Take a closer look at your pineapple, one step at a time.</p></div>
    <div className="ribbon-wrap"><div className="ribbon-track" aria-hidden="true"><span style={{ width: `${flowStep * 50}%` }} /></div>
    <ol className="guided-ribbon" aria-label="Scanning steps">
      {steps.map(([label, description], index) => <li key={label} className={flowStep === index ? 'is-current' : flowStep > index ? 'is-complete' : ''} aria-current={flowStep === index ? 'step' : undefined}><button type="button" className="ribbon-step" aria-label={`Step ${index + 1}: ${label}`} disabled={processing || (prediction ? index !== 2 : index === 2 || (index === 1 && (!preparedFile || !plotId)))} onClick={() => { stopCamera(); setFlowStep(index); }}><span className="ribbon-number" aria-hidden="true">{flowStep > index ? <Check size={18} /> : `0${index + 1}`}</span><strong>{label}</strong><small>{description}</small></button></li>)}
    </ol></div>
    <p className={`scan-stage ${processing ? 'is-processing' : ''}`} role="status" aria-live="polite">{processing && <LoaderCircle className="spin" size={17} />}{stageText}</p>
    {(!services.scanner || !services.photos) && <div className="callout subtle service-callout" role="status"><CloudOff size={17} /><span>{services.browser ? 'The real scan backend is not available in this static version. Preview and save photos for later, and keep recording observations and care tasks.' : services.checking ? 'Checking scanner availability…' : 'Scanning is temporarily unavailable. You can preview a photo and keep recording observations and care tasks.'}</span>{!services.browser && !services.checking && <button className="button button-text" type="button" onClick={services.retry}>Check availability</button>}</div>}
    {activePlots.length === 0 ? <div className="panel scan-no-plots"><div className="empty-icon"><ImagePlus size={28} /></div><h2>Create a plot to begin scanning</h2><p>Every new scan belongs to a pineapple plot or batch, so its history stays organized.</p><button className="button button-primary" onClick={() => onNavigate('farms', '', farms.some(farm => !farm.archivedAt) ? 'add-plot' : 'add-farm')}>Set up a farm and plot <ArrowRight size={17} /></button></div> : <>
      <input ref={fileInput} className="visually-hidden" type="file" tabIndex={-1} aria-label="Choose a pineapple photo" accept="image/*" onChange={event => receiveImage(event.target.files?.[0])} />
      {flowStep < 2 ? <section key={flowStep} className="guided-stage grid items-center gap-8 md:grid-cols-2 md:gap-12" aria-labelledby="scan-step-title">
        <div className={`photo-composition ${stage === 'analyzing' ? 'is-scanning' : ''}`} role="group" aria-label={flowStep === 0 ? 'Photo preview. You can drop or paste a photo here.' : 'Photo ready for scanning'} tabIndex={flowStep === 0 ? 0 : -1} onDragOver={event => event.preventDefault()} onDrop={event => receiveTransferredPhoto(event, event.dataTransfer)} onPaste={event => receiveTransferredPhoto(event, event.clipboardData)}>
          {cameraOpen ? <div className="camera-preview"><video ref={video} autoPlay playsInline muted /><div className="camera-controls"><button className="button button-primary" type="button" ref={captureButton} onClick={capture}><Camera size={17} /> Capture photo</button><button className="icon-button" type="button" onClick={stopCamera} aria-label="Close camera"><X size={19} /></button></div></div> : <div className={`scan-preview ${previewUrl ? 'has-photo' : ''}`}>{previewUrl ? <img src={previewUrl} alt="Prepared pineapple photo to scan" /> : <div><ImagePlus size={36} strokeWidth={1.3} /><strong>Your photo goes here</strong><span>One sample, in clear daylight.</span><button className="button button-soft" type="button" onClick={() => fileInput.current?.click()} disabled={processing}><Plus size={16} /> Add photo</button></div>}</div>}
          {stage === 'analyzing' && <span className="scan-sweep" aria-hidden="true" />}
          <span className="photo-caption">{preparedFile ? 'Your photo · prepared for scanning' : 'PHOTO PREVIEW'}<ShieldCheck size={14} /> {services.browser ? 'Saved on this device' : 'Private to you'}</span>
        </div>
        <div className="guided-action">
          <span className="eyebrow">STEP {flowStep === 0 ? '01 / YOUR PHOTO' : '02 / THE SCAN'}</span>
          <h2 id="scan-step-title" ref={stepHeading} tabIndex={-1}>{flowStep === 0 ? <>Start with<br /> one clear photo.</> : <>Ready for<br /> a closer look?</>}</h2>
          <p>{flowStep === 0 ? 'Fill the frame with your sample or the affected area. Keep it in focus and avoid glare or heavy shadows.' : services.browser ? 'Keep this photo in your plot history while the real scan backend is prepared. You can add observations and care tasks from the plot.' : 'The trained model checks your photo. We’ll save its findings to your plot, then help you review the next step.'}</p>
          {flowStep === 0 ? <>
            <div className="upload-actions"><button className="button button-soft" type="button" onClick={() => fileInput.current?.click()} disabled={processing}><UploadCloud size={17} /> {preparedFile ? 'Replace photo' : 'Upload image'}</button><button className="button button-soft" type="button" ref={cameraTrigger} onClick={openCamera} disabled={processing}><Camera size={17} /> Use camera</button></div>
            <label className="field plot-picker"><span>Save this scan to</span><select ref={plotSelect} value={plotId} onChange={event => setPlotId(event.target.value)} disabled={processing} required aria-label="Farm / plot"><option value="">Choose a plot or batch</option>{activePlots.map(plot => <option key={plot.id} value={plot.id}>{farms.find(farm => farm.id === plot.farmId)?.name || 'Farm'} · {plot.name}</option>)}</select></label>
            <button className="button button-primary button-large guided-next" type="button" disabled={!plotId || !preparedFile || processing || cameraOpen} onClick={() => setFlowStep(1)}>Continue to scan <ArrowRight size={18} /></button>
            <p className="helper-text">{preparedFile ? <><CircleCheck size={15} /> Photo ready. Check that the sample is clear.</> : 'Upload, drop, or paste a photo. JPG and PNG are resized for scanning.'}</p>
          </> : <>
            <div className="scan-destination"><SproutLabel /><div><small>SCANNING FOR</small><strong>{selectedPlot?.name}</strong><span>{farms.find(farm => farm.id === selectedPlot?.farmId)?.name}</span></div></div>
            <details className="scan-options"><summary>Observation & optional advice</summary><div>
              <label className="field"><span>Your observation <em>(optional)</em></span><select value={userCondition} onChange={event => setUserCondition(event.target.value)} disabled={processing}><option value="">I have not observed a condition</option><option value="normal">Looks normal</option><option value="concerning">Looks concerning</option><option value="unsure">I am unsure</option></select></label>
              <label className="check-label"><input type="checkbox" checked={shareWanted} onChange={event => setShareWanted(event.target.checked)} disabled={!services.sharing || processing} /><span><strong>Share results for research</strong><small>Only the result, model version, month, and your reported condition are shared. Photos, notes, and account details stay private.</small></span></label>
              <details className="optional-ai-settings"><summary>Optional text-only AI advice</summary><RecommendationPreference uid={uid} compact /></details>
            </div></details>
            <button className="button button-primary button-large guided-next" type="button" disabled={!services.scanner || !services.photos || !plotId || !preparedFile || !online || processing} onClick={analyze}>{stage === 'analyzing' ? <><LoaderCircle className="spin" size={18} /> Analyzing image…</> : <><ScanLine size={18} /> Scan Pineapple <ArrowRight size={18} /></>}</button>
            {services.browser && !services.scanner && <button className="button button-soft button-large" type="button" disabled={!preparedFile || !plotId || processing} onClick={savePhotoForLater}>Save photo for later <ArrowRight size={18} /></button>}
            <button className="text-link guided-back" type="button" disabled={processing} onClick={() => setFlowStep(0)}><ArrowLeft size={16} /> Back to photo</button>
            {!online && <p className="helper-text error-text"><CloudOff size={16} /> Connect to the internet to scan.</p>}
          </>}
          {error && <div className="inline-error" role="alert">{error}</div>}
        </div>
      </section> : prediction && <section className="guided-report" aria-labelledby="scan-result-title">
        <div className="report-summary-grid grid gap-8 md:grid-cols-[1fr_1.6fr]">
          <div className="report-photo"><img src={previewUrl} alt={prediction.is_photo_only ? "Your saved pineapple photo" : "Your scanned pineapple sample"} /><span className="photo-caption">{selectedPlot?.name} · Your sample</span></div>
          <div className="result-summary"><span className="eyebrow">{prediction.is_photo_only ? 'STEP 03 / SAVED PHOTO' : 'STEP 03 / MODEL FINDINGS'}</span><div className="result-top"><h2 id="scan-result-title" ref={resultHeading} tabIndex={-1}>{prediction.top_class || 'No detection'}</h2><StatusPill type={prediction.status_type}>{prediction.status_label}</StatusPill></div><ConditionBadge label={prediction.top_class} /><p>{prediction.message}</p>{!prediction.is_photo_only && <div className="result-numbers"><div><strong>{formatConfidence(prediction.top_confidence)}</strong><span>Model confidence</span></div><div><strong>{prediction.detection_count ?? 0}</strong><span>Detected regions</span></div></div>}
          {prediction.recommendation && <div className="recommendation-box"><ShieldCheck size={19} /><p><strong>Suggested next step</strong><br />{prediction.recommendation}</p></div>}
          <p className="helper-text">{prediction.is_photo_only ? "No diagnosis or AI recommendation has been generated for this photo." : "Check the plant in person too. Model confidence does not confirm a diagnosis."}</p></div>
        </div>
        {stage === 'saving' && <p className="helper-text"><LoaderCircle className="spin" size={17} /> Saving your scan…</p>}
        {stage === 'unsaved' && <div className="unsaved-box" role="alert"><CloudOff size={20} /><div><strong>This result is unsaved</strong><p>{error}</p><button className="button button-primary" type="button" disabled={!online} onClick={() => persistResult(prediction, pendingId)}><RefreshCw size={16} /> Retry saving</button></div></div>}
        {stage === 'saved' && <div className="saved-box"><CircleCheck size={19} /><span>Saved to {selectedPlot?.name || 'your plot'}.</span><button className="button button-text" type="button" onClick={() => onNavigate('plot', plotId)}>View timeline <ArrowRight size={15} /></button></div>}
        {stage === 'saved' && <RecommendationCard uid={uid} scanId={savedId} autoGenerate />}
        <details className="full-scan-report"><summary><span><strong>Open detailed report</strong><small>{prediction.is_photo_only ? "Saved photo details" : "Detected regions, model details & photo preparation"}</small></span><Plus size={20} /></summary><div className="report-details">{resultImage && <figure><img className="result-image" src={resultImage} alt="Pineapple image with detected regions marked by the model" /><figcaption>Regions marked by the model</figcaption></figure>}<PredictionDetails scan={displayResult} /><ConfidenceHelp /></div></details>
        {stage !== 'saving' && <div className="report-actions"><button className="button button-primary" type="button" onClick={reset}><ImagePlus size={17} /> Start another scan</button><button className="button button-soft" type="button" onClick={() => onNavigate('guide')}>Understand the conditions <ArrowRight size={16} /></button></div>}
      </section>}
    </>}
    <div className="scan-footer"><div className="scan-guide-link"><Leaf size={18} /><span>What can the scanner recognize?</span><button className="text-link" type="button" onClick={() => onNavigate('guide')}>Explore all 7 conditions <ArrowRight size={16} /></button></div>{services.local && <p><ShieldCheck size={15} /> Your photos stay private on this computer.</p>}</div>
  </div>;
}

function SproutLabel() {
  return <Leaf size={22} strokeWidth={1.5} aria-hidden="true" />;
}
