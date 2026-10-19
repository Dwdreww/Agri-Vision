import { t } from './i18n.js';
import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
import { Archive, ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Download, FileClock, FlaskConical, Leaf, ListChecks, LockKeyhole, MapPin, Plus, RefreshCw, ScanLine, Search, Settings2, ShieldCheck, Sprout, Trash2 } from 'lucide-react';
import { auth, db, browserWorkspace } from './firebase';
import { useWorkspaceServices } from './services';
import { archiveFarm, archivePlot, createFarm, createObservation, createPlot, createTask, deleteAccount, importLegacyHistory, updateFarm, updatePlot } from './data';
import { ConditionBadge, EmptyState, ObservationCard, ScanCard, SectionTitle, StatusPill, TaskRow } from './components';
import { conditionLabel, dateLabel, getLegacyHistory, newestFirst, readableError, timestampMs } from './utils';
import { buildResearchCsv } from './research-csv';
import { activityPage, activityStatusOptions, buildActivity, changeActivityFilter, defaultActivityFilters, groupActivity } from './activity';
import { useLocalToday } from './use-local-today';
import { useDialog } from './use-dialog';
import { RecommendationPreference } from './Recommendations.jsx';
import { formatConfidence } from './recommendation-utils.js';
import { LanguageSettings, useLanguage } from './Language.jsx';
import { PageHelp, SetupChecklist } from './Guidance.jsx';
import { setupProgress } from './onboarding.js';

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function DashboardView({ user, data, onNavigate, onNotify }) {
  const farms = data.farms.filter(item => !item.archivedAt);
  const plots = data.plots.filter(item => !item.archivedAt && farms.some(farm => farm.id === item.farmId));
  const scans = newestFirst(data.scans);
  const observations = newestFirst(data.observations, 'observedAt').filter(item => plots.some(plot => plot.id === item.plotId));
  const today = useLocalToday();
  const due = data.tasks.filter(item => !item.completedAt && item.dueDate <= today && plots.some(plot => plot.id === item.plotId)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const recentScans = scans.filter(item => !item.plotId || plots.some(plot => plot.id === item.plotId)).slice(0, 3);
  const greeting = data.profile?.displayName?.trim() || 'Grower';
  const progress = setupProgress(data);
  const setup = () => onNavigate('farms', '', progress.done[0] ? 'setup-area' : 'setup-farm');
  return <div className="view dashboard-view">
    <div className="page-intro overview-heading"><div><span className="eyebrow">{t("YOUR GROWING SPACE")}</span><h1>{t("Overview")}</h1><p>{t('Hello, {name}. Keep your pineapple photos, field notes, and care tasks together. Start here to see what to do next.', { name: greeting.split(' ')[0] })}</p></div><button className="button button-primary" type="button" onClick={progress.done[1] ? () => onNavigate('scan', progress.plot.id) : setup}>{progress.done[1] ? <ScanLine size={18} /> : <Plus size={18} />}{t(progress.done[1] ? 'Start a check' : progress.done[0] ? 'Add a growing area' : 'Name your farm')}</button></div>
    <SetupChecklist uid={user.uid} data={data} onNavigate={onNavigate} />
    <div className="overview-shortcuts"><button type="button" onClick={plots.length ? () => onNavigate('scan') : setup}><ScanLine size={22} /><strong>{t("Check a pineapple")}</strong><span>{t("Take a photo and save a check to a growing area.")}</span><ArrowRight size={16} /></button><button type="button" onClick={() => plots.length === 1 ? onNavigate('plot', plots[0].id, 'observation') : plots.length ? onNavigate('farms') : setup()}><ClipboardList size={22} /><strong>{t("Add a field note")}</strong><span>{t("Write what you saw during a field visit.")}</span><ArrowRight size={16} /></button><button type="button" onClick={() => onNavigate('activity')}><FileClock size={22} /><strong>{t("Review History")}</strong><span>{t("Find earlier photos, notes, and care tasks.")}</span><ArrowRight size={16} /></button></div>
    <div className="stats-grid" aria-label={t("Workspace summary")}>
      <div className="stat-card"><MapPin size={18} /><strong>{farms.length}</strong><span>{t("Active farms")}</span></div>
      <div className="stat-card"><Sprout size={18} /><strong>{plots.length}</strong><span>{t("Tracked growing areas")}</span></div>
      <div className="stat-card"><ScanLine size={18} /><strong>{scans.length}</strong><span>{browserWorkspace ? t("Saved checks & photos") : t("Saved checks")}</span></div>
      <div className="stat-card"><CalendarDays size={18} /><strong>{due.length}</strong><span>{t("Tasks due")}</span></div>
    </div>
    <div className="overview-workspace">
      <section className="panel overview-care" aria-labelledby="overview-care-title"><div className="section-heading"><div><span className="eyebrow">{t("NEXT ACTIONS")}</span><h2 id="overview-care-title">{t("Care tasks")}</h2><p className="section-description">{t("Due today and overdue.")}</p></div><span className="section-count">{due.length}</span></div>{due.length ? <div className="task-list">{due.slice(0, 3).map(task => <TaskRow key={task.id} task={task} uid={user.uid} today={today} plotName={plots.find(plot => plot.id === task.plotId)?.name} onNotify={onNotify} />)}</div> : <div className="care-clear"><CheckCircle2 size={22} /><div><strong>{t("No tasks due")}</strong><p>{t("Plan your next field visit from a growing area.")}</p></div></div>}<button className="text-link care-view-link" type="button" onClick={() => onNavigate('activity', '', 'tasks')}>{t("View care tasks ")}<ArrowRight size={15} /></button></section>
      <section className="panel overview-plots" aria-labelledby="overview-plots-title"><div className="section-heading"><div><span className="eyebrow">{t("GROWING SPACE")}</span><h2 id="overview-plots-title">{t("Your growing areas")}</h2><p className="section-description">{t("Open a growing area to record field notes and plan care.")}</p></div><button className="text-link" type="button" onClick={() => onNavigate('farms')}>{t("Manage farms ")}<ArrowRight size={15} /></button></div>
        {plots.length ? <div className="overview-plot-list">{plots.slice(0, 4).map(plot => {
          const plotScans = scans.filter(item => item.plotId === plot.id);
          const farm = farms.find(item => item.id === plot.farmId);
          const latest = plotScans[0];
          return <article className="overview-plot" key={plot.id}><div className="plot-row-icon"><Sprout size={20} /></div><div className="overview-plot-info"><span>{farm?.name || t("Farm")}</span><h3>{plot.name}</h3><p>{latest ? <><StatusPill type={latest.statusType}>{t(latest.statusLabel || latest.topClass)}</StatusPill><span>{t("Latest check · ")}{dateLabel(latest.createdAt)}</span></> : t("No checks yet")}</p></div><div className="overview-plot-actions"><button className="button button-soft" type="button" onClick={() => onNavigate('scan', plot.id)} aria-label={t("Check {value0}", { value0: plot.name })}><ScanLine size={16} />{t(" Check")}</button><button className="text-link" type="button" onClick={() => onNavigate('plot', plot.id)} aria-label={t("View {value0}", { value0: plot.name })}>{t("View growing area ")}<ArrowRight size={14} /></button></div></article>;
        })}{plots.length > 4 && <button className="text-link all-plots-link" type="button" onClick={() => onNavigate('farms')}>{t("View all ")}{plots.length}{t(" growing areas ")}<ArrowRight size={15} /></button>}</div> : <EmptyState icon={Sprout} title={farms.length ? t("Add your first growing area") : t("Create your growing space")} description={farms.length ? t("A growing area can be a field, planting area, or batch of pineapples.") : t("Add a farm, then a growing area, to keep every plant check in the right place.")} action={farms.length ? t("Add growing area") : t("Add farm")} onAction={setup} />}
      </section>
    </div>
    <section className="recent-records" aria-labelledby="recent-records-title">
      <div className="section-heading">
        <div><span className="eyebrow">{t("PAST RECORDS")}</span><h2 id="recent-records-title">{t("Recent records")}</h2><p className="section-description">{t("Review saved checks and field notes.")}</p></div>
        <button className="text-link" type="button" onClick={() => onNavigate('activity')}>{t("Open History ")}<ArrowRight size={15} /></button>
      </div>
      <div className="recent-records-grid">
        <section className="panel" aria-labelledby="recent-scans-title">
          <div className="section-heading"><h2 id="recent-scans-title">{t("Photo checks")}</h2><span className="section-count">{recentScans.length}</span></div>
          {recentScans.length ? <div className="record-list">{recentScans.map(scan => <ScanCard key={scan.id} scan={scan} uid={user.uid} plots={data.plots} farms={data.farms} onNotify={onNotify} compact />)}</div> : <div className="record-empty"><p>{t("Your saved photos and results will appear here.")}</p><button className="text-link" type="button" onClick={plots.length ? () => onNavigate('scan') : setup}>{plots.length ? t("Start your first check") : t("Set up to check")} <ArrowRight size={15} /></button></div>}
        </section>
        <section className="panel" aria-labelledby="recent-observations-title">
          <div className="section-heading"><h2 id="recent-observations-title">{t("Field notes")}</h2><span className="section-count">{Math.min(observations.length, 3)}</span></div>
          {observations.length ? <div className="record-list">{observations.slice(0, 3).map(item => <div key={item.id}><span className="observation-context">{farms.find(farm => farm.id === plots.find(plot => plot.id === item.plotId)?.farmId)?.name} / {plots.find(plot => plot.id === item.plotId)?.name}</span><ObservationCard item={item} compact /></div>)}</div> : <div className="record-empty"><p>{t("Keep what you see in the field alongside your model results.")}</p><button className="text-link" type="button" onClick={() => plots.length === 1 ? onNavigate('plot', plots[0].id, 'observation') : plots.length ? onNavigate('farms') : setup()}>{plots.length ? t("Record a field note") : t("Set up your growing areas")} <ArrowRight size={15} /></button></div>}
        </section>
      </div>
    </section>
    <div className="overview-reference"><span><Leaf size={18} />{t(" Need help understanding a result?")}</span><button className="text-link" type="button" onClick={() => onNavigate('guide')}>{t("Open health guide ")}<ArrowRight size={15} /></button></div>
  </div>;
}

export function FarmsView({ uid, data, onNavigate, onNotify, online, initialAction = '' }) {
  const setup = setupProgress(data);
  const [nextStep, setNextStep] = useState(null);
  const [farmForm, setFarmForm] = useState(() => initialAction === 'setup-farm' ? setup.farm ? { ...setup.farm, name: setup.farm.id === 'starter-farm' && setup.farm.name === 'My growing space' ? '' : setup.farm.name } : { name: '', notes: '' } : initialAction === 'add-farm' ? { name: '', notes: '' } : null);
  const [plotForm, setPlotForm] = useState(() => initialAction === 'setup-area' && setup.plot ? { ...setup.plot, name: setup.plot.id === 'starter-plot' && setup.plot.name === 'Pineapple checks' ? '' : setup.plot.name } : ['add-plot', 'setup-area'].includes(initialAction) && setup.farm ? { farmId: setup.farm.id, name: '', variety: '', plantedAt: '', notes: '' } : null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const farmDialog = useDialog(Boolean(farmForm), () => setFarmForm(null));
  const plotDialog = useDialog(Boolean(plotForm), () => setPlotForm(null));
  const activeFarms = newestFirst(data.farms.filter(item => !item.archivedAt));
  const archivedFarms = newestFirst(data.farms.filter(item => item.archivedAt));
  async function submitFarm(event) {
    event.preventDefault();
    if (!farmForm?.name?.trim()) return;
    setBusy(true);
    try {
      const id = farmForm.id || await createFarm(uid, farmForm);
      if (farmForm.id) await updateFarm(uid, id, farmForm);
      if (!farmForm.id || initialAction === 'setup-farm') setNextStep({ kind: 'farm', id });
      onNotify(farmForm.id ? 'Farm updated.' : 'Farm created.');
      setFarmForm(null);
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  async function submitPlot(event) {
    event.preventDefault();
    if (!plotForm?.name?.trim() || !plotForm?.farmId) return;
    setBusy(true);
    try {
      const id = plotForm.id || await createPlot(uid, plotForm);
      if (plotForm.id) await updatePlot(uid, id, plotForm);
      if (!plotForm.id || initialAction.startsWith('setup')) setNextStep({ kind: 'area', id });
      onNotify(plotForm.id ? "Growing area updated." : "Growing area created.");
      setPlotForm(null);
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  async function archive(kind, item) {
    if (!window.confirm(t('Archive {name}? Its history will remain available.', { name: item.name }))) return;
    try {
      if (kind === 'farm') await archiveFarm(uid, item.id);
      else await archivePlot(uid, item.id);
      onNotify(`${kind === 'farm' ? 'Farm' : "Growing area"} archived.`);
    } catch (error) { onNotify(readableError(error), 'error'); }
  }
  return <div className="view farms-view">
    <div className="page-intro"><div><span className="eyebrow">{t("GROWING SPACE")}</span><h1>{t("Farms")}</h1><p>{t("Choose a growing area to check, record a field note, or plan care.")}</p></div><button className="button button-primary" type="button" onClick={() => setFarmForm({ name: '', notes: '' })} disabled={!online}><Plus size={18} />{t(" Add farm")}</button></div>
    <PageHelp><p>{t("A farm is the place you look after. A growing area is a field, section, or batch inside it. Give both a name you will recognize later.")}</p><p>{t("Open a growing area to save photos, write field notes, and add care tasks. Use Archive when an area is no longer in use; its history is kept.")}</p></PageHelp>
    {nextStep && <section className="setup-next" role="status"><div><h2>{nextStep.kind === 'farm' ? t("Farm saved. Add a growing area next.") : t("Growing area saved. You can make your first check.")}</h2><p>{nextStep.kind === 'farm' ? t("This keeps the photos and notes for each field or batch together.") : t("Choose a clear photo and save it to this growing area.")}</p></div><button className="button button-primary" type="button" onClick={() => nextStep.kind === 'farm' ? setPlotForm(data.plots.find(plot => plot.farmId === nextStep.id && plot.id === 'starter-plot' && !plot.archivedAt) || { farmId: nextStep.id, name: '', variety: '', plantedAt: '', notes: '' }) : onNavigate('scan', nextStep.id)}>{nextStep.kind === 'farm' ? t("Add a growing area") : t("Start a check")}<ArrowRight size={17} /></button></section>}
    {activeFarms.length === 0 ? <div className="panel"><EmptyState icon={MapPin} title={t("Start with your first farm")} description={t("A farm can hold one or more pineapple growing areas or batches.")} action={t("Add a farm")} onAction={() => setFarmForm({ name: '', notes: '' })} /></div> : <div className="farm-list">{activeFarms.map(farm => {
      const plots = data.plots.filter(plot => plot.farmId === farm.id && !plot.archivedAt);
      const archivedPlots = data.plots.filter(plot => plot.farmId === farm.id && plot.archivedAt);
      return <section className="panel farm-panel" key={farm.id}>
        <div className="farm-heading"><div className="farm-avatar"><Sprout size={25} strokeWidth={1.5} /></div><div><span className="eyebrow">{plots.length}{t(" ACTIVE GROWING AREA")}{plots.length === 1 ? '' : t("S")}</span><h2>{farm.name}</h2>{farm.notes && <p>{farm.notes}</p>}</div><div className="farm-actions"><button className="button button-soft" type="button" onClick={() => setPlotForm({ farmId: farm.id, name: '', variety: '', plantedAt: '', notes: '' })} disabled={!online}><Plus size={16} />{t(" Add growing area")}</button><button className="icon-button" type="button" onClick={() => setFarmForm({ ...farm })} aria-label={t("Edit {value0}", { value0: farm.name })} disabled={!online}><Settings2 size={18} /></button><button className="icon-button" type="button" onClick={() => archive('farm', farm)} aria-label={t("Archive {value0}", { value0: farm.name })} disabled={!online}><Archive size={18} /></button></div></div>
        {plots.length ? <div className="farm-plots">{plots.map(plot => <div className="farm-plot-row" key={plot.id}><div className="plot-row-icon"><Sprout size={18} /></div><div className="farm-plot-main"><h3>{plot.name}</h3><span>{plot.variety || t("Pineapple")}{plot.plantedAt ? t(" · Planted {value0}", { value0: plot.plantedAt }) : ''}</span></div><div className="farm-plot-actions"><button className="button button-soft" type="button" onClick={() => onNavigate('scan', plot.id)} aria-label={t("Check {value0}", { value0: plot.name })}><ScanLine size={16} />{t(" Check this growing area")}</button><button className="button button-text" type="button" onClick={() => onNavigate('plot', plot.id)} aria-label={t("View {value0}", { value0: plot.name })}>{t("View growing area ")}<ArrowRight size={15} /></button><details className="plot-manage"><summary aria-label={t("Manage {value0}", { value0: plot.name })}>{t("Manage")}</summary><div><button className="text-link" type="button" onClick={() => setPlotForm({ ...plot })} disabled={!online}>{t("Edit growing area")}</button><button className="text-link" type="button" onClick={() => archive('plot', plot)} disabled={!online}>{t("Archive growing area")}</button></div></details></div></div>)}</div> : <div className="inline-empty"><Sprout size={18} />{t(" Add your first growing area to this farm. Then check samples, record field notes, and plan care.")}</div>}
        {archivedPlots.length > 0 && <details className="archive-details"><summary>{archivedPlots.length}{t(" archived growing area")}{archivedPlots.length === 1 ? '' : t("s")}</summary>{archivedPlots.map(plot => <button key={plot.id} className="archived-link" onClick={() => onNavigate('plot', plot.id)}>{plot.name} <ArrowRight size={14} /></button>)}</details>}
      </section>;
    })}</div>}
    {archivedFarms.length > 0 && <section className="archived-section"><button className="button button-text" type="button" onClick={() => setShowArchived(value => !value)}><Archive size={16} /> {showArchived ? t("Hide") : t("Show")}{t(" archived farms (")}{archivedFarms.length})</button>{showArchived && <div className="archive-grid">{archivedFarms.map(farm => <div className="panel archived-farm" key={farm.id}><strong>{farm.name}</strong><span>{t("Archived ")}{dateLabel(farm.archivedAt)}</span>{data.plots.filter(plot => plot.farmId === farm.id).map(plot => <button key={plot.id} className="archived-link" onClick={() => onNavigate('plot', plot.id)}>{plot.name} <ArrowRight size={14} /></button>)}</div>)}</div>}</section>}
    {farmForm && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setFarmForm(null); }}><form ref={farmDialog} className="modal-card" role="dialog" aria-modal="true" tabIndex={-1} onSubmit={submitFarm} aria-label={farmForm.id ? t(initialAction === 'setup-farm' ? 'Name your farm' : 'Edit farm') : t("Add farm")}><span className="eyebrow">{t("FARM DETAILS")}</span><h2>{farmForm.id ? t(initialAction === 'setup-farm' ? 'Name your farm' : 'Edit farm') : t("Add a farm")}</h2><p className="form-purpose">{t("A farm is the place you manage. Use a familiar name so you can find its growing areas later.")}</p><label className="field"><span>{t("Farm name")}</span><input maxLength={80} required value={farmForm.name} onChange={event => setFarmForm({ ...farmForm, name: event.target.value })} placeholder={t("e.g. North Ridge Farm")} /></label><label className="field"><span>{t("Notes ")}<em>{t("(optional)")}</em></span><textarea maxLength={500} value={farmForm.notes || ''} onChange={event => setFarmForm({ ...farmForm, notes: event.target.value })} placeholder={t("Anything useful about this farm")} /></label><div className="modal-actions"><button className="button button-soft" type="button" onClick={() => setFarmForm(null)}>{t("Cancel")}</button><button className="button button-primary" disabled={busy || !online}>{busy ? t("Saving…") : t("Save farm")}</button></div></form></div>}
    {plotForm && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPlotForm(null); }}><form ref={plotDialog} className="modal-card" role="dialog" aria-modal="true" tabIndex={-1} onSubmit={submitPlot} aria-label={plotForm.id ? t(initialAction.startsWith('setup') ? 'Name your growing area' : 'Edit growing area') : t("Add growing area")}><span className="eyebrow">{t("GROWING AREA DETAILS")}</span><h2>{plotForm.id ? t(initialAction.startsWith('setup') ? 'Name your growing area' : 'Edit growing area') : t("Add a growing area")}</h2><label className="field"><span>{t("Farm")}</span><select value={plotForm.farmId} disabled={Boolean(plotForm.id)} onChange={event => setPlotForm({ ...plotForm, farmId: event.target.value })}>{activeFarms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label><p className="form-purpose">{t("Name a field, section, or batch of pineapples. Photos, field notes, and care tasks for this area will stay together.")}</p><label className="field"><span>{t("Growing area or batch name")}</span><input required maxLength={80} value={plotForm.name} onChange={event => setPlotForm({ ...plotForm, name: event.target.value })} placeholder={t("e.g. Batch A, East Field")} /></label><div className="form-two"><label className="field"><span>{t("Variety ")}<em>{t("(optional)")}</em></span><input maxLength={80} value={plotForm.variety || ''} onChange={event => setPlotForm({ ...plotForm, variety: event.target.value })} placeholder={t("Pineapple variety")} /></label><label className="field"><span>{t("Planting date ")}<em>{t("(optional)")}</em></span><input type="date" value={plotForm.plantedAt || ''} onChange={event => setPlotForm({ ...plotForm, plantedAt: event.target.value })} /></label></div><label className="field"><span>{t("Notes ")}<em>{t("(optional)")}</em></span><textarea maxLength={500} value={plotForm.notes || ''} onChange={event => setPlotForm({ ...plotForm, notes: event.target.value })} /></label><div className="modal-actions"><button className="button button-soft" type="button" onClick={() => setPlotForm(null)}>{t("Cancel")}</button><button className="button button-primary" disabled={busy || !online}>{busy ? t("Saving…") : t("Save growing area")}</button></div></form></div>}
  </div>;
}

export function PlotView({ uid, data, plotId, onNavigate, onNotify, online, initialAction = '' }) {
  const plot = data.plots.find(item => item.id === plotId);
  const farm = data.farms.find(item => item.id === plot?.farmId);
  const today = useLocalToday();
  const [noteOpen, setNoteOpen] = useState(initialAction === 'observation' && !plot?.archivedAt && !farm?.archivedAt);
  const [taskOpen, setTaskOpen] = useState(initialAction === 'task' && !plot?.archivedAt && !farm?.archivedAt);
  const [observation, setObservation] = useState({ observedAt: localToday(), condition: 'unsure', note: '' });
  const [task, setTask] = useState({ title: '', dueDate: localToday(), note: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (noteOpen || taskOpen) document.querySelector(`#${noteOpen ? 'plot-observation-form' : 'plot-task-form'} input`)?.focus();
  }, [noteOpen, taskOpen]);
  function closePlotForm(kind) {
    if (kind === 'observation') setNoteOpen(false);
    else setTaskOpen(false);
    document.getElementById(`${kind}-trigger`)?.focus();
  }
  if (!plot) return <div className="view"><EmptyState icon={Sprout} title={t("Growing area not found")} description={t("This growing area may have been removed from your account.")} action={t("View farms")} onAction={() => onNavigate('farms')} /></div>;
  const scans = newestFirst(data.scans.filter(item => item.plotId === plot.id));
  const observations = [...data.observations.filter(item => item.plotId === plot.id)].sort((a, b) => (b.observedAt || '').localeCompare(a.observedAt || '') || timestampMs(b.createdAt) - timestampMs(a.createdAt));
  const tasks = [...data.tasks.filter(item => item.plotId === plot.id)].sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) || a.dueDate.localeCompare(b.dueDate));
  const archived = Boolean(plot.archivedAt || farm?.archivedAt);
  async function submitObservation(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await createObservation(uid, { ...observation, plotId: plot.id });
      setObservation({ observedAt: localToday(), condition: 'unsure', note: '' });
      closePlotForm('observation');
      onNotify("Field note added to this growing area.");
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  async function submitTask(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await createTask(uid, { ...task, plotId: plot.id });
      setTask({ title: '', dueDate: localToday(), note: '' });
      closePlotForm('task');
      onNotify('Care task added.');
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  return <div className="view plot-view">
    <button className="back-link" type="button" onClick={() => onNavigate('farms')}>{t("← Farms & growing areas")}</button>
    <div className="plot-hero"><div className="plot-hero-icon"><Sprout size={30} /></div><div><span className="eyebrow">{farm?.name || t("FARM")}{t(" / GROWING AREA")}</span><h1>{plot.name}</h1><p>{plot.variety || t("Pineapple growing area")}{plot.plantedAt ? t(" · Planted {value0}", { value0: plot.plantedAt }) : ''}{archived ? t(" · Archived") : ''}</p>{plot.notes && <p className="plot-notes">{plot.notes}</p>}</div></div>
    <PageHelp><p>{t("A photo check records one photographed sample. A field note records what you saw yourself, such as yellow leaf tips. A care task records something you plan to do, such as checking the same plants next week.")}</p><p>{t("Save a field note after a visit, add a task for your next visit, and tick the task when it is done. Your growing area keeps these records together.")}</p></PageHelp>
    {!archived && <div className="plot-action-bar" aria-label={t("Growing area actions")}><button className="button button-primary" type="button" onClick={() => onNavigate('scan', plot.id)}><ScanLine size={18} />{t(" Check this growing area")}</button><button id="observation-trigger" className="button button-soft" type="button" aria-expanded={noteOpen} aria-controls="plot-observation-form" disabled={!online} onClick={() => { setNoteOpen(value => !value); setTaskOpen(false); }}><ClipboardList size={17} />{t(" Record field note")}</button><button id="task-trigger" className="button button-soft" type="button" aria-expanded={taskOpen} aria-controls="plot-task-form" disabled={!online} onClick={() => { setTaskOpen(value => !value); setNoteOpen(false); }}><Plus size={17} />{t(" Add care task")}</button></div>}
    {noteOpen && <form id="plot-observation-form" className="inline-form plot-entry-form panel" aria-labelledby="observation-form-title" onSubmit={submitObservation}><div className="section-heading"><h2 id="observation-form-title">{t("Record a field note")}</h2><button className="button button-text" type="button" onClick={() => closePlotForm('observation')}>{t("Cancel")}</button></div><p className="form-purpose">{t("Describe what you saw in this area. For example: Leaf tips are yellow near the path. This is your field note, separate from the photo result.")}</p><div className="form-two"><label className="field"><span>{t("Field note date")}</span><input type="date" required value={observation.observedAt} onChange={event => setObservation({ ...observation, observedAt: event.target.value })} /></label><label className="field"><span>{t("Condition you observed")}</span><select value={observation.condition} onChange={event => setObservation({ ...observation, condition: event.target.value })}><option value="normal">{t("Normal")}</option><option value="concerning">{t("Concerning")}</option><option value="unsure">{t("Unsure")}</option></select></label></div><label className="field"><span>{t("Note")}</span><textarea required maxLength={1000} placeholder={t("What did you notice?")} value={observation.note} onChange={event => setObservation({ ...observation, note: event.target.value })} /></label><button className="button button-primary" disabled={busy || !online}>{busy ? t("Saving…") : t("Save field note")}</button></form>}
    {taskOpen && <form id="plot-task-form" className="inline-form plot-entry-form panel" aria-labelledby="task-form-title" onSubmit={submitTask}><div className="section-heading"><h2 id="task-form-title">{t("Add a care task")}</h2><button className="button button-text" type="button" onClick={() => closePlotForm('task')}>{t("Cancel")}</button></div><p className="form-purpose">{t("Plan one action for your next visit. The due date puts it on Overview when it needs attention. This list does not send phone notifications.")}</p><label className="field"><span>{t("Task")}</span><input required maxLength={100} placeholder={t("e.g. Inspect leaves again")} value={task.title} onChange={event => setTask({ ...task, title: event.target.value })} /></label><label className="field"><span>{t("Due date")}</span><input type="date" required value={task.dueDate} onChange={event => setTask({ ...task, dueDate: event.target.value })} /></label><label className="field"><span>{t("Note ")}<em>{t("(optional)")}</em></span><textarea maxLength={500} value={task.note} onChange={event => setTask({ ...task, note: event.target.value })} /></label><button className="button button-primary" disabled={busy || !online}>{busy ? t("Saving…") : t("Save task")}</button></form>}
    {archived && <div className="callout"><Archive size={18} />{t(" This growing area is archived. Its check and care history remains available.")}</div>}
    <div className="latest-grid">
      <div className="panel latest-card"><span className="eyebrow">{scans[0]?.isPhotoOnly ? t("LATEST SAVED PHOTO") : t("LATEST MODEL RESULT")}</span>{scans.length ? <><div className="latest-result-heading"><h2>{t(scans[0].topClass)}</h2><StatusPill type={scans[0].statusType}>{scans[0].statusLabel || scans[0].statusType}</StatusPill></div><ConditionBadge label={scans[0].topClass} /><p>{dateLabel(scans[0].createdAt)} · {scans[0].isPhotoOnly ? t("Awaiting analysis") : t("{value0} model confidence", { value0: formatConfidence(scans[0].topConfidence) })}</p><span className="quiet-caption">{scans[0].isPhotoOnly ? t("This photo has not been analyzed by the model.") : t("Model confidence describes the prediction, not how severe a condition is.")}</span></> : <div className="latest-empty"><ScanLine size={24} /><strong>{t("No check yet")}</strong><p>{t("Check this growing area to see a model result.")}</p></div>}</div>
      <div className="panel latest-card"><span className="eyebrow">{t("LATEST USER OBSERVATION")}</span>{observations.length ? <><div className="latest-result-heading"><h2>{t(conditionLabel(observations[0].condition))}</h2><StatusPill type={observations[0].condition}>{t(conditionLabel(observations[0].condition))}</StatusPill></div><p>{observations[0].note}</p><span className="quiet-caption">{t("Observed ")}{observations[0].observedAt}</span></> : <div className="latest-empty"><ClipboardList size={24} /><strong>{t("No field note yet")}</strong><p>{t("Add what you see in the field.")}</p></div>}</div>
    </div>
    <div className="plot-sections">
      <section className="panel"><SectionTitle eyebrow={browserWorkspace ? t("PHOTO & SCAN TIMELINE") : t("MODEL TIMELINE")} title={t("Check history")} action={!archived && <button className="button button-soft" onClick={() => onNavigate('scan', plot.id)}><Plus size={16} />{t(" New check")}</button>} />{scans.length ? <div className="record-list">{scans.map(scan => <ScanCard key={scan.id} scan={scan} uid={uid} plots={data.plots} farms={data.farms} onNotify={onNotify} />)}</div> : <EmptyState icon={ScanLine} title={t("No saved checks")} description={t("Future checks for this growing area will appear in date order.")} />}</section>
      <div className="plot-side-sections">
        <section className="panel"><SectionTitle eyebrow={t("FIELD NOTES")} title={t("Field notes")} />{observations.length ? <div className="record-list">{observations.map(item => <ObservationCard key={item.id} item={item} />)}</div> : !noteOpen && <EmptyState icon={ClipboardList} title={t("No field notes")} description={t("Record what you see, separate from the model result.")} />}</section>
        <section className="panel"><SectionTitle eyebrow={t("MAINTENANCE")} title={t("Care tasks")} />{tasks.length ? <div className="task-list">{tasks.map(item => <TaskRow key={item.id} task={item} uid={uid} today={today} onNotify={onNotify} />)}</div> : !taskOpen && <EmptyState icon={ListChecks} title={t("No care tasks")} description={t("Add a one-time task for the next field visit.")} />}</section>
      </div>
    </div>
  </div>;
}

export function ActivityView({ uid, data, onNotify, initialAction = '' }) {
  const { language } = useLanguage();
  const today = useLocalToday();
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(() => ({ ...defaultActivityFilters, type: initialAction === 'tasks' ? 'task' : 'all' }));
  const [visibleCount, setVisibleCount] = useState(50);
  function update(key, value) {
    setFilters(current => changeActivityFilter(current, key, value, data.plots));
    setVisibleCount(50);
    if (key === 'datePreset' && value === 'custom') setShowFilters(true);
  }
  const invalidRange = filters.datePreset === 'custom' && Boolean(filters.from && filters.to && filters.from > filters.to);
  const entries = useMemo(() => buildActivity(data, filters, today), [data, filters, today, language]);
  const page = activityPage(entries, visibleCount);
  const groups = groupActivity(page.entries);
  const total = data.scans.length + data.observations.length + data.tasks.length;
  const plotOptions = data.plots.filter(plot => !filters.farmId || plot.farmId === filters.farmId);
  const dateLabels = { today: 'Today', '7': 'Last 7 days', '30': 'Last 30 days', custom: 'Custom range' };
  const activeFilters = [
    filters.search.trim() && t('Search: {query}', { query: filters.search.trim() }),
    filters.type !== 'all' && t(({ scan: "Photo checks", observation: "Field notes", task: 'Care tasks' })[filters.type]),
    dateLabels[filters.datePreset] && (filters.datePreset === 'custom' ? `${filters.from || t('Any start')} → ${filters.to || t('Any end')}` : t(dateLabels[filters.datePreset])),
    filters.farmId && data.farms.find(farm => farm.id === filters.farmId)?.name,
    filters.plotId && data.plots.find(plot => plot.id === filters.plotId)?.name,
    filters.type !== 'all' && filters.status !== 'all' && t(activityStatusOptions[filters.type]?.find(item => item[0] === filters.status)?.[1])
  ].filter(Boolean);
  const hasFilters = activeFilters.length > 0;
  const reset = () => { setFilters(defaultActivityFilters); setVisibleCount(50); };
  return <div className="view activity-view">
    <div className="page-intro"><div><span className="eyebrow">{t("FIELD RECORDS")}</span><h1>{t("History")}</h1><p>{t("Review earlier photos, results, field notes, and care tasks. Search or filter to find a particular visit.")}</p></div><span className="activity-total">{total}{t(" record")}{total === 1 ? '' : t("s")}</span></div>
    <PageHelp><p>{t("Start with a name, condition, or word from a note in Search. Choose a record type or date to narrow the list. Clear filters to see all your records again.")}</p><p>{t("Open View details on a photo record to see the photo and explanation. Tick a care task only after you have completed the work.")}</p></PageHelp>
    <section className="panel activity-filters" aria-label={t("Filter activity")}>
      <div className="activity-filter-top"><label className="search-field"><Search size={18} /><input value={filters.search} onChange={event => update('search', event.target.value)} placeholder={t("Search conditions, notes, tasks, or growing areas")} aria-label={t("Search all activity")} /></label><label className="field"><span>{t("Record type")}</span><select value={filters.type} onChange={event => update('type', event.target.value)}><option value="all">{t("All records")}</option><option value="scan">{t("Photo checks")}</option><option value="observation">{t("Field notes")}</option><option value="task">{t("Care tasks")}</option></select></label><label className="field"><span>{t("Date")}</span><select value={filters.datePreset} onChange={event => update('datePreset', event.target.value)}><option value="all">{t("All dates")}</option><option value="today">{t("Today")}</option><option value="7">{t("Last 7 days")}</option><option value="30">{t("Last 30 days")}</option><option value="custom">{t("Custom range")}</option></select></label></div>
      {filters.type !== 'all' && <label className="field activity-status-filter"><span>{filters.type === 'scan' ? t("Check result") : filters.type === 'observation' ? t("Field note condition") : t("Task status")}</span><select value={filters.status} onChange={event => update('status', event.target.value)}><option value="all">{t("Any status")}</option>{activityStatusOptions[filters.type].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>}
      <button className="mobile-filter-toggle text-link" type="button" aria-expanded={showFilters} aria-controls="activity-extra-filters" onClick={() => setShowFilters(value => !value)}><Settings2 size={15} />{showFilters ? t("Hide filters") : t("Farm & growing area filters")}</button>
      <div id="activity-extra-filters" className={`activity-filter-fields ${showFilters ? 'filters-open' : ''}`}>
        <label className="field"><span>{t("Farm")}</span><select value={filters.farmId} onChange={event => update('farmId', event.target.value)}><option value="">{t("All farms")}</option>{data.farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}{farm.archivedAt ? t(" (archived)") : ''}</option>)}</select></label>
        <label className="field"><span>{t("Growing area")}</span><select value={filters.plotId} onChange={event => update('plotId', event.target.value)}><option value="">{t("All growing areas")}</option>{plotOptions.map(plot => <option key={plot.id} value={plot.id}>{plot.name}{plot.archivedAt ? t(" (archived)") : ''}</option>)}</select></label>
        {filters.datePreset === 'custom' && <><label className="field"><span>{t("From date")}</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={event => update('from', event.target.value)} /></label><label className="field"><span>{t("To date")}</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={event => update('to', event.target.value)} /></label></>}
      </div>
      <div className="activity-filter-footer"><p>{t("Today first · Upcoming dates nearest first · Past dates newest first")}</p>{hasFilters && <button className="text-link" type="button" onClick={reset}>{t("Clear filters")}</button>}</div>
      {hasFilters && <ul className="active-filter-list" aria-label={t("Active filters")}>{activeFilters.map((label, index) => <li key={index}>{label}</li>)}</ul>}
      {invalidRange && <p className="inline-error" role="alert">{t("The from date must be on or before the to date.")}</p>}
    </section>
    <div className="activity-results-heading"><h2>{t("Timeline")}</h2><span role="status">{entries.length}{t(" of ")}{total}{t(" matching")}{page.remaining > 0 && t(" · Showing {value0}", { value0: page.entries.length })}</span></div>
    {!invalidRange && groups.length ? <div className="activity-timeline">{groups.map(group => <section className="activity-day" key={group.date || 'undated'} aria-label={group.date || t("Date unavailable")}>
      <div className="activity-date-heading"><span className="timeline-dot" /><h3>{group.date === today ? t("Today · ") : group.date > today ? t("Upcoming · ") : ''}{group.date ? dateLabel(`${group.date}T12:00:00`, { month: 'long', day: 'numeric', year: 'numeric' }) : t("Date unavailable")}</h3><span>{group.entries.length}</span></div>
      <div className="activity-day-records">{group.entries.map(entry => <div className="activity-entry" key={entry.key}>
        <div className="activity-entry-label"><span className={`record-type record-${entry.type}`}>{entry.type === 'scan' ? <ScanLine size={14} /> : entry.type === 'task' ? <ListChecks size={14} /> : <ClipboardList size={14} />}{entry.type === 'scan' ? t("Check") : entry.type === 'task' ? t("Care task · Due date") : t("Field note")}</span><span className="record-context">{entry.farm?.name || t("Unassigned farm")} / {entry.plot?.name || t("Unassigned growing area")}{entry.archived && <span className="record-tag">{t("Archived")}</span>}{!entry.plot && <span className="record-tag">{t("Unassigned")}</span>}</span></div>
        {entry.type === 'scan' ? <ScanCard scan={entry.record} uid={uid} plots={data.plots} farms={data.farms} onNotify={onNotify} /> : entry.type === 'observation' ? <ObservationCard item={entry.record} /> : <TaskRow task={entry.record} uid={uid} today={today} onNotify={onNotify} />}
      </div>)}</div>
    </section>)}{page.remaining > 0 && <button className="button button-soft load-more" type="button" onClick={() => setVisibleCount(count => count + 50)}>{t("Load more · ")}{page.remaining}{t(" remaining")}</button>}</div> : !invalidRange && <section className="panel"><EmptyState icon={FileClock} title={hasFilters ? t("No matching activity") : t("Your timeline starts here")} description={hasFilters ? t("Try another search or clear the filters to see all records.") : t("Saved checks, growing area field notes, and care tasks will appear here.")} action={hasFilters ? t("Clear filters") : undefined} onAction={reset} /></section>}
  </div>;
}

export function ResearchView({ researcher, onNotify }) {
  const services = useWorkspaceServices();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [csv, setCsv] = useState('');
  useEffect(() => {
    if (!researcher || !services.sharing) return undefined;
    return onSnapshot(collection(db, 'researchResults'), snapshot => {
      setResults(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setLoading(false);
      setError('');
    }, issue => { setLoading(false); setError(readableError(issue)); });
  }, [researcher, services.sharing]);
  function exportCsv() {
    const content = buildResearchCsv(results);
    setCsv(content);
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agri-vision-research-results.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotify('CSV ready. You can also copy the text below if the download does not appear.');
  }
  if (!services.sharing) return <div className="view"><EmptyState icon={FlaskConical} title={t("Research sharing is temporarily unavailable")} description={t("Your farm records remain private. Check workspace availability and try again.")} /></div>;
  if (!researcher) return <div className="view"><EmptyState icon={LockKeyhole} title={t("Research access required")} description={t("The project owner grants researcher access to approved accounts.")} /></div>;
  return <div className="view"><div className="page-intro"><div><span className="eyebrow">{t("APPROVED RESEARCH ACCESS")}</span><h1>{t("Research results")}</h1><p>{t("Contributed prediction fields only. Private photos and account records are not available here.")}</p></div><button className="button button-primary" type="button" onClick={exportCsv} disabled={!results.length}><Download size={17} />{t(" Export CSV")}</button></div><div className="panel research-panel"><SectionTitle eyebrow={t("CONTRIBUTED DATA")} title={t("{value0} shared result{value1}", { value0: results.length, value1: results.length === 1 ? '' : 's' })} />{error && <div className="inline-error" role="alert">{t(error)}</div>}{loading ? <div className="quiet-empty">{t("Loading contributed results…")}</div> : results.length ? <div className="table-scroll"><table className="research-table"><thead><tr><th>{t("Month")}</th><th>{t("Status")}</th><th>{t("Top class")}</th><th>{t("Confidence")}</th><th>{t("Detections")}</th><th>{t("Model")}</th><th>{t("User field note")}</th></tr></thead><tbody>{[...results].sort((a, b) => (b.month || '').localeCompare(a.month || '')).map(result => <tr key={result.id}><td>{result.month || '—'}</td><td><StatusPill type={result.statusType}>{result.statusType || t("monitor")}</StatusPill></td><td>{result.topClass || '—'}</td><td>{formatConfidence(result.topConfidence)}</td><td>{result.detectionCount ?? 0}</td><td>{result.modelVersion || '—'}</td><td>{t(conditionLabel(result.userCondition))}</td></tr>)}</tbody></table></div> : <EmptyState icon={FlaskConical} title={t("No results shared yet")} description={t("Results appear here when a grower chooses to share a check.")} />}</div>{csv && <section className="panel research-export" aria-label={t("Research CSV preview")}><SectionTitle eyebrow={t("EXPORT")} title={t("Your CSV is ready")} action={<button className="button button-soft" type="button" onClick={() => setCsv('')}>{t("Close preview")}</button>} /><p>{t("Copy the text below if the downloaded file does not appear.")}</p><label className="field"><span>{t("CSV data")}</span><textarea readOnly rows={6} value={csv} onFocus={event => event.target.select()} /></label></section>}</div>;
}

export function SettingsView({ user, data, themePreference, setThemePreference, researcher, refreshResearcher, onNotify, online }) {
  const services = useWorkspaceServices();
  const [history, setHistory] = useState(getLegacyHistory);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function importHistory() {
    if (!history.length || data.profile?.historyImportedAt) return;
    if (!window.confirm(t('Import {count} summaries from this browser into this account? They will have no assigned growing area or photos.', { count: history.length }))) return;
    setImporting(true);
    try {
      await importLegacyHistory(user.uid, history);
      localStorage.removeItem('agriVisionBackendHistory');
      setHistory([]);
      onNotify("Browser history imported as unassigned checks.");
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setImporting(false); }
  }
  async function removeAccount(event) {
    event.preventDefault();
    if (!services.deletion || confirmation !== 'DELETE' || !password) return;
    setDeleting(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      await user.getIdToken(true);
      await deleteAccount();
      await signOut(auth);
      onNotify('Your account and saved data were deleted.');
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setDeleting(false); }
  }
  return <div className="view settings-view"><div className="page-intro"><div><span className="eyebrow">{t("YOUR WORKSPACE")}</span><h1>{t("Settings")}</h1><p>{t("Manage appearance, optional advice, and your account.")}</p></div></div><section aria-label={t("Preferences")}><SectionTitle title={t("Preferences")} /><div className="settings-grid preferences-grid"><LanguageSettings />
    <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><Leaf size={20} /></div><div><h2>{t("Appearance")}</h2><p>{t("Use the look that feels right in the field.")}</p></div></div><div className="theme-options" role="group" aria-label={t("Color theme")}><button className={themePreference === 'system' ? 'selected' : ''} type="button" aria-pressed={themePreference === 'system'} onClick={() => setThemePreference('system')}>{t("Device setting")}</button><button className={themePreference === 'light' ? 'selected' : ''} type="button" aria-pressed={themePreference === 'light'} onClick={() => setThemePreference('light')}>{t("Light")}</button><button className={themePreference === 'dark' ? 'selected' : ''} type="button" aria-pressed={themePreference === 'dark'} onClick={() => setThemePreference('dark')}>{t("Dark")}</button></div></section>
    <RecommendationPreference uid={user.uid} />
  </div></section><section aria-label={t("Account and data")}><SectionTitle title={t("Account & data")} /><div className="settings-grid">
    <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><ShieldCheck size={20} /></div><div><h2>{t("Your account")}</h2><p>{t("Signed in as ")}<strong>{user.email}</strong></p></div></div><button className="button button-soft" type="button" onClick={() => signOut(auth)}>{t("Sign out")}</button></section>
    <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><FileClock size={20} /></div><div><h2>{t("Old browser history")}</h2><p>{t("Import up to 12 summaries from the previous version of AGRI-VISION.")}</p></div></div>{data.profile?.historyImportedAt ? <div className="callout subtle"><CheckCircle2 size={17} />{t(" This account already imported browser history.")}</div> : history.length ? <><p className="settings-detail">{history.length}{t(" summaries found in this browser. They will start as unassigned checks without photos.")}</p><button className="button button-soft" type="button" disabled={importing || !online} onClick={importHistory}>{importing ? t("Importing…") : t("Import {value0} checks", { value0: history.length })}</button></> : <div className="callout subtle"><FileClock size={17} />{t(" No previous check summaries found in this browser.")}</div>}</section>
    <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><FlaskConical size={20} /></div><div><h2>{t("Research access")}</h2><p>{researcher ? t("This account can view contributed results.") : t("The project owner may grant researcher access to approved accounts.")}</p></div></div><button className="button button-soft" type="button" disabled={!services.sharing} onClick={refreshResearcher}><RefreshCw size={16} />{t(" Refresh access")}</button></section>
    <section className="panel settings-card danger-card"><div className="settings-card-head"><div className="settings-icon danger-icon"><Trash2 size={20} /></div><div><h2>{t("Delete account")}</h2><p>{t("Remove this account, its farms, growing areas, checks, photos, tasks, and shared research copies.")}</p></div></div>{services.deletion ? <form onSubmit={removeAccount}><label className="field"><span>{t("Confirm your password")}</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label><label className="field"><span>{t("Type DELETE to confirm")}</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label><button className="button button-danger" disabled={deleting || !online || confirmation !== 'DELETE' || !password}>{deleting ? t("Deleting…") : t("Delete my account")}</button></form> : <div className="callout subtle"><ShieldCheck size={17} />{t(" Secure account removal is temporarily unavailable. Start the local workspace and check availability before removing your account.")}</div>}</section>
  </div></section></div>;
}
