import { useState } from 'react';
import { ArrowRight, Camera, CheckCircle2, ClipboardList, HelpCircle, Leaf, ScanLine, ShieldCheck, Sprout, X } from 'lucide-react';
import { supportedConditions } from './conditions';
import { useDialog } from './use-dialog';
import { browserWorkspace } from './firebase';

const introSteps = [
  { icon: Sprout, title: 'Give each scan a home', text: 'Add a farm and a pineapple plot or batch. Scans, observations, and care tasks stay together in that plot’s history.' },
  { icon: Camera, title: 'Take a clear photo', text: 'Choose a plot, upload a photo or use your camera, then check the preview. Use good light and keep the sample visible and in focus.' },
  { icon: ScanLine, title: 'Read the result, choose a next step', text: browserWorkspace ? 'The real scan backend and Gemini are pending deployment. For now, save your photo for later and keep observations and care tasks in its plot. A saved photo is clearly marked Not analyzed.' : 'Scan Pineapple runs the existing detection model and saves its result. Read the condition, model confidence, and suggested next step. Optional AI advice explains the saved result; it does not replace the model or a field inspection.' }
];

export function hasSeenIntroduction(uid) {
  try { return localStorage.getItem(`agriVisionIntro:${uid}:v1`) === 'seen'; }
  catch { return false; }
}

export function rememberIntroduction(uid) {
  try { localStorage.setItem(`agriVisionIntro:${uid}:v1`, 'seen'); } catch { /* Guidance still works when browser storage is unavailable. */ }
}

export function Introduction({ onClose }) {
  const [step, setStep] = useState(0);
  const dialog = useDialog(true, onClose);
  const { icon: Icon, title, text } = introSteps[step];
  return <div className="modal-backdrop intro-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="modal-card introduction-card" role="dialog" aria-modal="true" aria-labelledby="introduction-title" aria-describedby="introduction-description" tabIndex={-1}>
      <div className="introduction-top"><span className="eyebrow">WELCOME TO PINEAPPLE HEALTH</span><button className="icon-button" type="button" onClick={onClose} aria-label="Skip introduction"><X size={19} /></button></div>
      <div className="introduction-progress" aria-label={`Step ${step + 1} of ${introSteps.length}`}>{introSteps.map((_, index) => <span key={index} className={index <= step ? 'complete' : ''} />)}</div>
      <div className="introduction-content" aria-live="polite" aria-atomic="true"><span className="help-step-icon"><Icon size={30} /></span><h2 id="introduction-title">{title}</h2><p id="introduction-description">{text}</p></div>
      <p className="quiet-caption">Open the workspace menu to find How to use and replay this introduction.</p>
      <div className="modal-actions"><button className="button button-text" type="button" onClick={onClose}>Skip for now</button>{step > 0 && <button className="button button-soft" type="button" onClick={() => setStep(value => value - 1)}>Back</button>}<button className="button button-primary" type="button" onClick={() => step === introSteps.length - 1 ? onClose() : setStep(value => value + 1)}>{step === introSteps.length - 1 ? 'Start exploring' : 'Next'}<ArrowRight size={16} /></button></div>
    </section>
  </div>;
}

export default function HowToUseView({ onNavigate, onReplay }) {
  return <div className="view help-view">
    <div className="page-intro"><div><span className="eyebrow">A LITTLE GUIDANCE</span><h1>Let’s get you started.</h1><p>No special skills needed. Just a little curiosity about your crop.</p></div><button className="button button-soft" type="button" onClick={onReplay}><HelpCircle size={18} /> Replay introduction</button></div>
    <div className="help-step-grid">
      {introSteps.map(({ icon: Icon, title, text }, index) => <section className="panel help-step" key={title}><span className="help-step-icon"><Icon size={24} /></span><span className="eyebrow">STEP {index + 1}</span><h2>{title}</h2><p>{text}</p></section>)}
    </div>
    <section className="panel help-photo-guide"><div className="section-heading"><div><span className="eyebrow">BEFORE SCANNING</span><h2>A better photo helps the model</h2></div><Camera size={23} /></div><ul className="help-check-list"><li><CheckCircle2 size={18} /> Use even lighting; avoid strong shadows and glare.</li><li><CheckCircle2 size={18} /> Keep the pineapple sample and affected area clearly visible.</li><li><CheckCircle2 size={18} /> Hold the camera steady and review the photo for blur.</li><li><CheckCircle2 size={18} /> Retake the photo if the sample is too small or hidden.</li></ul></section>
    <div className="help-reference-grid"><section className="panel"><Leaf size={24} className="help-card-icon" /><h2>Understand the supported conditions</h2><p>The model recognizes seven classes. The health guide explains which are pathological diseases, physiological disorders, or No Disease.</p><p className="quiet-caption">{supportedConditions.map(condition => condition.label).join(' · ')}</p><button className="text-link" type="button" onClick={() => onNavigate('guide')}>Open health guide <ArrowRight size={16} /></button></section><section className="panel"><ClipboardList size={24} className="help-card-icon" /><h2>Keep your own field record</h2><p>Open a plot to record an observation or add a care task. Activity brings scans, observations, and tasks together, with date and status filters.</p><button className="text-link" type="button" onClick={() => onNavigate('activity')}>Open Activity <ArrowRight size={16} /></button></section></div>
    <div className="callout subtle"><ShieldCheck size={20} /><span>Model confidence describes a prediction, not a confirmed diagnosis. AI advice is optional and uses scan result text only. Photos and farm notes are not sent to the AI service. Neither the scanner nor AI can establish ripeness or food safety.</span></div>
    <div className="help-start-actions"><button className="button button-primary" type="button" onClick={() => onNavigate('scan')}><ScanLine size={18} /> Start a scan</button><button className="button button-soft" type="button" onClick={() => onNavigate('farms')}><Sprout size={18} /> Set up farms & plots</button></div>
  </div>;
}
