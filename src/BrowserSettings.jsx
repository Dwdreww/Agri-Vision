import { t } from './i18n.js';
import { useState } from 'react';
import { Download, Leaf, ShieldCheck, Trash2, FileClock } from 'lucide-react';
import { browserStore, BROWSER_UID } from './browser-store.js';
import { importLegacyHistory } from './data';
import { getLegacyHistory, readableError } from './utils';
import { LanguageSettings } from './Language.jsx';

const blobUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

export default function BrowserSettingsView({ data, themePreference, setThemePreference, onNotify }) {
  const [name, setName] = useState(data.profile?.displayName || 'Grower');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [history, setHistory] = useState(getLegacyHistory);
  async function perform(action, success) {
    setBusy(true);
    try { await action(); onNotify(success); }
    catch (error) { onNotify(readableError(error), 'error'); }
    finally { setBusy(false); }
  }
  async function exportBackup() {
    const backup = await browserStore.backup();
    const photos = await Promise.all(backup.photos.map(async photo => ({ path: photo.path, dataUrl: await blobUrl(photo.blob) })));
    const file = new Blob([JSON.stringify({ format: 'agri-vision-browser-backup', version: 1, exportedAt: new Date().toISOString(), workspace: backup.workspace, photos }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `agri-vision-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="view settings-view">
    <div className="page-intro"><div><span className="eyebrow">{t("YOUR WORKSPACE")}</span><h1>{t("Settings")}</h1><p>{t("Manage appearance and the records saved in this browser.")}</p></div></div>
    <div className="settings-grid"><LanguageSettings />
      <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><Leaf size={20} /></div><div><h2>{t("Appearance")}</h2><p>{t("Choose the look that feels right.")}</p></div></div><div className="theme-options" role="group" aria-label={t("Color theme")}>{[['system', 'Device setting'], ['light', 'Light'], ['dark', 'Dark']].map(([value, label]) => <button key={value} className={themePreference === value ? 'selected' : ''} type="button" aria-pressed={themePreference === value} onClick={() => setThemePreference(value)}>{t(label)}</button>)}</div></section>
      <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><ShieldCheck size={20} /></div><div><h2>{t("Browser workspace")}</h2><p>{t("No account or password is needed. Records saved in a signed-in account stay separate.")}</p></div></div><form className="browser-profile-form" onSubmit={event => { event.preventDefault(); perform(() => browserStore.mutate(state => { state.profile.displayName = name.trim(); }), 'Workspace name saved.'); }}><label className="field"><span>{t("Your name")}</span><input value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></label><button className="button button-soft" disabled={busy || !name.trim()}>{t("Save name")}</button></form></section>
      <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><Download size={20} /></div><div><h2>{t("Browser history & backup")}</h2><p>{t("Farms, growing areas, checks, photos, field notes, and tasks remain here after refreshing or reopening this browser.")}</p></div></div><p className="settings-detail">{data.scans.length}{t(" saved check/photo records · ")}{data.observations.length}{t(" field notes · ")}{data.tasks.length}{t(" tasks")}</p><p className="settings-detail">{t("These records belong to this site's storage in this browser. They do not sync to other devices or browsers. Clearing site data, using private browsing, or browser storage cleanup can remove them. Export a backup to keep a separate copy.")}</p><button className="button button-soft" disabled={busy} type="button" onClick={() => perform(exportBackup, 'Backup download started.')}>{t("Export records & photos")}</button></section>
      <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><FileClock size={20} /></div><div><h2>{t("Previous browser history")}</h2><p>{t("Bring in summaries saved by the earlier version on this browser.")}</p></div></div>{data.profile?.historyImportedAt ? <p className="settings-detail">{t("Previous history was already imported.")}</p> : history.length ? <button className="button button-soft" disabled={busy} type="button" onClick={() => perform(async () => { await importLegacyHistory(BROWSER_UID, history); setHistory([]); }, 'Previous browser history imported.')}>{t("Import ")}{history.length}{t(" summaries")}</button> : <p className="settings-detail">{t("No previous summaries were found.")}</p>}</section>
      <section className="panel settings-card"><h2>{t("Scanning & AI recommendations")}</h2><p className="settings-detail">{t("Photo analysis and optional AI advice are not available in guest mode. You can save a photo as Not analyzed, write field notes, and plan care tasks. Open History to find them again.")}</p></section>
      <section className="panel settings-card danger-card"><div className="settings-card-head"><div className="settings-icon danger-icon"><Trash2 size={20} /></div><div><h2>{t("Clear browser workspace")}</h2><p>{t("Remove only this browser's records and photos. Export a backup first. Records in your signed-in account are kept.")}</p></div></div><form className="browser-profile-form" onSubmit={event => { event.preventDefault(); if (confirmation !== 'CLEAR') return; perform(async () => { await browserStore.reset(); setName('Grower'); setConfirmation(''); }, 'Browser workspace cleared.'); }}><label className="field"><span>{t("Type CLEAR to confirm")}</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></label><button className="button button-danger" disabled={busy || confirmation !== 'CLEAR'}>{t("Clear browser records & photos")}</button></form></section>
    </div>
  </div>;
}
