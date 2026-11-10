import { t } from './i18n.js';
import { useEffect, useId, useRef, useState } from 'react';
import { Camera, ChevronDown, CircleAlert, ClipboardList, ImageOff, ImagePlus, Leaf, LoaderCircle, ScanLine, ShieldCheck, Sprout, Trash2 } from 'lucide-react';
import { deleteScan, fetchPrivateImage, linkImportedScan, revokeScan, setTaskCompleted, shareScan } from './data';
import { conditionLabel, dateLabel, readableError, statusLabel } from './utils';
import { useWorkspaceServices } from './services';
import { classifyCondition } from './conditions';
import { localDateKey, taskStatus } from './activity';
import RecommendationCard from './Recommendations.jsx';
import { formatConfidence } from './recommendation-utils.js';
import { browserWorkspace } from './firebase';
import { isDetectionOnly } from './detection-regions.js';
import { scanAssessment } from './scan-assessment.js';

export { Brand } from './Brand.jsx';
import { Brand } from './Brand.jsx';

export function StatusPill({ type = 'monitor', children }) {
  return <span className={`status-pill status-${type}`}>{t(children)}</span>;
}

export function ScanResultIndicators({ statusType, label, confidence, photoOnly = false }) {
  const type = ['healthy', 'risk', 'monitor'].includes(statusType) ? statusType : 'monitor';
  const score = formatConfidence(confidence);
  return <div className="scan-result-indicators">
    <StatusPill type={photoOnly ? 'neutral' : type}>
      {photoOnly ? 'Not analyzed' : statusLabel({ statusType: type, statusLabel: label })}
    </StatusPill>
    {!photoOnly && score !== 'Unavailable' && <span className="scan-confidence">
      {t('Model confidence')} <strong>{score}</strong>
    </span>}
  </div>;
}

export function ConditionBadge({ label, classificationAvailable = true }) {
  if (!classificationAvailable) return <span className="condition-badge type-unclassified">{t('Classifier not installed')}</span>;
  const condition = classifyCondition(label);
  return <span className={`condition-badge type-${condition.type}`} title={t(condition.description)}>{t(condition.label)}</span>;
}

export function EmptyState({ icon: Icon = Leaf, title, description, action, onAction }) {
  return <div className="empty-state">
    <div className="empty-icon"><Icon size={26} /></div>
    <h3>{t(title)}</h3>
    <p>{t(description)}</p>
    {action && <button className="button button-primary" type="button" onClick={onAction}>{action}</button>}
  </div>;
}

export function SectionTitle({ eyebrow, title, action }) {
  return <div className="section-heading">
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{t(title)}</h2></div>
    {action}
  </div>;
}

export function PrivateImage({ path, provider, alt, retryable = false }) {
  const services = useWorkspaceServices();
  const [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  const serviceWasReady = useRef(services.photos);
  useEffect(() => {
    const restored = services.photos && !serviceWasReady.current;
    serviceWasReady.current = services.photos;
    if (restored && error) setAttempt(value => value + 1);
  }, [services.photos, error]);
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
  }, [path, provider, attempt]);
  if (!path) return <div className="image-placeholder"><ImageOff size={25} />{t(" No saved photo")}</div>;
  if (error) return <div className="image-placeholder" role={retryable ? "status" : undefined} title={t(error)}><ImageOff size={25} /><span>{t(error)}</span>{retryable && <button className="button button-soft" type="button" onClick={() => setAttempt(value => value + 1)}>{t("Retry photo")}</button>}</div>;
  if (!url) return <div className="image-placeholder"><LoaderCircle className="spin" size={25} />{t(" Loading photo")}</div>;
  return <img className="record-photo" src={url} alt={alt} />;
}

function RecordPhoto({ scan }) {
  return <PrivateImage path={scan.preparedImagePath} provider={scan.storageProvider}
    alt={t("Original pineapple photo")} retryable />;
}

export function ScanNextStep({ assessment, userCondition }) {
  return <div className="result-summary">
    <div className="recommendation-box">
      <ShieldCheck size={19} aria-hidden="true" />
      <p><strong>{t("Suggested next step")}</strong><span>{t(assessment.next)}</span></p>
    </div>
    {userCondition && <p className="helper-text">{t("Your field observation")}: {t(conditionLabel(userCondition))}</p>}
  </div>;
}

export function ScanCard({ scan, uid, plots = [], farms = [], onNotify, compact = false, defaultExpanded = false, overview = false, overviewActions, onScanAnother }) {
  const services = useWorkspaceServices();
  const detailsId = useId();
  const [open, setOpen] = useState(defaultExpanded);
  const [busy, setBusy] = useState(false);
  const plot = plots.find(item => item.id === scan.plotId);
  const farm = farms.find(item => item.id === (scan.farmId || plot?.farmId));
  const recordedDate = scan.importedFromLegacy && scan.legacyDisplayTime ? scan.legacyDisplayTime : scan.createdAt ? dateLabel(scan.createdAt) : 'Date unavailable';
  function requireConnection() {
    if (browserWorkspace || navigator.onLine) return true;
    onNotify("Connect to the internet to change a check.", 'error');
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
    if (!window.confirm(t("Delete this check and its saved photos? This cannot be undone."))) return;
    setBusy(true);
    try { await deleteScan(scan.id); onNotify("Check deleted."); }
    catch (error) { onNotify(readableError(error), 'error'); setBusy(false); }
  }
  async function handleLink(event) {
    if (!requireConnection()) return;
    const selected = plots.find(item => item.id === event.target.value);
    if (!selected) return;
    setBusy(true);
    try {
      await linkImportedScan(uid, scan.id, selected.id, selected.farmId);
      onNotify("Check linked to growing area.");
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  const detectionOnly = isDetectionOnly(scan);
  const assessment = scanAssessment(scan.topClass, scan.isPhotoOnly, detectionOnly);
  const nextScan = onScanAnother && <button className="button button-primary" type="button" disabled={busy} onClick={onScanAnother}>
    <ImagePlus size={18} aria-hidden="true" />{t(scan.isPhotoOnly ? 'Add another photo' : 'Scan another image')}
  </button>;
  const header = <>
    <div className="scan-card-top">
      {compact && scan.hasPhotos && scan.preparedImagePath ? <div className="scan-thumbnail"><PrivateImage path={scan.preparedImagePath} provider={scan.storageProvider} alt={t("Saved pineapple sample")} /></div> : <div className="scan-icon"><ScanLine size={22} /></div>}
      <div className="scan-card-title">
        <div className="scan-title-line"><h3>{t(assessment.title)}</h3></div>
        <ScanResultIndicators statusType={scan.statusType} label={scan.statusLabel}
          confidence={detectionOnly ? null : scan.topConfidence} photoOnly={scan.isPhotoOnly} />
        <p className="scan-context"><span>{t(recordedDate)}</span><span>{farm ? `${farm.name} · ` : ''}{plot?.name || t("Unassigned")}</span></p>
      </div>
    </div></>;
  const actions = <>
      <div className="record-actions">
        {!scan.isPhotoOnly && <button className="button button-soft" type="button" disabled={busy || !services.sharing || (!scan.shareForResearch && formatConfidence(scan.topConfidence) === 'Unavailable')} onClick={handleShare}>{busy ? t("Working…") : scan.shareForResearch ? t("Revoke research sharing") : t("Share result for research")}</button>}
        <button className="button button-text danger-text" type="button" disabled={busy || !services.deletion} onClick={handleDelete}><Trash2 size={15} />{t(scan.isPhotoOnly ? 'Delete photo' : 'Delete check')}</button>
      </div>
      {!browserWorkspace && !scan.shareForResearch && formatConfidence(scan.topConfidence) === 'Unavailable' && <p className="helper-text">{t("This result is unavailable for research sharing.")}</p>}
      {(!services.sharing || !services.deletion) && <p className="helper-text">{browserWorkspace ? t(scan.isPhotoOnly ? 'This photo is saved only in this browser.' : "This record is saved only in this browser. Research sharing will require the account service.") : t("Sharing and secure removal are temporarily unavailable. Your saved records remain private.")}</p>}
  </>;
  if (overview) return <article className="scan-card scan-card-overview">
    <div className="scan-result-heading">{header}{nextScan}</div>
    {scan.shareForResearch && <p className="shared-label">{t("Shared for research")}</p>}
    <div className="overview-main scan-result-body">
      <ScanNextStep assessment={assessment} userCondition={scan.userCondition} />
      <div className="overview-photo"><RecordPhoto scan={scan} /></div>
    </div>
    {!scan.isPhotoOnly && !detectionOnly && <RecommendationCard uid={uid} scanId={scan.id}/>}
    {overviewActions}
    <details className="overview-disclosure"><summary>{t("Record actions")}</summary><div>
      {scan.importedFromLegacy && !scan.plotId && <label className="field compact-field"><span>{t("Link this old check to a growing area")}</span><select value="" onChange={handleLink} disabled={busy}><option value="">{t("Select growing area")}</option>{plots.filter(item => !item.archivedAt).map(item => <option key={item.id} value={item.id}>{farms.find(farm => farm.id === item.farmId)?.name || t("Farm")} · {item.name}</option>)}</select></label>}
      {actions}
    </div></details>
  </article>;
  return <article className={`scan-card ${compact ? 'scan-card-compact' : ''}`}>{header}
    <div className="scan-card-footer">
      {scan.shareForResearch && <span className="shared-label">{t("Shared for research")}</span>}
      {open && nextScan}
      <button className="button button-text record-details-button" type="button" aria-label={open ? t("Hide details") : t("View details")} aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => setOpen(value => !value)}>{open ? t("Hide details") : t("View details")}<ChevronDown className={open ? 'rotated' : ''} size={16} /></button>
    </div>
    {open && <div id={detailsId} className="scan-card-expanded">
      {scan.importedFromLegacy && !scan.plotId && <label className="field compact-field"><span>{t("Link this old check to a growing area")}</span><select value="" onChange={handleLink} disabled={busy}><option value="">{t("Select growing area")}</option>{plots.filter(item => !item.archivedAt).map(item => <option key={item.id} value={item.id}>{farms.find(farm => farm.id === item.farmId)?.name || t("Farm")} · {item.name}</option>)}</select></label>}
      <RecordPhoto scan={scan} />
      <ScanNextStep assessment={assessment} userCondition={scan.userCondition} />
      {!scan.isPhotoOnly && !detectionOnly && <RecommendationCard uid={uid} scanId={scan.id} />}
      {actions}
    </div>}
  </article>;
}

export function ObservationCard({ item, compact = false }) {
  return <article className={`observation-card ${compact ? 'observation-compact' : ''}`}>
    <div className={`condition-icon condition-${item.condition}`}><ClipboardList size={18} /></div>
    <div><div className="observation-top"><strong>{t(conditionLabel(item.condition))}</strong><span>{item.observedAt || dateLabel(item.createdAt)}</span></div><p>{item.note}</p></div>
  </article>;
}

export function TaskRow({ task, uid, plotName, onNotify, today = localDateKey(new Date()) }) {
  const [busy, setBusy] = useState(false);
  const state = taskStatus(task, today);
  const overdue = state === 'overdue';
  const stateLabel = { done: 'Done', today: 'Due today', overdue: 'Overdue', upcoming: 'Upcoming', undated: 'No due date' }[state];
  async function toggle() {
    if (!browserWorkspace && !navigator.onLine) { onNotify('Connect to the internet to update a care task.', 'error'); return; }
    setBusy(true);
    try {
      await setTaskCompleted(uid, task, !task.completedAt);
      onNotify(task.completedAt ? 'Task reopened.' : 'Task completed.');
    } catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  return <div className={`task-row ${task.completedAt ? 'task-done' : ''}`}>
    <button className="task-check" type="button" onClick={toggle} disabled={busy} aria-label={`${task.completedAt ? t("Reopen") : t("Complete")} ${task.title}`} aria-pressed={Boolean(task.completedAt)}><span /></button>
    <div className="task-content"><div className="task-title-line"><strong>{task.title}</strong><StatusPill type={overdue ? 'risk' : state === 'today' ? 'monitor' : state === 'done' ? 'healthy' : 'scheduled'}>{t(stateLabel)}</StatusPill></div>{task.note && <p>{task.note}</p>}{plotName && <small>{plotName}</small>}{task.completedAt && <small className="task-completed-date">{t("Completed ")}{dateLabel(task.completedAt)}</small>}</div>
    <span className={`task-date ${overdue ? 'date-overdue' : ''}`}>{t("Due ")}{task.dueDate ? dateLabel(`${task.dueDate}T12:00:00`, { month: 'short', day: 'numeric', year: 'numeric' }) : t("No date")}</span>
  </div>;
}

export function NetworkBanner({ online }) {
  if (online || browserWorkspace) return null;
  return <div className="network-banner" role="status"><CircleAlert size={17} />{t(" You are offline. Photo checks and record changes need a connection.")}</div>;
}

export function LoadingScreen({ text = 'Loading your workspace…' }) {
  return <div className="loading-screen workspace-skeleton" aria-busy="true"><p role="status" aria-live="polite">{t(text)}</p><div className="skeleton skeleton-title" aria-hidden="true" /><div className="skeleton-grid" aria-hidden="true"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div></div>;
}
