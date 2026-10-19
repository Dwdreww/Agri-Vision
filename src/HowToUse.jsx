import { t } from './i18n.js';
import { useState } from 'react';
import { ArrowRight, Camera, CheckCircle2, ClipboardList, HelpCircle, Leaf, ScanLine, ShieldCheck, Sprout, X } from 'lucide-react';
import { useDialog } from './use-dialog';
import { browserWorkspace } from './firebase';

const introSteps = [
  { icon: Sprout, title: 'Give your records a place', text: 'Start on Overview. Name your farm, then add a growing area such as East Field or Batch A. This keeps photos, notes, and tasks for the same place together.' },
  { icon: Camera, title: 'Make one photo check', text: 'Open Check, choose the growing area, and add a clear photo. Review it before continuing. When analysis is unavailable in guest mode, you can still save the photo as Not analyzed.' },
  { icon: ClipboardList, title: 'Keep track of the next visit', text: 'Open your growing area to write what you saw in a field note. Add a care task with a due date for your next visit. Overview shows tasks needing attention; History helps you find earlier records.' }
];

export function Introduction({ onClose }) {
  const [step, setStep] = useState(0);
  const dialog = useDialog(true, onClose);
  const { icon: Icon, title, text } = introSteps[step];
  return <div className="modal-backdrop intro-backdrop">
    <section ref={dialog} className="modal-card introduction-card" role="dialog" aria-modal="true" aria-labelledby="introduction-title" aria-describedby="introduction-description" tabIndex={-1}>
      <div className="introduction-top"><span className="eyebrow">{t("QUICK INTRODUCTION")}</span><button className="icon-button" type="button" onClick={onClose} aria-label={t("Close introduction")}><X size={19} /></button></div>
      <div className="introduction-progress" aria-label={t("Step {value0} of {value1}", { value0: step + 1, value1: introSteps.length })}>{introSteps.map((_, index) => <span key={index} className={index <= step ? 'complete' : ''} />)}</div>
      <div className="introduction-content" aria-live="polite" aria-atomic="true"><span className="help-step-icon"><Icon size={30} /></span><h2 id="introduction-title">{t(title)}</h2><p id="introduction-description">{t(text)}</p></div>
      <p className="quiet-caption">{t("The setup checklist on Overview opens each real task. You can leave it and continue later.")}</p>
      <div className="modal-actions"><button className="button button-text" type="button" onClick={onClose}>{t("Close")}</button>{step > 0 && <button className="button button-soft" type="button" onClick={() => setStep(value => value - 1)}>{t("Back")}</button>}<button className="button button-primary" type="button" onClick={() => step === introSteps.length - 1 ? onClose() : setStep(value => value + 1)}>{step === introSteps.length - 1 ? t("Done") : t("Next")}<ArrowRight size={16} /></button></div>
    </section>
  </div>;
}

const destinations = [
  { page: 'dashboard', title: 'Overview', why: 'Your starting point. Follow the setup checklist, see tasks due, or choose your next action.', action: 'Open Overview' },
  { page: 'farms', title: 'Farms & growing areas', why: 'Choose the place you are checking. Open a growing area to add a field note or care task.', action: 'Open farms' },
  { page: 'scan', title: 'Check a pineapple', why: 'Add one clear photo. Review a model result when available, or save an unanalyzed photo in guest mode.', action: 'Start a check' },
  { page: 'activity', title: 'History', why: 'Find earlier photos, results, field notes, and tasks. Search by a word or filter by growing area and date.', action: 'Open History' },
  { page: 'settings', title: 'Settings', why: 'Change language or appearance. In guest mode, export a copy of your records and photos.', action: 'Open Settings' }
];

export default function HowToUseView({ onNavigate, onReplay }) {
  return <div className="view help-view">
    <div className="page-intro"><div><span className="eyebrow">{t("HELP WHEN YOU NEED IT")}</span><h1>{t("How to use Agri-Vision")}</h1><p>{t("Keep a record of your pineapples, understand each check, and plan what to do next. Choose a task below to get there.")}</p></div><button className="button button-soft" type="button" onClick={onReplay}><HelpCircle size={18} />{t(" Quick introduction")}</button></div>
    <div className="help-destinations">{destinations.map(item => <section className="panel" key={item.page}><h2>{t(item.title)}</h2><p>{t(item.why)}</p><button className="text-link" type="button" onClick={() => onNavigate(item.page)}>{t(item.action)}<ArrowRight size={16} /></button></section>)}</div>
    <section className="panel"><h2>{t("Photos, field notes, and care tasks")}</h2><div className="help-step-grid"><div><Camera size={23} /><h3>{t("Photo check")}</h3><p>{t("A saved photo of one sample, with the model result when analysis is available. It does not describe every plant in the growing area.")}</p></div><div><ClipboardList size={23} /><h3>{t("Field note")}</h3><p>{t("What you saw yourself. Example: Leaf tips are yellow near the path. Add the visit date so you can compare it later.")}</p></div><div><CheckCircle2 size={23} /><h3>{t("Care task")}</h3><p>{t("Something you plan to do. Example: Check these plants again on Friday. Tick the task after doing the work. Tasks appear in the app; they do not send phone notifications.")}</p></div></div></section>
    <section className="panel help-photo-guide"><div className="section-heading"><h2>{t("Take a useful photo")}</h2><Camera size={23} /></div><ul className="help-check-list"><li><CheckCircle2 size={18} />{t(" Use daylight without strong shadows or glare.")}</li><li><CheckCircle2 size={18} />{t(" Keep the sample and affected area clearly visible.")}</li><li><CheckCircle2 size={18} />{t(" Hold the camera steady. Retake a blurry photo.")}</li><li><CheckCircle2 size={18} />{t(" Choose the correct growing area before saving.")}</li></ul></section>
    <section className="panel"><h2>{t("What happens after saving?")}</h2><p>{t("Open History or the growing area to find the record again. View details opens the photo and report. Add a field note about what you observed and a care task for any follow-up.")}</p><p>{browserWorkspace ? t("Guest records stay on this site in this browser. Use Settings → Export records & photos to keep a separate copy. Returning to sign in does not delete your guest records.") : t("Your signed-in account keeps its own records. Guest history is separate and is not added to your account automatically.")}</p><button className="text-link" type="button" onClick={() => onNavigate('activity')}>{t("Open History")}<ArrowRight size={16} /></button></section>
    <div className="help-reference-grid"><section className="panel"><Leaf size={24} /><h2>{t("Understand a result")}</h2><p>{t("A condition label is the model’s suggestion for the photo. Confidence describes how sure the model is about that label; it does not measure how badly the plant is affected. Open View details for the full report.")}</p><button className="text-link" type="button" onClick={() => onNavigate('guide')}>{t("Open health guide")}<ArrowRight size={16} /></button></section><section className="panel"><ShieldCheck size={24} /><h2>{t("When analysis is unavailable")}</h2><p>{t("Not analyzed means the photo has been saved without a model result. It does not mean the plant is healthy. You can still write field notes and plan care tasks.")}</p></section></div>
    <div className="help-start-actions"><button className="button button-primary" type="button" onClick={() => onNavigate('dashboard')}><Sprout size={18} />{t(" Back to Overview")}</button><button className="button button-soft" type="button" onClick={() => onNavigate('scan')}><ScanLine size={18} />{t(" Start a check")}</button></div>
  </div>;
}
