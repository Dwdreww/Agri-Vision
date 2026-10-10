import { useEffect, useId, useState } from 'react';
import { Camera, ChevronDown, CircleAlert, ClipboardList, ImageOff, Leaf, LoaderCircle, ScanLine, Sprout, Trash2 } from 'lucide-react';
import { deleteScan, fetchPrivateImage, linkImportedScan, revokeScan, setTaskCompleted, shareScan } from './data';
import { conditionLabel, dateLabel, readableError, statusLabel } from './utils';
import { useWorkspaceServices } from './services';
import { classifyCondition } from './conditions';
import { localDateKey, taskStatus } from './activity';
import RecommendationCard from './Recommendations.jsx';
import { formatConfidence } from './recommendation-utils.js';

export function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-mark"><Sprout size={27} strokeWidth={1.6} /></span>
    <span className="brand-word">agri<span>vision.</span><small>Pineapple health</small></span>
  </div>;
}

export function StatusPill({ type = 'monitor', children }) {
  return <span className={`status-pill status-${type}`}>{children}</span>;
}

export function ConditionBadge({ label }) {
  const condition = classifyCondition(label);
  return <span className={`condition-badge type-${condition.type}`} title={condition.description}>{condition.label}</span>;
}

export function ConfidenceHelp() {
  return <details className="confidence-help"><summary>About confidence and condition types</summary><p>Model confidence shows how strongly the image matches a trained class. It is not the chance that the plant has a disease and does not confirm a diagnosis. Unavailable means no valid confidence was saved.</p><p>Pathological diseases are associated with pathogens. Physiological disorders concern plant growth or development. The scanner recognizes seven classes; other conditions may need assessment by an agricultural professional.</p></details>;
}

export function EmptyState({ icon: Icon = Leaf, title, description, action, onAction }) {
  return <div className="empty-state">
    <div className="empty-icon"><Icon size={26} /></div>
    <h3>{title}</h3>
    <p>{description}</p>
    {action && <button className="button button-primary" type="button" onClick={onAction}>{action}</button>}
  </div>;
}

export function SectionTitle({ eyebrow, title, action }) {
  return <div className="section-heading">
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
    {action}
  </div>;
}

export function PrivateImage({ path, provider, alt }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!path) return undefined;
    let active = true;
    let objectUrl;
    setUrl(null);
    setError('');
    fetchPrivateImage(path, provider).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(error => active && setError(readableError(error)));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, provider]);
  if (!path) return <div className="image-placeholder"><ImageOff size={25} /> No saved photo</div>;
  if (error) return <div className="image-placeholder"><ImageOff size={25} /> {error}</div>;
  if (!url) return <div className="image-placeholder"><LoaderCircle className="spin" size={25} /> Loading photo</div>;
  return <img className="record-photo" src={url} alt={alt} />;
}

export function PredictionDetails({ scan, showPhotos = false }) {
  return <div className="prediction-details">
    {showPhotos && <div className="photo-pair">
      <div><span className="field-label">Uploaded image</span><PrivateImage path={scan.preparedImagePath} provider={scan.storageProvider} alt="Prepared pineapple image" /></div>
      <div><span className="field-label">Annotated result</span><PrivateImage path={scan.annotatedImagePath} provider={scan.storageProvider} alt="Pineapple scan with model annotations" /></div>
    </div>}
    {scan.message && <p>{scan.message}</p>}
    {scan.recommendation && <p className="recommendation"><strong>Scanner’s suggested next step</strong><br />{scan.recommendation}</p>}
    <div className="detail-grid">
      <div><span>Condition type</span><strong><ConditionBadge label={scan.topClass} /></strong></div>
      <div><span>Model version</span><strong>{scan.modelVersion || 'Unknown'}</strong></div>
      <div><span>Detections</span><strong>{scan.detectionCount ?? 0}</strong></div>
      <div><span>Reported condition</span><strong>{conditionLabel(scan.userCondition)}</strong></div>
      <div><span>Preprocessing</span><strong>{Number.isFinite(scan.preprocessingSummary?.segmentation_mask_coverage_percent) ? `${scan.preprocessingSummary.segmentation_mask_coverage_percent}% mask coverage` : 'Not saved'}</strong></div>
    </div>
    {Array.isArray(scan.detections) && scan.detections.length > 0 && <div className="detail-list">
      <h4>Detected regions</h4>
      {scan.detections.map((item, index) => <div key={index} className="detail-row">
        <span>#{index + 1} {item.pretty_class_name || item.class_name || 'Region'} <ConditionBadge label={item.pretty_class_name || item.class_name} /></span>
        <span>{formatConfidence(item.efficientnet_confidence_percent)} model confidence</span>
      </div>)}
    </div>}
    {Array.isArray(scan.preprocessingSteps) && scan.preprocessingSteps.length > 0 && <div className="detail-list">
      <h4>Image preparation</h4>
      {scan.preprocessingSteps.map((step, index) => <div key={index} className="detail-row">
        <span>{step.name || `Step ${index + 1}`}</span><span>{step.used_for || ''}</span>
      </div>)}
    </div>}
  </div>;
}

export function ScanCard({ scan, uid, plots = [], farms = [], onNotify, compact = false }) {
  const services = useWorkspaceServices();
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const plot = plots.find(item => item.id === scan.plotId);
  const farm = farms.find(item => item.id === (scan.farmId || plot?.farmId));
  const recordedDate = scan.importedFromLegacy && scan.legacyDisplayTime ? scan.legacyDisplayTime : scan.createdAt ? dateLabel(scan.createdAt) : 'Date unavailable';
  function requireConnection() {
    if (navigator.onLine) return true;
    onNotify('Connect to the internet to change a scan.', 'error');
    return false;
  }
  async function handleShare() {
    if (!requireConnection()) return;
    setBusy(true);
    try {
      if (scan.shareForResearch) await revokeScan(scan.id);
      else await shareScan(scan.id);
      onNotify(scan.shareForResearch ? 'Research sharing revoked.' : 'Result shared for research.');
    } catch (error) {
      onNotify(readableError(error), 'error');
    } finally { setBusy(false); }
  }
  async function handleDelete() {
    if (!requireConnection()) return;
    if (!window.confirm('Delete this scan and its saved photos? This cannot be undone.')) return;
    setBusy(true);
    try { await deleteScan(scan.id); onNotify('Scan deleted.'); }
    catch (error) { onNotify(readableError(error), 'error'); setBusy(false); }
  }
  async function handleLink(event) {
    if (!requireConnection()) return;
    const selected = plots.find(item => item.id === event.target.value);
    if (!selected) return;
    setBusy(true);
    try {
      await linkImportedScan(uid, scan.id, selected.id, selected.farmId);
      onNotify('Scan linked to plot.');
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  return <article className={`scan-card ${compact ? 'scan-card-compact' : ''}`}>
    <div className="scan-card-top">
      {compact && scan.hasPhotos && scan.preparedImagePath ? <div className="scan-thumbnail"><PrivateImage path={scan.preparedImagePath} provider={scan.storageProvider} alt="Saved pineapple sample" /></div> : <div className="scan-icon"><ScanLine size={22} /></div>}
      <div className="scan-card-title">
        <div className="scan-title-line"><h3>{scan.topClass || 'Scan result'}</h3><StatusPill type={scan.statusType}>{statusLabel(scan)}</StatusPill></div>
        <ConditionBadge label={scan.topClass} />
        <p className="scan-context"><span>{recordedDate}</span><span>{farm ? `${farm.name} · ` : ''}{plot?.name || 'Unassigned'}</span></p>
      </div>
    </div>
    <div className="scan-card-footer">
      <div className="scan-stats"><span><strong>{formatConfidence(scan.topConfidence)}</strong><span>Model confidence</span></span><span><strong>{scan.detectionCount ?? 0}</strong><span>Detected regions</span></span>{scan.shareForResearch && <span className="shared-label">Shared for research</span>}</div>
      <button className="button button-soft record-details-button" type="button" aria-label={open ? 'Hide details' : 'View details'} aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => setOpen(value => !value)}>{open ? 'Hide details' : 'View details'}<ChevronDown className={open ? 'rotated' : ''} size={16} /></button>
    </div>
    {open && <div id={detailsId} className="scan-card-expanded">
      {scan.importedFromLegacy && !scan.plotId && <label className="field compact-field"><span>Link this old scan to a plot</span><select value="" onChange={handleLink} disabled={busy}><option value="">Select plot</option>{plots.filter(item => !item.archivedAt).map(item => <option key={item.id} value={item.id}>{farms.find(farm => farm.id === item.farmId)?.name || 'Farm'} · {item.name}</option>)}</select></label>}
      {scan.importedFromLegacy && <p className="callout subtle"><CircleAlert size={17} /> Imported from this browser. This record has no saved photos or detailed model output.</p>}
      <ConfidenceHelp />
      <PredictionDetails scan={scan} showPhotos={Boolean(scan.hasPhotos)} />
      <RecommendationCard uid={uid} scanId={scan.id} />
      <div className="record-actions">
        <button className="button button-soft" type="button" disabled={busy || !services.sharing || (!scan.shareForResearch && formatConfidence(scan.topConfidence) === 'Unavailable')} onClick={handleShare}>{busy ? 'Working…' : scan.shareForResearch ? 'Revoke research sharing' : 'Share result for research'}</button>
        <button className="button button-text danger-text" type="button" disabled={busy || !services.deletion} onClick={handleDelete}><Trash2 size={15} /> Delete scan</button>
      </div>
      {!scan.shareForResearch && formatConfidence(scan.topConfidence) === 'Unavailable' && <p className="helper-text">Research sharing requires a valid model confidence value. This scan can still be reviewed and deleted.</p>}
      {(!services.sharing || !services.deletion) && <p className="helper-text">Sharing and secure removal are temporarily unavailable. Your saved records remain private.</p>}
    </div>}
  </article>;
}

export function ObservationCard({ item, compact = false }) {
  return <article className={`observation-card ${compact ? 'observation-compact' : ''}`}>
    <div className={`condition-icon condition-${item.condition}`}><ClipboardList size={18} /></div>
    <div><div className="observation-top"><strong>{conditionLabel(item.condition)}</strong><span>{item.observedAt || dateLabel(item.createdAt)}</span></div><p>{item.note}</p></div>
  </article>;
}

export function TaskRow({ task, uid, plotName, onNotify, today = localDateKey(new Date()) }) {
  const [busy, setBusy] = useState(false);
  const state = taskStatus(task, today);
  const overdue = state === 'overdue';
  const stateLabel = { done: 'Done', today: 'Due today', overdue: 'Overdue', upcoming: 'Upcoming', undated: 'No due date' }[state];
  async function toggle() {
    if (!navigator.onLine) { onNotify('Connect to the internet to update a care task.', 'error'); return; }
    setBusy(true);
    try {
      await setTaskCompleted(uid, task, !task.completedAt);
      onNotify(task.completedAt ? 'Task reopened.' : 'Task completed.');
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  return <div className={`task-row ${task.completedAt ? 'task-done' : ''}`}>
    <button className="task-check" type="button" onClick={toggle} disabled={busy} aria-label={`${task.completedAt ? 'Reopen' : 'Complete'} ${task.title}`} aria-pressed={Boolean(task.completedAt)}><span /></button>
    <div className="task-content"><div className="task-title-line"><strong>{task.title}</strong><StatusPill type={overdue ? 'risk' : state === 'today' ? 'monitor' : state === 'done' ? 'healthy' : 'scheduled'}>{stateLabel}</StatusPill></div>{task.note && <p>{task.note}</p>}{plotName && <small>{plotName}</small>}{task.completedAt && <small className="task-completed-date">Completed {dateLabel(task.completedAt)}</small>}</div>
    <span className={`task-date ${overdue ? 'date-overdue' : ''}`}>Due {task.dueDate ? dateLabel(`${task.dueDate}T12:00:00`, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}</span>
  </div>;
}

export function NetworkBanner({ online }) {
  if (online) return null;
  return <div className="network-banner" role="status"><CircleAlert size={17} /> You are offline. Scans and record changes need a connection.</div>;
}

export function LoadingScreen({ text = 'Loading your workspace…' }) {
  return <div className="loading-screen workspace-skeleton" aria-busy="true"><p role="status" aria-live="polite">{text}</p><div className="skeleton skeleton-title" aria-hidden="true" /><div className="skeleton-grid" aria-hidden="true"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div></div>;
}
