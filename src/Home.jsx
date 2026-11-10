import { useRef } from 'react';
import pineapplePhoto from '../assets/plates/preview-photo.webp';
import { ArrowRight, Camera, Check, FileText, Plus, ScanLine, ShieldCheck } from 'lucide-react';
import { t, getLocale } from './i18n.js';
import { buildActivity, defaultActivityFilters } from './activity';
import { PrivateImage, StatusPill, TaskRow } from './components';
import { dateLabel, statusLabel } from './utils';
import { useLocalToday } from './use-local-today';
import { useWorkspaceServices } from './services';

export default function HomeView({ user, data, onNavigate, onNotify, online, onChoosePhoto }) {
  const services = useWorkspaceServices();
  const photoInput = useRef(null);
  const today = useLocalToday();
  const activeFarms = data.farms.filter(farm => !farm.archivedAt);
  const areas = data.plots.filter(plot => !plot.archivedAt && activeFarms.some(farm => farm.id === plot.farmId));
  const activity = buildActivity(data, defaultActivityFilters, today);
  const recent = activity.filter(entry => entry.type !== 'task').slice(0, 3);
  const tasks = activity.filter(entry => entry.type === 'task' && !entry.record.completedAt && !entry.archived).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const due = tasks.filter(entry => entry.date && entry.date <= today).length;
  const newEntry = kind => areas.length ? onNavigate(kind === 'task' ? 'care' : 'records', areas[0].id, kind) : onNavigate('farms', '', activeFarms.length ? 'add-plot' : 'add-farm');

  return <div className="home-page">
    <header className="screen-heading"><div><h1>{t('Your pineapple workspace.')}</h1><p>{t('Check your pineapples and keep the next step in sight.')}</p></div><time className="home-date" dateTime={today}>{new Intl.DateTimeFormat(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(today + 'T12:00:00'))}</time></header>

    <section className="home-start" aria-labelledby="home-start-title">
      <div className="home-start-copy"><span className="section-label"><ScanLine size={16} />{t('YOUR NEXT FIELD CHECK')}</span><h2 id="home-start-title">{t('Start with one photo.')}</h2><p>{t(services.browser ? 'Save a clear pineapple photo, add what you noticed, and keep a record of your visit.' : 'Get a model-assisted view of your pineapple. Review the result, then decide what to do next.')}</p><input ref={photoInput} hidden type="file" accept="image/*" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)onChoosePhoto(file);}}/><button className="button button-primary" type="button" onClick={() => photoInput.current?.click()}><Camera size={18}/>{t('Choose photo')}<ArrowRight size={17}/></button><small><ShieldCheck size={14}/>{t(services.browser ? 'Guest photos stay in this browser · Not analyzed' : services.demo ? 'Demo results appear on screen and are not saved' : 'Photos and results stay with your growing area')}</small></div>
      <div className="home-start-visual"><img src={pineapplePhoto} width="768" height="1024" alt={t('Illustrative pineapple growing in a field')}/><span>{t('Pineapple care starts with a closer look.')}</span></div>
    </section>

    <div className="home-columns">
      <section className="home-panel" aria-labelledby="home-recent-title"><header className="panel-heading"><div><h2 id="home-recent-title">{t('Recent records')}</h2><p>{t('A look back at your field visits.')}</p></div><button className="text-link" onClick={() => onNavigate('records')}>{t('View all')}<ArrowRight size={15}/></button></header>
        {recent.length ? <div className="home-recent">{recent.map(entry => <button className="home-record" key={entry.key} onClick={() => onNavigate('records', entry.record.plotId, 'open:' + entry.key)}><span className="home-record-image">{entry.type === 'scan' && entry.record.hasPhotos ? <PrivateImage path={entry.record.preparedImagePath} provider={entry.record.storageProvider} alt=""/> : <FileText size={23}/>}</span><span className="home-record-text"><strong>{entry.type === 'scan' ? t(entry.record.isPhotoOnly ? 'Field photo' : entry.record.topClass || 'Photo check') : t('Field note')}</strong><small>{entry.plot?.name || t('Unassigned growing area')}</small><span>{entry.type === 'scan' ? <StatusPill type={entry.record.isPhotoOnly ? 'neutral' : entry.record.statusType}>{entry.record.isPhotoOnly ? t('Not analyzed') : statusLabel(entry.record)}</StatusPill> : entry.record.note}</span></span><span className="home-record-date">{entry.date ? dateLabel(entry.date + 'T12:00:00', {month:'short',day:'numeric'}) : t('Date unavailable')}</span><ArrowRight size={15}/></button>)}</div> : <div className="home-empty"><span className="empty-line-icon"><FileText size={27}/></span><h3>{t('Your field story starts here')}</h3><p>{t('Saved photos and notes will appear here after your first visit.')}</p></div>}
      </section>
      <section className="home-panel" aria-labelledby="home-care-title"><header className="panel-heading"><div><h2 id="home-care-title">{t('Care to follow up')}</h2><p>{due ? t(due === 1 ? '{count} task ready for your attention' : '{count} tasks ready for your attention', {count:due}) : t('Make room for your next field visit.')}</p></div><button className="text-link" onClick={() => onNavigate('care')}>{t('View all')}<ArrowRight size={15}/></button></header>
        {tasks.length ? <div className="home-tasks">{tasks.slice(0,3).map(entry => <div key={entry.key}><small>{entry.plot?.name || t('Unassigned growing area')}</small><TaskRow task={entry.record} uid={user.uid} today={today} onNotify={onNotify}/></div>)}</div> : <div className="home-empty"><span className="empty-line-icon"><Check size={27}/></span><h3>{t('A clear list for the next visit')}</h3><p>{t('Add a care task with a date. Check it off when the work is done.')}</p><button className="text-link" disabled={!online} onClick={() => newEntry('task')}>{t('Plan your first task')}<Plus size={15}/></button></div>}
      </section>
    </div>

  </div>;
}
