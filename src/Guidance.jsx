import { useState } from 'react';
import { ArrowRight, Check, HelpCircle, Sprout, Camera, MapPin } from 'lucide-react';
import { useLanguage } from './Language.jsx';
import { isSetupHidden, rememberSetupHidden, setupProgress } from './onboarding.js';

function storage() { try { return window.localStorage; } catch { return undefined; } }

export function PageHelp({ children }) {
  const { t } = useLanguage();
  return <details className="page-help"><summary><HelpCircle size={17} />{t('How this page works')}</summary><div>{children}</div></details>;
}

export function SetupChecklist({ uid, data, onNavigate }) {
  const { t } = useLanguage();
  const progress = setupProgress(data);
  const [hidden, setHidden] = useState(() => isSetupHidden(storage(), uid));
  const [showComplete, setShowComplete] = useState(false);
  function toggle(value) { setHidden(value); rememberSetupHidden(storage(), uid, value); }
  if (hidden || (progress.complete && !showComplete)) return <div className="setup-return"><span><Check size={17} />{t(progress.complete ? 'Your first check is saved. Keep adding photos, field notes, and care tasks.' : 'You can explore at your own pace. Your setup progress is saved.')}</span><button className="text-link" type="button" onClick={() => { toggle(false); setShowComplete(true); }}>{t('Show setup guide')}</button></div>;
  const steps = [
    { Icon: MapPin, title: 'Name your farm', why: 'A farm groups the growing areas you look after.', example: 'Example: Santos Farm', action: progress.done[0] ? 'View farms' : data.farms.some(f => f.id === 'starter-farm' && !f.archivedAt) ? 'Name your farm' : 'Add farm', go: () => onNavigate('farms', '', progress.done[0] ? '' : 'setup-farm') },
    { Icon: Sprout, title: 'Add a growing area', why: 'A growing area is a field, section, or batch of pineapples. Keep its checks together.', example: 'Example: East Field or Batch A', action: progress.done[1] ? 'View growing area' : 'Add a growing area', go: () => progress.done[1] ? onNavigate('plot', progress.plot.id) : onNavigate('farms', '', progress.done[0] ? 'setup-area' : 'setup-farm') },
    { Icon: Camera, title: 'Make your first check', why: 'Save a clear photo in its growing area. Find it again in History to review changes.', example: 'Checks appear in History only after they are saved.', action: progress.done[2] ? 'Open History' : 'Start a check', go: () => progress.done[2] ? onNavigate('activity') : progress.done[1] ? onNavigate('scan', progress.plot.id) : onNavigate('farms', '', progress.done[0] ? 'setup-area' : 'setup-farm') }
  ];
  return <section className="panel setup-guide" aria-labelledby="setup-title">
    <div className="section-heading"><div><span className="eyebrow">{t('START HERE')}</span><h2 id="setup-title">{t('Your first field check')}</h2><p className="section-description">{t('Follow these steps, or explore and come back later. Nothing is submitted until you save.')}</p></div><span className="setup-count" role="status">{t('{count} of 3 complete', { count: progress.completed })}</span></div>
    <ol className="setup-checklist">{steps.map(({ Icon, title, why, example, action, go }, index) => <li key={title} className={progress.done[index] ? 'complete' : ''}><span className="setup-step-number" aria-label={t(progress.done[index] ? 'Complete' : 'Step {number}', {number:index + 1})}>{progress.done[index] ? <Check size={18} /> : index + 1}</span><div><h3><Icon size={18} />{t(title)}</h3><p>{t(why)}</p><p className="setup-example">{t(example)}</p><button className="text-link" type="button" onClick={go}>{t(index === 1 && !progress.done[0] ? 'Name your farm first' : index === 2 && !progress.done[1] ? progress.done[0] ? 'Add a growing area first' : 'Name your farm first' : action)}<ArrowRight size={16} /></button></div></li>)}</ol>
    <div className="setup-footer"><span>{t('Progress follows your saved records. You can leave and continue later.')}</span><button className="text-link" type="button" onClick={() => toggle(true)}>{t('I’ll explore first')}</button></div>
  </section>;
}
