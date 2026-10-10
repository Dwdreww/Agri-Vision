import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Leaf, Camera, CircleCheck, CloudOff, ImagePlus, LoaderCircle, RefreshCw, ScanLine, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { cleanupUnsavedScan, saveScan, shareScan, userCollection } from './data';
import { prepareImage, readableError } from './utils';
import { ConditionBadge, ConfidenceHelp, PredictionDetails, StatusPill } from './components';
import RecommendationCard, { RecommendationPreference } from './Recommendations.jsx';
import { formatConfidence } from './recommendation-utils.js';
import { useWorkspaceServices } from './services';
import { PineappleMark } from './FieldArt';

export default function ScanView({ uid, user, plots, farms, initialPlotId, onNotify, onNavigate, online }) {
  const services = useWorkspaceServices();
  const [plotId, setPlotId] = useState(initialPlotId || '');
  const [preparedFile, setPreparedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [stage, setStage] = useState('idle');
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
    if (!prediction) return;
    resultHeading.current?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 1024px)').matches) resultHeading.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [prediction]);

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
      } else onNotify('Scan saved to this plot.');
    } catch (error) {
      setStage('unsaved');
      setError(`The model result is ready, but it has not been saved: ${readableError(error)}`);
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
      const id = doc(userCollection(uid, 'scans')).id;
      setPendingId(id);
      await persistResult(result, id);
    } catch (error) {
      setStage('ready');
      setError(readableError(error));
    }
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
    userCondition
  } : null;
  const resultImage = prediction?.annotated_image?.startsWith('data:image/jpeg;base64,') ? prediction.annotated_image : '';

  const processing = ['preparing', 'analyzing', 'saving'].includes(stage);
  const currentStep = ['analyzing', 'saving'].includes(stage) ? 4 : prediction ? 5 : !plotId ? 1 : !preparedFile ? 2 : 3;
  const stageText = { preparing: 'Preparing your photo for scanning…', analyzing: 'Analyzing the photo with the pineapple model…', saving: 'Saving your result and private photos…', saved: 'Your scan is saved. Review the result below.', unsaved: 'Your result is ready but has not been saved.' }[stage] || '';

  return <div className="view scan-view">
    <div className="page-intro scan-intro"><div><span className="eyebrow">PLANT CHECK</span><h1>Scan</h1><p>Choose a plot and add one clear photo. Your result saves automatically.</p></div><div className="intro-symbol"><PineappleMark size={62} /></div></div>
    <ol className="scan-steps" aria-label="Scanning steps">{['Choose plot', 'Add photo', 'Preview', 'Scan Pineapple', 'Review results'].map((label, index) => <li key={label} className={currentStep === index + 1 ? 'is-current' : currentStep > index + 1 ? 'is-complete' : ''} aria-current={currentStep === index + 1 ? 'step' : undefined}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>
    <p className={`scan-stage ${processing ? 'is-processing' : ''}`} role="status" aria-live="polite">{processing && <LoaderCircle className="spin" size={17} />}{stageText}</p>
    {(!services.scanner || !services.photos) && <div className="callout subtle" role="status"><CircleCheck size={17} /><span>{services.checking ? 'Checking scanner availability…' : 'Scanning is temporarily unavailable. You can still manage farms, observations, and care tasks.'}</span>{!services.checking && <button className="button button-soft" type="button" onClick={services.retry}>Check availability</button>}</div>}
    {activePlots.length === 0 ? <div className="panel scan-no-plots"><div className="empty-icon"><ImagePlus size={28} /></div><h2>Create a plot to begin scanning</h2><p>Every new scan belongs to a pineapple plot or batch, so its history stays organized.</p><button className="button button-primary" onClick={() => onNavigate('farms', '', farms.some(farm => !farm.archivedAt) ? 'add-plot' : 'add-farm')}>Set up a farm and plot</button></div> : <>
      <div className="scan-layout">
        <section className="panel scan-form-panel">
          <div className="step-label"><span>01</span> SELECT A PLOT</div>
          <label className="field"><span>Farm / plot</span><select ref={plotSelect} value={plotId} onChange={event => { setPlotId(event.target.value); if (prediction && !savedId) setStage('unsaved'); }} disabled={stage === 'analyzing' || stage === 'saving' || Boolean(savedId)} required><option value="">Choose a plot or batch</option>{activePlots.map(plot => <option key={plot.id} value={plot.id}>{farms.find(farm => farm.id === plot.farmId)?.name || 'Farm'} · {plot.name}</option>)}</select></label>
          <div className="step-label"><span>02</span> ADD A PHOTO</div>
          <input ref={fileInput} className="visually-hidden" type="file" tabIndex={-1} aria-label="Choose a pineapple photo" accept="image/*" onChange={event => receiveImage(event.target.files?.[0])} />
          <div className="upload-actions"><button className="button button-soft" type="button" onClick={() => fileInput.current?.click()} disabled={processing}><UploadCloud size={18} /> Upload image</button><button className="button button-soft" type="button" ref={cameraTrigger} onClick={openCamera} disabled={processing}><Camera size={18} /> Use camera</button></div>
          <div className="photo-guidance"><strong>For a clearer result</strong><p>Photograph one sample in even daylight. Fill the frame with the affected area, keep it in focus, and avoid glare or heavy shadows.</p></div>
          <div className="step-label"><span>03</span> PREVIEW YOUR PHOTO</div>
          {cameraOpen && <div className="camera-preview"><video ref={video} autoPlay playsInline muted /><div className="camera-controls"><button className="button button-primary" type="button" ref={captureButton} onClick={capture}><Camera size={17} /> Capture photo</button><button className="icon-button" type="button" onClick={stopCamera} aria-label="Close camera"><X size={19} /></button></div></div>}
          {!cameraOpen && <div className={`scan-preview ${previewUrl ? 'has-photo' : ''}`}>{previewUrl ? <img src={previewUrl} alt="Prepared pineapple photo to scan" /> : <div><ImagePlus size={32} /><strong>Photo preview</strong><span>JPG and PNG photos are resized for scanning.</span></div>}</div>}
          {preparedFile && <p className="helper-text"><CircleCheck size={15} /> Photo prepared and ready to scan.</p>}
          <div className="step-label"><span>04</span> SCAN PINEAPPLE</div>
          <details className="scan-options"><summary>Optional: your observation, research sharing & AI advice</summary><div>
          <label className="field"><span>Your observation of this sample <em>(optional)</em></span><select value={userCondition} onChange={event => setUserCondition(event.target.value)} disabled={Boolean(savedId) || stage === 'saving' || stage === 'analyzing'}><option value="">I have not observed a condition</option><option value="normal">Looks normal</option><option value="concerning">Looks concerning</option><option value="unsure">I am unsure</option></select></label>
          <label className="check-label"><input type="checkbox" checked={shareWanted} onChange={event => setShareWanted(event.target.checked)} disabled={!services.sharing || Boolean(savedId) || stage === 'saving' || stage === 'analyzing'} /><span><strong>Share results for research</strong><small>Only the result, model version, month, and your reported condition are shared. Photos, notes, and account details stay private.</small></span></label>
          {!savedId && <details className="optional-ai-settings"><summary>Optional text-only AI advice</summary><RecommendationPreference uid={uid} compact /></details>}
          </div></details>
          <button className="button button-primary button-large scan-submit" type="button" disabled={!services.scanner || !services.photos || !plotId || !preparedFile || !online || ['preparing', 'analyzing', 'saving'].includes(stage) || Boolean(savedId)} onClick={analyze}>{stage === 'analyzing' ? <><LoaderCircle className="spin" size={18} /> Analyzing image…</> : stage === 'saving' ? <><LoaderCircle className="spin" size={18} /> Saving result…</> : <><ScanLine size={18} /> Scan Pineapple</>}</button>
          {!online && <p className="helper-text error-text"><CloudOff size={16} /> Connect to the internet to scan.</p>}
        </section>
        <section className={`panel scan-result-panel ${prediction ? '' : 'awaiting-result'}`} aria-labelledby="scan-result-title">
          <div className="result-top"><div><span className="eyebrow">SCAN RESULT</span><h2 id="scan-result-title" ref={resultHeading} tabIndex={-1}>{prediction ? 'Review results' : 'Scan result'}</h2></div>{prediction && <StatusPill type={prediction.status_type}>{prediction.status_label}</StatusPill>}</div>
          {!prediction ? <div className="result-empty"><div className="result-orbit"><PineappleMark size={62} /></div><h3>Your result will appear here.</h3><p>Review the model’s findings and suggested next step. Check the plant in person too.</p></div> : <>
            {resultImage && <img className="result-image" src={resultImage} alt="Pineapple image with detected regions marked by the model" />}
            <div className="result-summary"><span className="eyebrow">MODEL RESULT</span><h3>{prediction.top_class || 'No detection'}</h3><ConditionBadge label={prediction.top_class} /><p>{prediction.message}</p><div className="result-numbers"><div><strong>{formatConfidence(prediction.top_confidence)}</strong><span>Model confidence</span></div><div><strong>{prediction.detection_count ?? 0}</strong><span>Detected regions</span></div></div></div>
            <ConfidenceHelp />
            {prediction.recommendation && <div className="recommendation-box"><ShieldCheck size={19} /><p><strong>Scanner’s suggested next step</strong><br />{prediction.recommendation}</p></div>}
            <details className="technical-details"><summary>Bounding boxes & image preparation</summary><PredictionDetails scan={displayResult} /></details>
            {stage === 'unsaved' && <div className="unsaved-box" role="alert"><CloudOff size={20} /><div><strong>This result is unsaved</strong><p>{error}</p><button className="button button-primary" type="button" disabled={!online} onClick={() => persistResult(prediction, pendingId)}><RefreshCw size={16} /> Retry saving</button></div></div>}
            {stage === 'saved' && <div className="saved-box"><CircleCheck size={19} /><span>Saved to {selectedPlot?.name || 'your plot'}.</span><button className="button button-text" type="button" onClick={() => onNavigate('plot', plotId)}>View timeline</button></div>}
            {stage === 'saved' && <RecommendationCard uid={uid} scanId={savedId} autoGenerate />}
            {stage === 'saved' && <button className="button button-soft new-scan" type="button" onClick={reset}>Start another scan</button>}
          </>}
          {error && stage !== 'unsaved' && <div className="inline-error" role="alert">{error}</div>}
        </section>
      </div>
    </>}
    <div className="scan-footer">
    <div className="scan-guide-link"><Leaf size={18} /><span>What can the scanner recognize?</span><button className="text-link" type="button" onClick={() => onNavigate('guide')}>Explore all 7 conditions <ArrowRight size={16} /></button></div>
    {services.local && <p><ShieldCheck size={17} /> Photos are stored privately on this computer. Keep the local workspace running to scan and view photos.</p>}
    </div>
  </div>;
}
