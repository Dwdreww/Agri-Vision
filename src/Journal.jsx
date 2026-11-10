import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Camera, ChevronRight, ClipboardList, FileClock, FileText, HelpCircle, ListChecks, Maximize2, Minimize2, Plus, ScanLine, Search, Settings2, Sprout, X } from 'lucide-react';
import { t } from './i18n.js';
import { useLanguage } from './Language.jsx';
import { createObservation, createTask } from './data';
import { ObservationCard, PrivateImage, ScanCard, StatusPill, TaskRow } from './components';
import { activityPage, activityStatusOptions, buildActivity, changeActivityFilter, defaultActivityFilters } from './activity';
import { dateLabel, readableError, statusLabel } from './utils';
import { useLocalToday } from './use-local-today';
import { useDialog } from './use-dialog';
import { useWorkspaceServices } from './services';

const categories = [
  ['scan', 'Photos', Camera],
  ['observation', 'Field notes', ClipboardList],
  ['task', 'Care tasks', ListChecks]
];
const clearRecordFilters = filters => ({ ...filters, search: '', datePreset: 'all', from: '', to: '', status: 'all' });
const dateOptions = [['all', 'All dates'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['custom', 'Custom range']];

function RecordEntry({ entry, onOpen }) {
  const { record, plot } = entry;
  const isPhoto = entry.type === 'scan';
  const title = isPhoto ? t(record.isPhotoOnly ? 'Field photo' : record.topClass || 'Photo check') : record.note;
  return <button className="record-row" type="button" aria-haspopup="dialog" onClick={onOpen}
    aria-label={t(isPhoto ? 'Open photograph from {area}, {date}' : 'Open field note from {area}, {date}', { area: plot?.name || t('Unassigned growing area'), date: entry.date ? dateLabel(entry.date + 'T12:00:00') : t('Date unavailable') })}>
    <span className={`record-thumb ${isPhoto ? '' : 'record-thumb-note'}`}>{isPhoto && record.hasPhotos ? <PrivateImage path={record.preparedImagePath} provider={record.storageProvider} alt=""/> : isPhoto ? <Camera size={26}/> : <ClipboardList size={26}/>}</span>
    <span className="record-row-main"><small>{t(isPhoto ? 'PHOTO RECORD' : 'FIELD NOTE')}</small><strong>{title}</strong><span className="record-mobile-area">{plot?.name || t('Unassigned growing area')}</span><StatusPill type={isPhoto ? record.isPhotoOnly ? 'neutral' : record.statusType : 'neutral'}>{isPhoto ? record.isPhotoOnly ? t('Not analyzed') : t(statusLabel(record)) : t('Your observation')}</StatusPill></span>
    <span className="record-row-area">{plot?.name || t('Unassigned growing area')}<small>{entry.farm?.name}</small></span>
    <span className="record-row-date">{entry.date ? dateLabel(entry.date + 'T12:00:00', {month:'short',day:'numeric',year:'numeric'}) : t('Date unavailable')}</span><ChevronRight size={18} aria-hidden="true"/>
  </button>;
}

export default function JournalView({ user, data, filters, onFiltersChange, onNavigate, onNotify, online, onChoosePhoto, initialAction = '', mode = 'records' }) {
  const { language } = useLanguage();
  const services = useWorkspaceServices();
  const today = useLocalToday();
  const careMode = mode === 'care' || filters.type === 'task';
  const [editor, setEditor] = useState(['observation', 'task'].includes(initialAction) ? initialAction : '');
  const [choosing, setChoosing] = useState(initialAction === 'new');
  const [selectedKey, setSelectedKey] = useState(initialAction.startsWith('open:') ? initialAction.slice(5) : '');
  const [recordExpanded, setRecordExpanded] = useState(false);
  const [entryPlot, setEntryPlot] = useState(filters.plotId || '');
  const [note, setNote] = useState({ observedAt: today, condition: 'unsure', note: '' });
  const [task, setTask] = useState({ title: '', dueDate: today, note: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false), [limit, setLimit] = useState(50);
  const [saved, setSaved] = useState(null);
  const saveLock = useRef(false), focusedSaved = useRef('');
  const activePlots = data.plots.filter(p => !p.archivedAt && data.farms.some(f => f.id === p.farmId && !f.archivedAt));
  const selectedPlot = data.plots.find(p => p.id === filters.plotId);
  const selectedFarm = data.farms.find(f => f.id === (selectedPlot?.farmId || filters.farmId));
  const archived = Boolean(selectedPlot?.archivedAt || selectedFarm?.archivedAt);
  const invalidRange = filters.datePreset === 'custom' && Boolean(filters.from && filters.to && filters.from > filters.to);
  const entries = useMemo(() => buildActivity(data, careMode ? {...filters, type:'task'} : filters, today).filter(entry => careMode ? entry.type === 'task' : entry.type !== 'task'), [data, filters, today, language, careMode]);
  const page = activityPage(entries, limit);
  const scoped = useMemo(() => buildActivity(data, { ...defaultActivityFilters, farmId: filters.farmId, plotId: filters.plotId }, today), [data, filters.farmId, filters.plotId, today, language]);
  const care = scoped.filter(e => e.type === 'task' && !e.record.completedAt && !e.archived);
  const attention = care.filter(e => e.record.dueDate && e.record.dueDate <= today).length;
  const counts = Object.fromEntries(categories.map(([type]) => [type, type === 'all' ? scoped.filter(entry => entry.type !== 'task').length : scoped.filter(e => e.type === type).length]));
  const hasFilters = Boolean(filters.search.trim() || filters.status !== 'all' || filters.datePreset !== 'all');
  const selectedEntry = scoped.find(entry => entry.key === selectedKey);
  const canCreate = online && !busy && !archived && activePlots.length > 0;
  const filterCount = Number(Boolean(filters.farmId || filters.plotId)) + Number(filters.status !== 'all') + Number(filters.datePreset !== 'all');
  const pickerDialog = useDialog(choosing, () => setChoosing(false));
  const editorDialog = useDialog(Boolean(editor), closeEditor);
  const recordDialog = useDialog(Boolean(selectedEntry), () => setSelectedKey(''));
  const nextPhotoInput = useRef(null);
  const startAnother = () => {
    if (onChoosePhoto) nextPhotoInput.current?.click();
    else onNavigate('scan', activePlots.find(plot => plot.id === selectedEntry.record.plotId)?.id);
  };
  const recordActions = selectedEntry && activePlots.some(plot => plot.id === selectedEntry.record.plotId)
    ? <div className="fieldbook-record-actions"><button className="button button-primary" type="button" disabled={!canCreate} onClick={() => openEditor('observation', selectedEntry.record.plotId)}>{t('Write note')}</button><button className="button button-soft" type="button" disabled={!canCreate} onClick={() => openEditor('task', selectedEntry.record.plotId)}>{t('Plan care')}</button></div>
    : null;

  useEffect(() => { setLimit(50); }, [filters]);
  useEffect(() => { setRecordExpanded(false); }, [selectedKey]);
  useEffect(() => {
    if (!saved || focusedSaved.current === saved.id) return;
    const record = document.getElementById('fieldbook-' + saved.type + '-' + saved.id);
    if (!record) return;
    const frame = requestAnimationFrame(() => {
      focusedSaved.current = saved.id;
      record.focus({ preventScroll: true });
      record.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [saved, data]);
  useEffect(() => {
    if (selectedKey && !selectedEntry) setSelectedKey('');
  }, [selectedKey, selectedEntry]);

  function update(key, value) {
    if (busy) return;
    setSaved(null);
    onFiltersChange(changeActivityFilter(filters, key, value, data.plots));
  }
  function updateRange(key, value) {
    if (busy) return;
    setSaved(null);
    onFiltersChange({ ...filters, datePreset: 'custom', [key]: value });
  }
  function openEditor(kind, targetPlotId) {
    if (!canCreate) return;
    const plot = activePlots.find(p => p.id === targetPlotId) || (selectedPlot && !archived ? selectedPlot : activePlots.find(p => !filters.farmId || p.farmId === filters.farmId) || activePlots[0]);
    setChoosing(false); setSelectedKey(''); setEntryPlot(plot?.id || '');
    setError(''); setSaved(null); setEditor(kind);
  }
  function closeEditor() {
    if (busy) return;
    const hasDraft = editor === 'observation' ? note.note.trim() : task.title.trim() || task.note.trim();
    if (hasDraft && !window.confirm(t('Discard this unsaved entry?'))) return;
    setEditor(''); setError('');
    setNote({ observedAt: today, condition: 'unsure', note: '' });
    setTask({ title: '', dueDate: today, note: '' });
  }
  async function submit(event) {
    event.preventDefault();
    if (saveLock.current) return;
    const plot = activePlots.find(p => p.id === entryPlot);
    if (!plot) { setError(t('Choose an active growing area before saving.')); return; }
    if (editor === 'observation' && !note.note.trim() || editor === 'task' && !task.title.trim()) return;
    saveLock.current = true; setBusy(true); setError('');
    const kind = editor;
    try {
      const id = kind === 'observation'
        ? await createObservation(user.uid, { ...note, note: note.note.trim(), plotId: plot.id })
        : await createTask(user.uid, { ...task, title: task.title.trim(), plotId: plot.id });
      onFiltersChange({ ...clearRecordFilters(filters), type: kind, farmId: plot.farmId, plotId: plot.id });
      setEditor(''); setNote({ observedAt: today, condition: 'unsure', note: '' }); setTask({ title: '', dueDate: today, note: '' });
      setSaved(id ? { type: kind, id } : null);
      onNotify(kind === 'observation' ? 'Field note added to this growing area.' : 'Care task added.');
      if (kind === 'task' && !careMode) onNavigate('care', plot.id);
    } catch (issue) { setError(readableError(issue)); }
    finally { setBusy(false); saveLock.current = false; }
  }
  function addPhoto() {
    if (!online || busy || archived) return;
    if (!activePlots.length && !services.demo) { onNavigate('farms', '', data.farms.some(farm => !farm.archivedAt) ? 'add-plot' : 'add-farm'); return; }
    const plot = selectedPlot && !archived ? selectedPlot : activePlots.find(p => !filters.farmId || p.farmId === filters.farmId) || activePlots[0];
    setChoosing(false);
    onNavigate('scan', plot?.id);
  }
  function notifyTask(id, message, type) {
    onNotify(message, type);
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      const retained = document.getElementById('fieldbook-task-' + id)?.querySelector('.task-check:not(:disabled)');
      const category = [...document.querySelectorAll('.record-tabs button[aria-pressed=true]')].find(button => button.getClientRects().length);
      (retained || category)?.focus({ preventScroll: true });
    });
  }
  function startEntry(kind) {
    if (!activePlots.length) { onNavigate('farms', '', data.farms.some(farm => !farm.archivedAt) ? 'add-plot' : 'add-farm'); return; }
    openEditor(kind);
  }
  function reset() { setSaved(null); onFiltersChange(clearRecordFilters(filters)); }

  const scopeFields = <><label className="field"><span>{t('Farm')}</span><select disabled={busy} value={filters.farmId} onChange={e => update('farmId', e.target.value)}>
    <option value="">{t('All farms')}</option>{data.farms.map(f => <option key={f.id} value={f.id}>{f.name}{f.archivedAt ? t(' (archived)') : ''}</option>)}
  </select></label><label className="field"><span>{t('Growing area')}</span><select disabled={busy} value={filters.plotId} onChange={e => update('plotId', e.target.value)}>
    <option value="">{t('All growing areas')}</option>{data.plots.filter(p => !filters.farmId || p.farmId === filters.farmId).map(p => <option key={p.id} value={p.id}>{!filters.farmId ? (data.farms.find(f => f.id === p.farmId)?.name || t('Farm')) + ' / ' : ''}{p.name}{p.archivedAt ? t(' (archived)') : ''}</option>)}
  </select></label></>;

  return <div className={`records-page ${careMode ? 'care-page' : ''}`}>
    <header className="screen-heading"><div><h1>{t('Records')}</h1><p>{selectedPlot ? `${selectedFarm?.name || t('Farm')} / ${selectedPlot.name}` : t(careMode ? 'Small actions that keep your next visit on track.' : 'Every photo and observation, easy to find again.')}</p></div><div className="screen-actions"><button className="button button-primary" disabled={!online || busy || archived} onClick={careMode ? ()=>startEntry('task') : filters.type === 'observation' ? ()=>startEntry('observation') : addPhoto}><Plus size={18}/>{t(careMode ? 'Plan care task' : filters.type === 'observation' ? 'Write note' : services.browser ? 'Add photo' : 'Scan pineapple')}</button></div></header>
    {archived && <p className="callout">{t('This growing area is archived. Its history remains available.')}</p>}
    <section className="records-surface">
      <div className="records-controls"><nav className="record-tabs" aria-label={t('Record categories')}>
        {categories.map(([key,label])=><button key={key} disabled={busy} aria-pressed={careMode ? key==='task' : filters.type===key || filters.type==='all' && key==='scan'} onClick={()=>key==='task' ? onNavigate('care',selectedPlot?.id,'category:task') : mode==='care' ? onNavigate('records',selectedPlot?.id,'category:'+key) : update('type',key)}>{t(label)}<span>{counts[key]}</span></button>)}
      </nav><div className="record-search-tools"><label className="records-search"><Search size={17}/><input name="record-search" type="search" value={filters.search} disabled={busy} onChange={e=>update('search',e.target.value)} placeholder={t(careMode ? 'Find a care task…' : filters.type === 'observation' ? 'Find a field note…' : 'Find a photo…')} aria-label={t(careMode ? 'Search care tasks' : filters.type === 'observation' ? 'Search field notes' : 'Search photos')}/></label><button className="button button-soft filter-toggle" aria-expanded={advanced} aria-controls="record-filters" onClick={()=>setAdvanced(value=>!value)}><Settings2 size={17}/><span>{t('Filters')}</span>{filterCount>0 && <small>{filterCount}</small>}</button></div></div>
      {(advanced || filters.datePreset==='custom') && <div id="record-filters" className="record-filters">{scopeFields}<label className="field"><span>{t('Date')}</span><select value={filters.datePreset} disabled={busy} onChange={e=>update('datePreset',e.target.value)}>{dateOptions.map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>{filters.datePreset==='custom' && <><label className="field"><span>{t('From date')}</span><input type="date" value={filters.from} onChange={e=>updateRange('from',e.target.value)}/></label><label className="field"><span>{t('To date')}</span><input type="date" value={filters.to} onChange={e=>updateRange('to',e.target.value)}/></label></>}{(careMode || filters.type!=='all') && <label className="field"><span>{t('Status')}</span><select value={filters.status} onChange={e=>update('status',e.target.value)}><option value="all">{t('Any status')}</option>{activityStatusOptions[careMode?'task':filters.type].map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>}</div>}
      <div className="records-result-line"><span role="status">{t(careMode ? entries.length === 1 ? '{count} care task' : '{count} care tasks' : entries.length === 1 ? '{count} record' : '{count} records', {count:entries.length})}</span>{hasFilters && <button className="text-link" onClick={reset}>{t('Clear filters')}</button>}{!careMode && <small>{t('Photos & field observations')}</small>}</div>
      {invalidRange ? <p className="inline-error" role="alert">{t('The from date must be on or before the to date.')}</p> : page.entries.length ? careMode ? <div className="care-list">{page.entries.map(entry=><article className="care-list-item" key={entry.key} id={'fieldbook-task-'+entry.record.id} tabIndex={-1}><span className="care-area-label"><Sprout size={15}/>{entry.plot?.name || t('Unassigned growing area')}{entry.archived && ' · '+t('Archived')}</span><TaskRow task={entry.record} uid={user.uid} today={today} onNotify={(message,type)=>notifyTask(entry.record.id,message,type)}/></article>)}</div> : <><div className="record-list-heading"><span>{t('Record')}</span><span>{t('Growing area')}</span><span>{t('Date')}</span></div><div className="record-rows">{page.entries.map(entry=><article key={entry.key} id={'fieldbook-'+entry.type+'-'+entry.record.id} tabIndex={-1}><RecordEntry entry={entry} onOpen={()=>setSelectedKey(entry.key)}/></article>)}</div></> : <div className="records-empty"><span className="records-empty-mark">{careMode ? <ListChecks size={36} strokeWidth={1.3}/> : filters.type === 'observation' ? <ClipboardList size={36} strokeWidth={1.3}/> : <Camera size={36} strokeWidth={1.3}/>}</span><h2>{t(hasFilters ? 'Nothing matches these filters' : careMode ? 'Make your next visit a little easier.' : filters.type === 'observation' ? 'Keep what you noticed.' : 'A home for your field visits.')}</h2><p>{t(hasFilters ? 'Try a different search or clear your filters.' : careMode ? 'Add an action and a date. Your care plan starts with one small step.' : 'Add a pineapple photo or write an observation. Your records will stay together by growing area.')}</p></div>}
      {!invalidRange && page.remaining>0 && <button className="button button-soft records-load" onClick={()=>setLimit(count=>count+50)}>{t('Load more · ')}{page.remaining}{t(' remaining')}</button>}
    </section>
    <p className="records-footnote">{t(careMode ? 'Tasks are kept here in the app. They do not send phone notifications.' : 'Your notes are your observations. A model result is a suggestion for the photographed sample.')}</p>
    {choosing && <div className="fieldbook-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setChoosing(false); }}>
      <section className="fieldbook-dialog fieldbook-picker" ref={pickerDialog} role="dialog" aria-modal="true" aria-labelledby="fieldbook-picker-title" tabIndex={-1}>
        <header className="fieldbook-dialog-heading"><div><h2 id="fieldbook-picker-title">{t('New entry')}</h2><p>{t('What would you like to record?')}</p></div><button className="icon-button" aria-label={t('Close new entry')} onClick={() => setChoosing(false)}><X size={20} /></button></header>
        <div className="fieldbook-entry-choices">{[
          [Camera, services.browser ? 'Add photo' : 'Scan pineapple', 'Keep a photographed sample with this growing area.', addPhoto],
          [ClipboardList, 'Write note', 'Record what you noticed during your visit.', () => openEditor('observation')],
          [ListChecks, 'Plan care', 'Choose an action and a date for the next visit.', () => openEditor('task')]
        ].map(([Icon, label, description, action]) => <button key={label} type="button" onClick={action}><Icon size={22} /><span><strong>{t(label)}</strong><span>{t(description)}</span></span><ChevronRight size={18} /></button>)}</div>
      </section>
    </div>}

    {editor && <div className="fieldbook-overlay" onMouseDown={e => { if (e.target === e.currentTarget) closeEditor(); }}>
      <section className="fieldbook-dialog fieldbook-editor" ref={editorDialog} role="dialog" aria-modal="true" aria-labelledby="fieldbook-editor-title" tabIndex={-1}>
        <form onSubmit={submit} aria-busy={busy}>
          <header className="fieldbook-dialog-heading"><div><h2 id="fieldbook-editor-title">{t(editor === 'observation' ? 'Write your observation' : 'Plan the next visit')}</h2><p>{t(editor === 'observation' ? 'Your observation stays separate from the model result.' : 'Choose an action and a due date. This list does not send phone notifications.')}</p></div><button className="icon-button" type="button" disabled={busy} aria-label={t('Cancel entry')} onClick={closeEditor}><X size={20} /></button></header>
          <fieldset disabled={busy}><label className="field"><span>{t('Growing area')}</span><select required value={entryPlot} onChange={e => setEntryPlot(e.target.value)}><option value="">{t('Select growing area')}</option>{activePlots.map(p => <option key={p.id} value={p.id}>{data.farms.find(f => f.id === p.farmId)?.name} / {p.name}</option>)}</select></label>
            {editor === 'observation' ? <><div className="fieldbook-form-pair"><label className="field"><span>{t('Field note date')}</span><input type="date" required value={note.observedAt} onChange={e => setNote({ ...note, observedAt: e.target.value })} /></label><label className="field"><span>{t('Condition you observed')}</span><select value={note.condition} onChange={e => setNote({ ...note, condition: e.target.value })}><option value="unsure">{t('Unsure')}</option><option value="normal">{t('Normal')}</option><option value="concerning">{t('Concerning')}</option></select></label></div><label className="field"><span>{t('What did you notice?')}</span><textarea required maxLength={1000} rows={4} value={note.note} onChange={e => setNote({ ...note, note: e.target.value })} /></label></> : <><label className="field"><span>{t('Task')}</span><input required maxLength={100} value={task.title} onChange={e => setTask({ ...task, title: e.target.value })} /></label><label className="field"><span>{t('Due date')}</span><input type="date" required value={task.dueDate} onChange={e => setTask({ ...task, dueDate: e.target.value })} /></label><label className="field"><span>{t('Note')} <em>{t('(optional)')}</em></span><textarea maxLength={500} rows={3} value={task.note} onChange={e => setTask({ ...task, note: e.target.value })} /></label></>}
          </fieldset>
          {error && <p className="inline-error" role="alert">{t(error)}</p>}
          <div className="fieldbook-dialog-actions"><button className="button button-soft" type="button" disabled={busy} onClick={closeEditor}>{t('Cancel')}</button><button className="button button-primary" disabled={busy || !online || !(editor === 'observation' ? note.note.trim() : task.title.trim())}>{t(busy ? 'Saving…' : editor === 'observation' ? 'Save field note' : 'Save task')}</button></div>
        </form>
      </section>
    </div>}

    {selectedEntry && <div className={`fieldbook-overlay fieldbook-record-overlay ${recordExpanded ? 'record-is-expanded' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) setSelectedKey(''); }}>
      <section className="fieldbook-inspector" ref={recordDialog} role="dialog" aria-modal="true" aria-labelledby="fieldbook-record-title" tabIndex={-1}>
        <header className="fieldbook-dialog-heading"><div><h2 id="fieldbook-record-title">{t(selectedEntry.type === 'scan' ? 'Photo record' : 'Field note')}</h2><p>{selectedEntry.plot?.name || t('Unassigned growing area')}</p></div><div className="record-header-actions"><button className="icon-button record-expand-button" type="button" aria-label={t(recordExpanded ? 'Restore record size' : 'Expand record overview')} aria-pressed={recordExpanded} onClick={() => setRecordExpanded(value => !value)}>{recordExpanded ? <Minimize2 size={19}/> : <Maximize2 size={19}/>}</button><button className="icon-button" aria-label={t('Close record')} onClick={() => setSelectedKey('')}><X size={20} /></button></div></header>
        <div className="record-overview-content">
        {selectedEntry.type === 'scan' && <input ref={nextPhotoInput} type="file" accept="image/*" hidden onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onChoosePhoto?.(file, activePlots.find(plot => plot.id === selectedEntry.record.plotId)?.id);
        }} />}
        {selectedEntry.type === 'scan' ? <ScanCard key={selectedEntry.key} scan={selectedEntry.record} uid={user.uid} plots={data.plots} farms={data.farms} onNotify={onNotify} overview overviewActions={recordActions} onScanAnother={startAnother}/> : <>{recordActions}<ObservationCard item={selectedEntry.record}/></>}
        </div>
      </section>
    </div>}
  </div>;
}
