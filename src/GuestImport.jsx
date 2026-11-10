import { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle2, LoaderCircle } from 'lucide-react';
import { t } from './i18n.js';
import { workspaceMode } from './firebase.js';
import { planGuestImport, MAX_BACKUP_BYTES } from './guest-import.js';
import { importIntoAccount } from './guest-import-account.js';

export default function GuestImport({ user, available, onNotify }) {
  const fileInput=useRef(null), controller=useRef(null);
  const [plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[progress,setProgress]=useState(null);
  useEffect(()=>()=>controller.current?.abort(),[user.uid]);
  if(workspaceMode!=='cloud')return null;
  async function choose(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setError('');setResult(null);setPlan(null);setBusy(true);
    try{if(file.size>MAX_BACKUP_BYTES)throw new Error('Choose a backup smaller than 50 MB.');setPlan(await planGuestImport(await file.text()));}
    catch(issue){setError(issue.message);}finally{setBusy(false);}
  }
  async function importBackup(){
    if(!plan||busy)return;setBusy(true);setError('');controller.current=new AbortController();
    try{const result=await importIntoAccount(user.uid,plan,setProgress,controller.current.signal);setResult(result);setPlan(null);onNotify('Guest history imported into this account.');}
    catch(issue){if(issue.name!=='AbortError')setError(issue.message);}
    finally{setBusy(false);}
  }
  return <section className="panel settings-card guest-import-card"><div className="settings-card-head"><div className="settings-icon"><Upload size={21}/></div><h2>{t('Import guest backup')}</h2></div>
    <p>{t('Move photos, growing areas, field notes, and care tasks from a guest backup into your private account.')}</p>
    <p className="helper-text">{t('In guest Settings, choose Export records & photos. Then sign in and select that JSON backup here.')}</p>
    <input hidden ref={fileInput} type="file" accept="application/json,.json" onChange={choose} disabled={busy}/>
    {!plan&&<button className="button button-soft" type="button" disabled={busy||!available} onClick={()=>fileInput.current?.click()}><Upload size={17}/>{t(busy?'Reading backup…':'Choose guest backup')}</button>}
    {plan&&<div className="guest-import-preview"><strong>{t('Import into this account')}</strong><p>{user.displayName||user.email}<br/><small>{user.email}</small></p><dl>{[['Farms',plan.counts.farms],['Growing areas',plan.counts.plots],['Photos',plan.photos],['Field notes',plan.counts.observations],['Care tasks',plan.counts.tasks]].map(([label,count])=><div key={label}><dt>{t(label)}</dt><dd>{count}</dd></div>)}</dl><p className="helper-text">{t('Existing account records stay unchanged. Importing the same backup again skips records already imported. Your original guest backup is kept.')}</p><div className="recommendation-actions"><button className="button button-primary" disabled={busy||!available} onClick={importBackup}>{busy&&<LoaderCircle size={16} className="spin"/>}{t(busy?'Importing…':'Import into my account')}</button><button className="button button-text" disabled={busy} onClick={()=>setPlan(null)}>{t('Cancel')}</button></div></div>}
    {busy&&progress&&<p role="status">{t('Imported {done} of {total} records.',{done:progress.completed,total:progress.total})}</p>}
    {result&&<p className="guest-import-complete" role="status"><CheckCircle2 size={18}/>{t('{imported} records imported. {skipped} already present.',result)}</p>}
    {error&&<p className="inline-error" role="alert">{t(error)}</p>}
  </section>;
}
