import { useState } from 'react';
import { Download, Leaf, ShieldCheck, Trash2, FileClock } from 'lucide-react';
import { browserStore, BROWSER_UID } from './browser-store.js';
import { importLegacyHistory } from './data';
import { getLegacyHistory, readableError } from './utils';

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
    <div className="page-intro"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>Settings</h1><p>Manage appearance and the records saved in this browser.</p></div></div>
    <div className="settings-grid">
      <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><Leaf size={20} /></div><div><h2>Appearance</h2><p>Choose the look that feels right.</p></div></div><div className="theme-options" role="group" aria-label="Color theme">{[['system', 'Device setting'], ['light', 'Light'], ['dark', 'Dark']].map(([value, label]) => <button key={value} className={themePreference === value ? 'selected' : ''} type="button" aria-pressed={themePreference === value} onClick={() => setThemePreference(value)}>{label}</button>)}</div></section>
      <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><ShieldCheck size={20} /></div><div><h2>Browser workspace</h2><p>No account or password is needed. Your existing Firebase account records stay separate.</p></div></div><form className="browser-profile-form" onSubmit={event => { event.preventDefault(); perform(() => browserStore.mutate(state => { state.profile.displayName = name.trim(); }), 'Workspace name saved.'); }}><label className="field"><span>Your name</span><input value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></label><button className="button button-soft" disabled={busy || !name.trim()}>Save name</button></form></section>
      <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><Download size={20} /></div><div><h2>Browser history & backup</h2><p>Farms, plots, scans, photos, observations, and tasks remain here after refreshing or reopening this browser.</p></div></div><p className="settings-detail">{data.scans.length} saved scan/photo records · {data.observations.length} observations · {data.tasks.length} tasks</p><p className="settings-detail">These records belong to this site's storage in this browser. They do not sync to other devices or browsers. Clearing site data, using private browsing, or browser storage cleanup can remove them. Export a backup to keep a separate copy.</p><button className="button button-soft" disabled={busy} type="button" onClick={() => perform(exportBackup, 'Backup download started.')}>Export records & photos</button></section>
      <section className="panel settings-card"><div className="settings-card-head"><div className="settings-icon"><FileClock size={20} /></div><div><h2>Previous browser history</h2><p>Bring in summaries saved by the earlier version on this browser.</p></div></div>{data.profile?.historyImportedAt ? <p className="settings-detail">Previous history was already imported.</p> : history.length ? <button className="button button-soft" disabled={busy} type="button" onClick={() => perform(async () => { await importLegacyHistory(BROWSER_UID, history); setHistory([]); }, 'Previous browser history imported.')}>Import {history.length} summaries</button> : <p className="settings-detail">No previous summaries were found.</p>}</section>
      <section className="panel settings-card"><h2>Scanning & AI recommendations</h2><p className="settings-detail">The photo preview, reports, health guide, farms, observations, and care tasks remain available. The trained model and Gemini require the planned backend deployment. Until then you can save a photo for later without assigning a diagnosis.</p></section>
      <section className="panel settings-card danger-card"><div className="settings-card-head"><div className="settings-icon danger-icon"><Trash2 size={20} /></div><div><h2>Clear browser workspace</h2><p>Remove only this browser's records and photos. Export a backup first. Firebase account data is unaffected.</p></div></div><form className="browser-profile-form" onSubmit={event => { event.preventDefault(); if (confirmation !== 'CLEAR') return; perform(async () => { await browserStore.reset(); setName('Grower'); setConfirmation(''); }, 'Browser workspace cleared.'); }}><label className="field"><span>Type CLEAR to confirm</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></label><button className="button button-danger" disabled={busy || confirmation !== 'CLEAR'}>Clear browser records & photos</button></form></section>
    </div>
  </div>;
}
