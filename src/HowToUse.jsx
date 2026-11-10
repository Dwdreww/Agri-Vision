import { t } from './i18n.js';
import { useState } from 'react';
import { ArrowRight, Camera, CheckCircle2, ClipboardList, HelpCircle, Leaf, ScanLine, ShieldCheck, Sprout, X } from 'lucide-react';
import { useDialog } from './use-dialog';
import { browserWorkspace } from './firebase';

const introSteps = [
  { icon: Camera, title: 'Begin with a photo', text: 'Use Choose photo on Home, or open Photo check. Review the image and save from the same screen. Guest photos are saved without model analysis.' },
  { icon: ClipboardList, title: 'Keep observations in Records', text: 'Records keeps photos, field notes, and care tasks together. Choose a category, then use its single add button or search your saved entries.' },
  { icon: CheckCircle2, title: 'Give the next step a date', text: 'In Records, choose Care tasks. Add a task and due date, then mark it complete after your visit. Find Growing areas in the workspace menu when you need to organize a farm.' }
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
      <p className="quiet-caption">{t("Use Home, Photo check, and Records to move around your workspace.")}</p>
      <div className="modal-actions"><button className="button button-text" type="button" onClick={onClose}>{t("Close")}</button>{step > 0 && <button className="button button-soft" type="button" onClick={() => setStep(value => value - 1)}>{t("Back")}</button>}<button className="button button-primary" type="button" onClick={() => step === introSteps.length - 1 ? onClose() : setStep(value => value + 1)}>{step === introSteps.length - 1 ? t("Done") : t("Next")}<ArrowRight size={16} /></button></div>
    </section>
  </div>;
}

export default function HowToUseView({ onNavigate, onReplay }) {
  return <div className="view help-view">
    <header className="screen-heading"><div><h1>{t('A simpler way through your field day.')}</h1><p>{t('Three main pages keep your everyday work close at hand.')}</p></div><button className="button button-soft" onClick={onReplay}><HelpCircle size={17}/>{t('Quick introduction')}</button></header>
    <div className="help-destinations">{[
      ['scan',Camera,'Start a photo check','Use one Choose photo button. Review the image, then run the model or save it without analysis in guest mode.','Open photo check'],
      ['records',ClipboardList,'Find a photo or field note','Your saved photographs and personal observations are in Records. Use the categories, search, or growing-area filters.','Open records'],
      ['care',CheckCircle2,'Plan a follow-up','Open Records and choose Care tasks. Add a due date and mark work complete after your visit. Tasks do not send phone notifications.','Open care tasks'],
      ['farms',Sprout,'Organize your growing areas','Create a farm, then add its fields or batches as growing areas. Choose the right growing area when you save a photo or note.','Open growing areas']
    ].map(([page,Icon,title,description,action])=><section className="panel" key={page}><Icon size={25} strokeWidth={1.5}/><h2>{t(title)}</h2><p>{t(description)}</p><button className="text-link" onClick={()=>onNavigate(page)}>{t(action)}<ArrowRight size={16}/></button></section>)}</div>
    <section className="panel help-photo-guide"><div className="section-heading"><h2>{t('A useful photo makes a difference.')}</h2><Camera size={23}/></div><ul className="help-check-list"><li><CheckCircle2 size={18}/>{t('Use daylight without strong shadows or glare.')}</li><li><CheckCircle2 size={18}/>{t('Keep one pineapple or its affected area clearly visible.')}</li><li><CheckCircle2 size={18}/>{t('Hold the camera steady and replace a blurry photo.')}</li><li><CheckCircle2 size={18}/>{t('Select the right growing area before saving.')}</li></ul></section>
    <section className="panel"><h2>{t('A photo result is a starting point.')}</h2><p>{t('Check the plant in person too. A model prediction does not confirm a diagnosis, and confidence does not measure how badly a plant is affected.')}</p><button className="text-link" onClick={()=>onNavigate('guide')}>{t('Learn about the supported conditions')}<ArrowRight size={16}/></button></section>
    <section className="panel"><h2>{t('Where do your records go?')}</h2><p>{browserWorkspace ? t('Guest photos, notes, and tasks stay in this browser. Settings has Export records & photos so you can keep a separate backup.') : t('Your signed-in workspace keeps its own records. Guest history remains separate. The public demo shows its result on screen without saving a new record.')}</p><button className="text-link" onClick={()=>onNavigate('settings')}>{t('Open settings')}<ArrowRight size={16}/></button></section>
  </div>;
}
