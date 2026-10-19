import { t } from './i18n.js';
import { useEffect, useId, useState } from 'react';
import { Camera, ChevronDown, CircleAlert, ClipboardList, ImageOff, Leaf, LoaderCircle, ScanLine, Sprout, Trash2 } from 'lucide-react';
import { deleteScan, fetchPrivateImage, linkImportedScan, revokeScan, setTaskCompleted, shareScan } from './data';
import { conditionLabel, dateLabel, readableError, statusLabel } from './utils';
import { useWorkspaceServices } from './services';
import { classifyCondition } from './conditions';
import { localDateKey, taskStatus } from './activity';
import RecommendationCard from './Recommendations.jsx';
import { formatConfidence } from './recommendation-utils.js';
import { browserWorkspace } from './firebase';

export function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-mark"><Sprout size={27} strokeWidth={1.6} /></span>
    <span className="brand-word">{t("agri")}<span>{t("vision.")}</span><small>{t("Pineapple health")}</small></span>
  </div>;
}

export function StatusPill({ type = 'monitor', children }) {
  return <span className={`status-pill status-${type}`}>{t(children)}</span>;
}

export function ConditionBadge({ label }) {
  const condition = classifyCondition(label);
  return <span className={`condition-badge type-${condition.type}`} title={t(condition.description)}>{t(condition.label)}</span>;
}

export function ConfidenceHelp() {
  return <details className="confidence-help"><summary>{t("About confidence and condition types")}</summary><p>{t("Model confidence shows how strongly the image matches a trained class. It is not the chance that the plant has a disease and does not confirm a diagnosis. Unavailable means no valid confidence was saved.")}</p><p>{t("Pathological diseases are associated with pathogens. Physiological disorders concern plant growth or development. The scanner recognizes seven classes; other conditions may need assessment by an agricultural professional.")}</p></details>;
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
  if (!path) return <div className="image-placeholder"><ImageOff size={25} />{t(" No saved photo")}</div>;
  if (error) return <div className="image-placeholder"><ImageOff size={25} /> {t(error)}</div>;
  if (!url) return <div className="image-placeholder"><LoaderCircle className="spin" size={25} />{t(" Loading photo")}</div>;
  return <img className="record-photo" src={url} alt={alt} />;
}

export function PredictionDetails({ scan, showPhotos = false }) {
  return <div className="prediction-details">
    {showPhotos && <div className="photo-pair">
      <div><span className="field-label">{t("Uploaded image")}</span><PrivateImage path={scan.preparedImagePath} provider={scan.storageProvider} alt={t("Prepared pineapple image")} /></div>
      {!scan.isPhotoOnly && <div><span className="field-label">{t("Annotated result")}</span><PrivateImage path={scan.annotatedImagePath} provider={scan.storageProvider} alt={t("Pineapple check with model annotations")} /></div>}
    </div>}
    {scan.message && <p>{t(scan.message)}</p>}
    {scan.recommendation && <p className="recommendation"><strong>{scan.isPhotoOnly ? t("Suggested next step") : t("Scanner’s suggested next step")}</strong><br />{t(scan.recommendation)}</p>}
    <div className="detail-grid">
      <div><span>{t("Condition type")}</span><strong><ConditionBadge label={scan.topClass} /></strong></div>
      <div><span>{t("Model version")}</span><strong>{scan.isPhotoOnly ? t("Not run") : scan.modelVersion || t("Unknown")}</strong></div>
      <div><span>{t("Detections")}</span><strong>{scan.isPhotoOnly ? t("Not analyzed") : scan.detectionCount ?? 0}</strong></div>
      <div><span>{t("Reported condition")}</span><strong>{t(conditionLabel(scan.userCondition))}</strong></div>
      <div><span>{t("Preprocessing")}</span><strong>{Number.isFinite(scan.preprocessingSummary?.segmentation_mask_coverage_percent) ? t("{value0}% mask coverage", { value0: scan.preprocessingSummary.segmentation_mask_coverage_percent }) : t("Not saved")}</strong></div>
    </div>
    {Array.isArray(scan.detections) && scan.detections.length > 0 && <div className="detail-list">
      <h4>{t("Detected regions")}</h4>
      {scan.detections.map((item, index) => <div key={index} className="detail-row">
        <span>#{index + 1} {item.pretty_class_name || item.class_name || t("Region")} <ConditionBadge label={item.pretty_class_name || item.class_name} /></span>
        <span>{formatConfidence(item.efficientnet_confidence_percent)}{t(" model confidence")}</span>
      </div>)}
    </div>}
    {Array.isArray(scan.preprocessingSteps) && scan.preprocessingSteps.length > 0 && <div className="detail-list">
      <h4>{t("Image preparation")}</h4>
      {scan.preprocessingSteps.map((step, index) => <div key={index} className="detail-row">
        <span>{step.name || t("Step {value0}", { value0: index + 1 })}</span><span>{step.used_for || ''}</span>
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
  return <article className={`scan-card ${compact ? 'scan-card-compact' : ''}`}>
    <div className="scan-card-top">
      {compact && scan.hasPhotos && scan.preparedImagePath ? <div className="scan-thumbnail"><PrivateImage path={scan.preparedImagePath} provider={scan.storageProvider} alt={t("Saved pineapple sample")} /></div> : <div className="scan-icon"><ScanLine size={22} /></div>}
      <div className="scan-card-title">
        <div className="scan-title-line"><h3>{t(scan.topClass || "Check result")}</h3><StatusPill type={scan.statusType}>{t(statusLabel(scan))}</StatusPill></div>
        <ConditionBadge label={scan.topClass} />
        <p className="scan-context"><span>{t(recordedDate)}</span><span>{farm ? `${farm.name} · ` : ''}{plot?.name || t("Unassigned")}</span></p>
      </div>
    </div>
    <div className="scan-card-footer">
      <div className="scan-stats"><span><strong>{scan.isPhotoOnly ? t("Pending") : formatConfidence(scan.topConfidence)}</strong><span>{scan.isPhotoOnly ? t("Model analysis") : t("Model confidence")}</span></span><span><strong>{scan.isPhotoOnly ? t("Saved") : scan.detectionCount ?? 0}</strong><span>{scan.isPhotoOnly ? t("Photo record") : t("Detected regions")}</span></span>{scan.shareForResearch && <span className="shared-label">{t("Shared for research")}</span>}</div>
      <button className="button button-soft record-details-button" type="button" aria-label={open ? t("Hide details") : t("View details")} aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => setOpen(value => !value)}>{open ? t("Hide details") : t("View details")}<ChevronDown className={open ? 'rotated' : ''} size={16} /></button>
    </div>
    {open && <div id={detailsId} className="scan-card-expanded">
      {scan.importedFromLegacy && !scan.plotId && <label className="field compact-field"><span>{t("Link this old check to a growing area")}</span><select value="" onChange={handleLink} disabled={busy}><option value="">{t("Select growing area")}</option>{plots.filter(item => !item.archivedAt).map(item => <option key={item.id} value={item.id}>{farms.find(farm => farm.id === item.farmId)?.name || t("Farm")} · {item.name}</option>)}</select></label>}
      {scan.importedFromLegacy && <p className="callout subtle"><CircleAlert size={17} />{t(" Imported from this browser. This record has no saved photos or detailed model output.")}</p>}
      <ConfidenceHelp />
      <PredictionDetails scan={scan} showPhotos={Boolean(scan.hasPhotos)} />
      <RecommendationCard uid={uid} scanId={scan.id} />
      <div className="record-actions">
        <button className="button button-soft" type="button" disabled={busy || !services.sharing || (!scan.shareForResearch && formatConfidence(scan.topConfidence) === 'Unavailable')} onClick={handleShare}>{busy ? t("Working…") : scan.shareForResearch ? t("Revoke research sharing") : t("Share result for research")}</button>
        <button className="button button-text danger-text" type="button" disabled={busy || !services.deletion} onClick={handleDelete}><Trash2 size={15} />{t(" Delete check")}</button>
      </div>
      {!browserWorkspace && !scan.shareForResearch && formatConfidence(scan.topConfidence) === 'Unavailable' && <p className="helper-text">{t("Research sharing requires a valid model confidence value. This check can still be reviewed and deleted.")}</p>}
      {(!services.sharing || !services.deletion) && <p className="helper-text">{browserWorkspace ? t("This record is saved only in this browser. Research sharing will require the account service.") : t("Sharing and secure removal are temporarily unavailable. Your saved records remain private.")}</p>}
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
