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
  const setup = () => onNavigate('farms', '', farms.length ? 'add-plot' : 'add-farm');
  return <div className="view dashboard-view">
    <div className="page-intro overview-heading"><div><span className="eyebrow">YOUR GROWING SPACE</span><h1>Good care starts here.</h1><p>Hello, {greeting.split(' ')[0]}. Here’s what needs your attention.</p></div><button className="button button-primary" type="button" onClick={plots.length ? () => onNavigate('scan') : setup}>{plots.length ? <ScanLine size={18} /> : <Plus size={18} />}{plots.length ? 'Start a scan' : farms.length ? 'Add your first plot' : 'Add your first farm'}</button></div>
    <div className="stats-grid" aria-label="Workspace summary">
      <div className="stat-card"><MapPin size={18} /><strong>{farms.length}</strong><span>Active farms</span></div>
      <div className="stat-card"><Sprout size={18} /><strong>{plots.length}</strong><span>Tracked plots</span></div>
      <div className="stat-card"><ScanLine size={18} /><strong>{scans.length}</strong><span>{browserWorkspace ? 'Saved scans & photos' : 'Saved scans'}</span></div>
      <div className="stat-card"><CalendarDays size={18} /><strong>{due.length}</strong><span>Tasks due</span></div>
    </div>
    {!plots.length && <section className="setup-strip" aria-label="Set up your field journal"><div><h2>{farms.length ? 'Your farm is ready. Add a plot next.' : 'Start your field journal'}</h2><p>Organize your growing space, then save scans and observations to each plot.</p></div><ol className="setup-steps"><li className={farms.length ? 'is-complete' : 'is-current'}><span>{farms.length ? <CheckCircle2 size={15} /> : '1'}</span>Add farm</li><li className={farms.length ? 'is-current' : ''}><span>2</span>Add plot</li><li><span>3</span>Start monitoring</li></ol></section>}
    <div className="overview-workspace">
      <section className="panel overview-care" aria-labelledby="overview-care-title"><div className="section-heading"><div><span className="eyebrow">NEXT ACTIONS</span><h2 id="overview-care-title">Care tasks</h2><p className="section-description">Due today and overdue.</p></div><span className="section-count">{due.length}</span></div>{due.length ? <div className="task-list">{due.slice(0, 3).map(task => <TaskRow key={task.id} task={task} uid={user.uid} today={today} plotName={plots.find(plot => plot.id === task.plotId)?.name} onNotify={onNotify} />)}</div> : <div className="care-clear"><CheckCircle2 size={22} /><div><strong>No tasks due</strong><p>Plan your next field visit from a plot.</p></div></div>}<button className="text-link care-view-link" type="button" onClick={() => onNavigate('activity', '', 'tasks')}>View care tasks <ArrowRight size={15} /></button></section>
      <section className="panel overview-plots" aria-labelledby="overview-plots-title"><div className="section-heading"><div><span className="eyebrow">GROWING SPACE</span><h2 id="overview-plots-title">Your plots</h2><p className="section-description">Open a plot to record observations and plan care.</p></div><button className="text-link" type="button" onClick={() => onNavigate('farms')}>Manage farms <ArrowRight size={15} /></button></div>
        {plots.length ? <div className="overview-plot-list">{plots.slice(0, 4).map(plot => {
          const plotScans = scans.filter(item => item.plotId === plot.id);
          const farm = farms.find(item => item.id === plot.farmId);
          const latest = plotScans[0];
          return <article className="overview-plot" key={plot.id}><div className="plot-row-icon"><Sprout size={20} /></div><div className="overview-plot-info"><span>{farm?.name || 'Farm'}</span><h3>{plot.name}</h3><p>{latest ? <><StatusPill type={latest.statusType}>{latest.statusLabel || latest.topClass}</StatusPill><span>Latest scan · {dateLabel(latest.createdAt)}</span></> : 'No scans yet'}</p></div><div className="overview-plot-actions"><button className="button button-soft" type="button" onClick={() => onNavigate('scan', plot.id)} aria-label={`Scan ${plot.name}`}><ScanLine size={16} /> Scan</button><button className="text-link" type="button" onClick={() => onNavigate('plot', plot.id)} aria-label={`View ${plot.name}`}>View plot <ArrowRight size={14} /></button></div></article>;
        })}{plots.length > 4 && <button className="text-link all-plots-link" type="button" onClick={() => onNavigate('farms')}>View all {plots.length} plots <ArrowRight size={15} /></button>}</div> : <EmptyState icon={Sprout} title={farms.length ? 'Add your first plot' : 'Create your growing space'} description={farms.length ? 'A plot can be a field, planting area, or batch of pineapples.' : 'Add a farm, then a plot, to keep every plant check in the right place.'} action={farms.length ? 'Add plot' : 'Add farm'} onAction={setup} />}
      </section>
    </div>
    <section className="recent-records" aria-labelledby="recent-records-title">
      <div className="section-heading">
        <div><span className="eyebrow">PAST RECORDS</span><h2 id="recent-records-title">Recent records</h2><p className="section-description">Review saved scans and field observations.</p></div>
        <button className="text-link" type="button" onClick={() => onNavigate('activity')}>All activity <ArrowRight size={15} /></button>
      </div>
      <div className="recent-records-grid">
        <section className="panel" aria-labelledby="recent-scans-title">
          <div className="section-heading"><h2 id="recent-scans-title">Scans</h2><span className="section-count">{recentScans.length}</span></div>
          {recentScans.length ? <div className="record-list">{recentScans.map(scan => <ScanCard key={scan.id} scan={scan} uid={user.uid} plots={data.plots} farms={data.farms} onNotify={onNotify} compact />)}</div> : <div className="record-empty"><p>Your saved model results will appear here.</p><button className="text-link" type="button" onClick={plots.length ? () => onNavigate('scan') : setup}>{plots.length ? 'Start your first scan' : 'Set up to scan'} <ArrowRight size={15} /></button></div>}
        </section>
        <section className="panel" aria-labelledby="recent-observations-title">
          <div className="section-heading"><h2 id="recent-observations-title">Observations</h2><span className="section-count">{Math.min(observations.length, 3)}</span></div>
          {observations.length ? <div className="record-list">{observations.slice(0, 3).map(item => <div key={item.id}><span className="observation-context">{farms.find(farm => farm.id === plots.find(plot => plot.id === item.plotId)?.farmId)?.name} / {plots.find(plot => plot.id === item.plotId)?.name}</span><ObservationCard item={item} compact /></div>)}</div> : <div className="record-empty"><p>Keep what you see in the field alongside your model results.</p><button className="text-link" type="button" onClick={() => plots.length ? onNavigate('plot', plots[0].id, 'observation') : setup()}>{plots.length ? 'Record an observation' : 'Set up your plots'} <ArrowRight size={15} /></button></div>}
        </section>
      </div>
    </section>
    <div className="overview-reference"><span><Leaf size={18} /> Need help understanding a result?</span><button className="text-link" type="button" onClick={() => onNavigate('guide')}>Open health guide <ArrowRight size={15} /></button></div>
  </div>;
}

export function FarmsView({ uid, data, onNavigate, onNotify, online, initialAction = '' }) {
  const [farmForm, setFarmForm] = useState(() => initialAction === 'add-farm' ? { name: '', notes: '' } : null);
  const [plotForm, setPlotForm] = useState(() => initialAction === 'add-plot' && data.farms.some(farm => !farm.archivedAt) ? { farmId: data.farms.find(farm => !farm.archivedAt).id, name: '', variety: '', plantedAt: '', notes: '' } : null);
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
      if (farmForm.id) await updateFarm(uid, farmForm.id, farmForm);
      else await createFarm(uid, farmForm);
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
      if (plotForm.id) await updatePlot(uid, plotForm.id, plotForm);
      else await createPlot(uid, plotForm);
      onNotify(plotForm.id ? 'Plot updated.' : 'Plot created.');
      setPlotForm(null);
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  async function archive(kind, item) {
    if (!window.confirm(`Archive ${item.name}? Its history will remain available.`)) return;
    try {
      if (kind === 'farm') await archiveFarm(uid, item.id);
      else await archivePlot(uid, item.id);
      onNotify(`${kind === 'farm' ? 'Farm' : 'Plot'} archived.`);
    } catch (error) { onNotify(readableError(error), 'error'); }
  }
  return <div className="view farms-view">
    <div className="page-intro"><div><span className="eyebrow">GROWING SPACE</span><h1>Farms</h1><p>Choose a plot to scan, record an observation, or plan care.</p></div><button className="button button-primary" type="button" onClick={() => setFarmForm({ name: '', notes: '' })} disabled={!online}><Plus size={18} /> Add farm</button></div>
    {activeFarms.length === 0 ? <div className="panel"><EmptyState icon={MapPin} title="Start with your first farm" description="A farm can hold one or more pineapple plots or batches." action="Add a farm" onAction={() => setFarmForm({ name: '', notes: '' })} /></div> : <div className="farm-list">{activeFarms.map(farm => {
      const plots = data.plots.filter(plot => plot.farmId === farm.id && !plot.archivedAt);
      const archivedPlots = data.plots.filter(plot => plot.farmId === farm.id && plot.archivedAt);
      return <section className="panel farm-panel" key={farm.id}>
        <div className="farm-heading"><div className="farm-avatar"><Sprout size={25} strokeWidth={1.5} /></div><div><span className="eyebrow">{plots.length} ACTIVE PLOT{plots.length === 1 ? '' : 'S'}</span><h2>{farm.name}</h2>{farm.notes && <p>{farm.notes}</p>}</div><div className="farm-actions"><button className="button button-soft" type="button" onClick={() => setPlotForm({ farmId: farm.id, name: '', variety: '', plantedAt: '', notes: '' })} disabled={!online}><Plus size={16} /> Add plot</button><button className="icon-button" type="button" onClick={() => setFarmForm({ ...farm })} aria-label={`Edit ${farm.name}`} disabled={!online}><Settings2 size={18} /></button><button className="icon-button" type="button" onClick={() => archive('farm', farm)} aria-label={`Archive ${farm.name}`} disabled={!online}><Archive size={18} /></button></div></div>
        {plots.length ? <div className="farm-plots">{plots.map(plot => <div className="farm-plot-row" key={plot.id}><div className="plot-row-icon"><Sprout size={18} /></div><div className="farm-plot-main"><h3>{plot.name}</h3><span>{plot.variety || 'Pineapple'}{plot.plantedAt ? ` · Planted ${plot.plantedAt}` : ''}</span></div><div className="farm-plot-actions"><button className="button button-soft" type="button" onClick={() => onNavigate('scan', plot.id)} aria-label={`Scan ${plot.name}`}><ScanLine size={16} /> Scan this plot</button><button className="button button-text" type="button" onClick={() => onNavigate('plot', plot.id)} aria-label={`View ${plot.name}`}>View plot <ArrowRight size={15} /></button><details className="plot-manage"><summary aria-label={`Manage ${plot.name}`}>Manage</summary><div><button className="text-link" type="button" onClick={() => setPlotForm({ ...plot })} disabled={!online}>Edit plot</button><button className="text-link" type="button" onClick={() => archive('plot', plot)} disabled={!online}>Archive plot</button></div></details></div></div>)}</div> : <div className="inline-empty"><Sprout size={18} /> Add your first plot to this farm. Then scan samples, record observations, and plan care.</div>}
        {archivedPlots.length > 0 && <details className="archive-details"><summary>{archivedPlots.length} archived plot{archivedPlots.length === 1 ? '' : 's'}</summary>{archivedPlots.map(plot => <button key={plot.id} className="archived-link" onClick={() => onNavigate('plot', plot.id)}>{plot.name} <ArrowRight size={14} /></button>)}</details>}
      </section>;
    })}</div>}
    {archivedFarms.length > 0 && <section className="archived-section"><button className="button button-text" type="button" onClick={() => setShowArchived(value => !value)}><Archive size={16} /> {showArchived ? 'Hide' : 'Show'} archived farms ({archivedFarms.length})</button>{showArchived && <div className="archive-grid">{archivedFarms.map(farm => <div className="panel archived-farm" key={farm.id}><strong>{farm.name}</strong><span>Archived {dateLabel(farm.archivedAt)}</span>{data.plots.filter(plot => plot.farmId === farm.id).map(plot => <button key={plot.id} className="archived-link" onClick={() => onNavigate('plot', plot.id)}>{plot.name} <ArrowRight size={14} /></button>)}</div>)}</div>}</section>}
    {farmForm && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setFarmForm(null); }}><form ref={farmDialog} className="modal-card" role="dialog" aria-modal="true" tabIndex={-1} onSubmit={submitFarm} aria-label={farmForm.id ? 'Edit farm' : 'Add farm'}><span className="eyebrow">FARM DETAILS</span><h2>{farmForm.id ? 'Edit farm' : 'Add a farm'}</h2><label className="field"><span>Farm name</span><input maxLength={80} required value={farmForm.name} onChange={event => setFarmForm({ ...farmForm, name: event.target.value })} placeholder="e.g. North Ridge Farm" /></label><label className="field"><span>Notes <em>(optional)</em></span><textarea maxLength={500} value={farmForm.notes || ''} onChange={event => setFarmForm({ ...farmForm, notes: event.target.value })} placeholder="Anything useful about this farm" /></label><div className="modal-actions"><button className="button button-soft" type="button" onClick={() => setFarmForm(null)}>Cancel</button><button className="button button-primary" disabled={busy || !online}>{busy ? 'Saving…' : 'Save farm'}</button></div></form></div>}
    {plotForm && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPlotForm(null); }}><form ref={plotDialog} className="modal-card" role="dialog" aria-modal="true" tabIndex={-1} onSubmit={submitPlot} aria-label={plotForm.id ? 'Edit plot' : 'Add plot'}><span className="eyebrow">PLOT DETAILS</span><h2>{plotForm.id ? 'Edit plot' : 'Add a plot'}</h2><label className="field"><span>Farm</span><select value={plotForm.farmId} disabled={Boolean(plotForm.id)} onChange={event => setPlotForm({ ...plotForm, farmId: event.target.value })}>{activeFarms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label><label className="field"><span>Plot or batch name</span><input required maxLength={80} value={plotForm.name} onChange={event => setPlotForm({ ...plotForm, name: event.target.value })} placeholder="e.g. Batch A, East Field" /></label><div className="form-two"><label className="field"><span>Variety <em>(optional)</em></span><input maxLength={80} value={plotForm.variety || ''} onChange={event => setPlotForm({ ...plotForm, variety: event.target.value })} placeholder="Pineapple variety" /></label><label className="field"><span>Planting date <em>(optional)</em></span><input type="date" value={plotForm.plantedAt || ''} onChange={event => setPlotForm({ ...plotForm, plantedAt: event.target.value })} /></label></div><label className="field"><span>Notes <em>(optional)</em></span><textarea maxLength={500} value={plotForm.notes || ''} onChange={event => setPlotForm({ ...plotForm, notes: event.target.value })} /></label><div className="modal-actions"><button className="button button-soft" type="button" onClick={() => setPlotForm(null)}>Cancel</button><button className="button button-primary" disabled={busy || !online}>{busy ? 'Saving…' : 'Save plot'}</button></div></form></div>}
  </div>;
}

export function PlotView({ uid, data, plotId, onNavigate, onNotify, online, initialAction = '' }) {
  const plot = data.plots.find(item => item.id === plotId);
  const farm = data.farms.find(item => item.id === plot?.farmId);
  const today = useLocalToday();
  const [noteOpen, setNoteOpen] = useState(initialAction === 'observation' && !plot?.archivedAt && !farm?.archivedAt);
  const [taskOpen, setTaskOpen] = useState(false);
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
  if (!plot) return <div className="view"><EmptyState icon={Sprout} title="Plot not found" description="This plot may have been removed from your account." action="View farms" onAction={() => onNavigate('farms')} /></div>;
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
      onNotify('Observation added to this plot.');
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
    <button className="back-link" type="button" onClick={() => onNavigate('farms')}>← Farms & plots</button>
    <div className="plot-hero"><div className="plot-hero-icon"><Sprout size={30} /></div><div><span className="eyebrow">{farm?.name || 'FARM'} / PLOT</span><h1>{plot.name}</h1><p>{plot.variety || 'Pineapple plot'}{plot.plantedAt ? ` · Planted ${plot.plantedAt}` : ''}{archived ? ' · Archived' : ''}</p>{plot.notes && <p className="plot-notes">{plot.notes}</p>}</div></div>
    {!archived && <div className="plot-action-bar" aria-label="Plot actions"><button className="button button-primary" type="button" onClick={() => onNavigate('scan', plot.id)}><ScanLine size={18} /> Scan this plot</button><button id="observation-trigger" className="button button-soft" type="button" aria-expanded={noteOpen} aria-controls="plot-observation-form" disabled={!online} onClick={() => { setNoteOpen(value => !value); setTaskOpen(false); }}><ClipboardList size={17} /> Record observation</button><button id="task-trigger" className="button button-soft" type="button" aria-expanded={taskOpen} aria-controls="plot-task-form" disabled={!online} onClick={() => { setTaskOpen(value => !value); setNoteOpen(false); }}><Plus size={17} /> Add care task</button></div>}
    {noteOpen && <form id="plot-observation-form" className="inline-form plot-entry-form panel" aria-labelledby="observation-form-title" onSubmit={submitObservation}><div className="section-heading"><h2 id="observation-form-title">Record an observation</h2><button className="button button-text" type="button" onClick={() => closePlotForm('observation')}>Cancel</button></div><div className="form-two"><label className="field"><span>Observation date</span><input type="date" required value={observation.observedAt} onChange={event => setObservation({ ...observation, observedAt: event.target.value })} /></label><label className="field"><span>Condition you observed</span><select value={observation.condition} onChange={event => setObservation({ ...observation, condition: event.target.value })}><option value="normal">Normal</option><option value="concerning">Concerning</option><option value="unsure">Unsure</option></select></label></div><label className="field"><span>Note</span><textarea required maxLength={1000} placeholder="What did you notice?" value={observation.note} onChange={event => setObservation({ ...observation, note: event.target.value })} /></label><button className="button button-primary" disabled={busy || !online}>{busy ? 'Saving…' : 'Save observation'}</button></form>}
    {taskOpen && <form id="plot-task-form" className="inline-form plot-entry-form panel" aria-labelledby="task-form-title" onSubmit={submitTask}><div className="section-heading"><h2 id="task-form-title">Add a care task</h2><button className="button button-text" type="button" onClick={() => closePlotForm('task')}>Cancel</button></div><label className="field"><span>Task</span><input required maxLength={100} placeholder="e.g. Inspect leaves again" value={task.title} onChange={event => setTask({ ...task, title: event.target.value })} /></label><label className="field"><span>Due date</span><input type="date" required value={task.dueDate} onChange={event => setTask({ ...task, dueDate: event.target.value })} /></label><label className="field"><span>Note <em>(optional)</em></span><textarea maxLength={500} value={task.note} onChange={event => setTask({ ...task, note: event.target.value })} /></label><button className="button button-primary" disabled={busy || !online}>{busy ? 'Saving…' : 'Save task'}</button></form>}
    {archived && <div className="callout"><Archive size={18} /> This plot is archived. Its scan and care history remains available.</div>}
    <div className="latest-grid">
      <div className="panel latest-card"><span className="eyebrow">{scans[0]?.isPhotoOnly ? 'LATEST SAVED PHOTO' : 'LATEST MODEL RESULT'}</span>{scans.length ? <><div className="latest-result-heading"><h2>{scans[0].topClass}</h2><StatusPill type={scans[0].statusType}>{scans[0].statusLabel || scans[0].statusType}</StatusPill></div><ConditionBadge label={scans[0].topClass} /><p>{dateLabel(scans[0].createdAt)} · {scans[0].isPhotoOnly ? 'Awaiting analysis' : `${formatConfidence(scans[0].topConfidence)} model confidence`}</p><span className="quiet-caption">{scans[0].isPhotoOnly ? 'This photo has not been analyzed by the model.' : 'Model confidence describes the prediction, not how severe a condition is.'}</span></> : <div className="latest-empty"><ScanLine size={24} /><strong>No scan yet</strong><p>Scan this plot to see a model result.</p></div>}</div>
      <div className="panel latest-card"><span className="eyebrow">LATEST USER OBSERVATION</span>{observations.length ? <><div className="latest-result-heading"><h2>{conditionLabel(observations[0].condition)}</h2><StatusPill type={observations[0].condition}>{conditionLabel(observations[0].condition)}</StatusPill></div><p>{observations[0].note}</p><span className="quiet-caption">Observed {observations[0].observedAt}</span></> : <div className="latest-empty"><ClipboardList size={24} /><strong>No observation yet</strong><p>Add what you see in the field.</p></div>}</div>
    </div>
    <div className="plot-sections">
      <section className="panel"><SectionTitle eyebrow={browserWorkspace ? "PHOTO & SCAN TIMELINE" : "MODEL TIMELINE"} title="Scan history" action={!archived && <button className="button button-soft" onClick={() => onNavigate('scan', plot.id)}><Plus size={16} /> New scan</button>} />{scans.length ? <div className="record-list">{scans.map(scan => <ScanCard key={scan.id} scan={scan} uid={uid} plots={data.plots} farms={data.farms} onNotify={onNotify} />)}</div> : <EmptyState icon={ScanLine} title="No saved scans" description="Future scans for this plot will appear in date order." />}</section>
      <div className="plot-side-sections">
        <section className="panel"><SectionTitle eyebrow="FIELD NOTES" title="Observations" />{observations.length ? <div className="record-list">{observations.map(item => <ObservationCard key={item.id} item={item} />)}</div> : !noteOpen && <EmptyState icon={ClipboardList} title="No observations" description="Record what you see, separate from the model result." />}</section>
        <section className="panel"><SectionTitle eyebrow="MAINTENANCE" title="Care tasks" />{tasks.length ? <div className="task-list">{tasks.map(item => <TaskRow key={item.id} task={item} uid={uid} today={today} onNotify={onNotify} />)}</div> : !taskOpen && <EmptyState icon={ListChecks} title="No care tasks" description="Add a one-time task for the next field visit." />}</section>
      </div>
    </div>
  </div>;
}

export function ActivityView({ uid, data, onNotify, initialAction = '' }) {
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
  const entries = useMemo(() => buildActivity(data, filters, today), [data, filters, today]);
  const page = activityPage(entries, visibleCount);
  const groups = groupActivity(page.entries);
  const total = data.scans.length + data.observations.length + data.tasks.length;
  const plotOptions = data.plots.filter(plot => !filters.farmId || plot.farmId === filters.farmId);
  const dateLabels = { today: 'Today', '7': 'Last 7 days', '30': 'Last 30 days', custom: 'Custom range' };
  const activeFilters = [
    filters.search.trim() && `Search: ${filters.search.trim()}`,
    filters.type !== 'all' && ({ scan: 'Scans', observation: 'Observations', task: 'Care tasks' })[filters.type],
    dateLabels[filters.datePreset] && (filters.datePreset === 'custom' ? `${filters.from || 'Any start'} → ${filters.to || 'Any end'}` : dateLabels[filters.datePreset]),
    filters.farmId && data.farms.find(farm => farm.id === filters.farmId)?.name,
    filters.plotId && data.plots.find(plot => plot.id === filters.plotId)?.name,
    filters.type !== 'all' && filters.status !== 'all' && activityStatusOptions[filters.type]?.find(item => item[0] === filters.status)?.[1]
  ].filter(Boolean);
  const hasFilters = activeFilters.length > 0;
  const reset = () => { setFilters(defaultActivityFilters); setVisibleCount(50); };
  return <div className="view activity-view">
    <div className="page-intro"><div><span className="eyebrow">FIELD RECORDS</span><h1>Activity</h1><p>Find scans, observations, and care tasks by date or plot.</p></div><span className="activity-total">{total} record{total === 1 ? '' : 's'}</span></div>
    <section className="panel activity-filters" aria-label="Filter activity">
      <div className="activity-filter-top"><label className="search-field"><Search size={18} /><input value={filters.search} onChange={event => update('search', event.target.value)} placeholder="Search conditions, notes, tasks, or plots" aria-label="Search all activity" /></label><label className="field"><span>Record type</span><select value={filters.type} onChange={event => update('type', event.target.value)}><option value="all">All records</option><option value="scan">Scans</option><option value="observation">Observations</option><option value="task">Care tasks</option></select></label><label className="field"><span>Date</span><select value={filters.datePreset} onChange={event => update('datePreset', event.target.value)}><option value="all">All dates</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range</option></select></label></div>
      {filters.type !== 'all' && <label className="field activity-status-filter"><span>{filters.type === 'scan' ? 'Scan result' : filters.type === 'observation' ? 'Observation condition' : 'Task status'}</span><select value={filters.status} onChange={event => update('status', event.target.value)}><option value="all">Any status</option>{activityStatusOptions[filters.type].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <button className="mobile-filter-toggle text-link" type="button" aria-expanded={showFilters} aria-controls="activity-extra-filters" onClick={() => setShowFilters(value => !value)}><Settings2 size={15} />{showFilters ? 'Hide filters' : 'Farm & plot filters'}</button>
      <div id="activity-extra-filters" className={`activity-filter-fields ${showFilters ? 'filters-open' : ''}`}>
        <label className="field"><span>Farm</span><select value={filters.farmId} onChange={event => update('farmId', event.target.value)}><option value="">All farms</option>{data.farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}{farm.archivedAt ? ' (archived)' : ''}</option>)}</select></label>
        <label className="field"><span>Plot</span><select value={filters.plotId} onChange={event => update('plotId', event.target.value)}><option value="">All plots</option>{plotOptions.map(plot => <option key={plot.id} value={plot.id}>{plot.name}{plot.archivedAt ? ' (archived)' : ''}</option>)}</select></label>
        {filters.datePreset === 'custom' && <><label className="field"><span>From date</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={event => update('from', event.target.value)} /></label><label className="field"><span>To date</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={event => update('to', event.target.value)} /></label></>}
      </div>
      <div className="activity-filter-footer"><p>Today first · Upcoming dates nearest first · Past dates newest first</p>{hasFilters && <button className="text-link" type="button" onClick={reset}>Clear filters</button>}</div>
      {hasFilters && <ul className="active-filter-list" aria-label="Active filters">{activeFilters.map((label, index) => <li key={index}>{label}</li>)}</ul>}
      {invalidRange && <p className="inline-error" role="alert">The from date must be on or before the to date.</p>}
    </section>
    <div className="activity-results-heading"><h2>Timeline</h2><span role="status">{entries.length} of {total} matching{page.remaining > 0 && ` · Showing ${page.entries.length}`}</span></div>
    {!invalidRange && groups.length ? <div className="activity-timeline">{groups.map(group => <section className="activity-day" key={group.date || 'undated'} aria-label={group.date || 'Date unavailable'}>
      <div className="activity-date-heading"><span className="timeline-dot" /><h3>{group.date === today ? 'Today · ' : group.date > today ? 'Upcoming · ' : ''}{group.date ? dateLabel(`${group.date}T12:00:00`, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Date unavailable'}</h3><span>{group.entries.length}</span></div>
      <div className="activity-day-records">{group.entries.map(entry => <div className="activity-entry" key={entry.key}>
        <div className="activity-entry-label"><span className={`record-type record-${entry.type}`}>{entry.type === 'scan' ? <ScanLine size={14} /> : entry.type === 'task' ? <ListChecks size={14} /> : <ClipboardList size={14} />}{entry.type === 'scan' ? 'Scan' : entry.type === 'task' ? 'Care task · Due date' : 'Field observation'}</span><span className="record-context">{entry.farm?.name || 'Unassigned farm'} / {entry.plot?.name || 'Unassigned plot'}{entry.archived && <span className="record-tag">Archived</span>}{!entry.plot && <span className="record-tag">Unassigned</span>}</span></div>
        {entry.type === 'scan' ? <ScanCard scan={entry.record} uid={uid} plots={data.plots} farms={data.farms} onNotify={onNotify} /> : entry.type === 'observation' ? <ObservationCard item={entry.record} /> : <TaskRow task={entry.record} uid={uid} today={today} onNotify={onNotify} />}
      </div>)}</div>
    </section>)}{page.remaining > 0 && <button className="button button-soft load-more" type="button" onClick={() => setVisibleCount(count => count + 50)}>Load more · {page.remaining} remaining</button>}</div> : !invalidRange && <section className="panel"><EmptyState icon={FileClock} title={hasFilters ? 'No matching activity' : 'Your timeline starts here'} description={hasFilters ? 'Try another search or clear the filters to see all records.' : 'Saved scans, plot observations, and care tasks will appear here.'} action={hasFilters ? 'Clear filters' : undefined} onAction={reset} /></section>}
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
  if (!services.sharing) return <div className="view"><EmptyState icon={FlaskConical} title="Research sharing is temporarily unavailable" description="Your farm records remain private. Check workspace availability and try again." /></div>;
  if (!researcher) return <div className="view"><EmptyState icon={LockKeyhole} title="Research access required" description="The project owner grants researcher access to approved accounts." /></div>;
  return <div className="view"><div className="page-intro"><div><span className="eyebrow">APPROVED RESEARCH ACCESS</span><h1>Research results</h1><p>Contributed prediction fields only. Private photos and account records are not available here.</p></div><button className="button button-primary" type="button" onClick={exportCsv} disabled={!results.length}><Download size={17} /> Export CSV</button></div><div className="panel research-panel"><SectionTitle eyebrow="CONTRIBUTED DATA" title={`${results.length} shared result${results.length === 1 ? '' : 's'}`} />{error && <div className="inline-error" role="alert">{error}</div>}{loading ? <div className="quiet-empty">Loading contributed results…</div> : results.length ? <div className="table-scroll"><table className="research-table"><thead><tr><th>Month</th><th>Status</th><th>Top class</th><th>Confidence</th><th>Detections</th><th>Model</th><th>User observation</th></tr></thead><tbody>{[...results].sort((a, b) => (b.month || '').localeCompare(a.month || '')).map(result => <tr key={result.id}><td>{result.month || '—'}</td><td><StatusPill type={result.statusType}>{result.statusType || 'monitor'}</StatusPill></td><td>{result.topClass || '—'}</td><td>{formatConfidence(result.topConfidence)}</td><td>{result.detectionCount ?? 0}</td><td>{result.modelVersion || '—'}</td><td>{conditionLabel(result.userCondition)}</td></tr>)}</tbody></table></div> : <EmptyState icon={FlaskConical} title="No results shared yet" description="Results appear here when a grower chooses to share a scan." />}</div>{csv && <section className="panel research-export" aria-label="Research CSV preview"><SectionTitle eyebrow="EXPORT" title="Your CSV is ready" action={<button className="button button-soft" type="button" onClick={() => setCsv('')}>Close preview</button>} /><p>Copy the text below if the downloaded file does not appear.</p><label className="field"><span>CSV data</span><textarea readOnly rows={6} value={csv} onFocus={event => event.target.select()} /></label></section>}</div>;
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
    if (!window.confirm(`Import ${history.length} scan summar${history.length === 1 ? 'y' : 'ies'} from this browser into this account? They will be unassigned and have no photos.`)) return;
    setImporting(true);
    try {
      await importLegacyHistory(user.uid, history);
      localStorage.removeItem('agriVisionBackendHistory');
      setHistory([]);
      onNotify('Browser history imported as unassigned scans.');
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
  return <div className="view settings-view"><div className="page-intro"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>Settings</h1><p>Manage appearance, optional advice, and your account.</p></div></div><section aria-label="Preferences"><SectionTitle title="Preferences" /><div className="settings-grid preferences-grid">
    <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><Leaf size={20} /></div><div><h2>Appearance</h2><p>Use the look that feels right in the field.</p></div></div><div className="theme-options" role="group" aria-label="Color theme"><button className={themePreference === 'system' ? 'selected' : ''} type="button" aria-pressed={themePreference === 'system'} onClick={() => setThemePreference('system')}>Device setting</button><button className={themePreference === 'light' ? 'selected' : ''} type="button" aria-pressed={themePreference === 'light'} onClick={() => setThemePreference('light')}>Light</button><button className={themePreference === 'dark' ? 'selected' : ''} type="button" aria-pressed={themePreference === 'dark'} onClick={() => setThemePreference('dark')}>Dark</button></div></section>
    <RecommendationPreference uid={user.uid} />
  </div></section><section aria-label="Account and data"><SectionTitle title="Account & data" /><div className="settings-grid">
    <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><ShieldCheck size={20} /></div><div><h2>Your account</h2><p>Signed in as <strong>{user.email}</strong></p></div></div><button className="button button-soft" type="button" onClick={() => signOut(auth)}>Sign out</button></section>
    <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><FileClock size={20} /></div><div><h2>Old browser history</h2><p>Import up to 12 summaries from the previous version of AGRI-VISION.</p></div></div>{data.profile?.historyImportedAt ? <div className="callout subtle"><CheckCircle2 size={17} /> This account already imported browser history.</div> : history.length ? <><p className="settings-detail">{history.length} summaries found in this browser. They will start as unassigned scans without photos.</p><button className="button button-soft" type="button" disabled={importing || !online} onClick={importHistory}>{importing ? 'Importing…' : `Import ${history.length} scans`}</button></> : <div className="callout subtle"><FileClock size={17} /> No previous scan summaries found in this browser.</div>}</section>
    <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><FlaskConical size={20} /></div><div><h2>Research access</h2><p>{researcher ? 'This account can view contributed results.' : 'The project owner may grant researcher access to approved accounts.'}</p></div></div><button className="button button-soft" type="button" disabled={!services.sharing} onClick={refreshResearcher}><RefreshCw size={16} /> Refresh access</button></section>
    <section className="panel settings-card danger-card"><div className="settings-card-head"><div className="settings-icon danger-icon"><Trash2 size={20} /></div><div><h2>Delete account</h2><p>Remove this account, its farms, plots, scans, photos, tasks, and shared research copies.</p></div></div>{services.deletion ? <form onSubmit={removeAccount}><label className="field"><span>Confirm your password</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label><label className="field"><span>Type DELETE to confirm</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label><button className="button button-danger" disabled={deleting || !online || confirmation !== 'DELETE' || !password}>{deleting ? 'Deleting…' : 'Delete my account'}</button></form> : <div className="callout subtle"><ShieldCheck size={17} /> Secure account removal is temporarily unavailable. Start the local workspace and check availability before removing your account.</div>}</section>
  </div></section></div>;
}
