import { doc, getDocFromServer, runTransaction, Timestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { executeGuestImport } from './guest-import.js';

export async function importIntoAccount(uid, plan, onProgress, signal) {
  function assertAccount() {
    if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError');
    if (!auth.currentUser || auth.currentUser.uid !== uid) throw new Error('Sign in to the selected account before importing.');
  }
  async function photos(id, prepared, annotated) {
    assertAccount();
    const token = await auth.currentUser.getIdToken();
    assertAccount();
    const body = new FormData();body.append('prepared',prepared,'prepared.jpg');body.append('annotated',annotated,'annotated.jpg');
    const response = await fetch(`/api/workspace/scans/${id}/photos`, { method:'POST',headers:{Authorization:`Bearer ${token}`},body,signal });
    const result = await response.json().catch(()=>null);
    if (!response.ok) throw new Error(result?.error || 'This photo could not be imported. You can select the same backup to resume.');
    return { storageProvider:'vercel-blob',preparedImagePath:`users/${uid}/scans/${id}/prepared.jpg`,annotatedImagePath:`users/${uid}/scans/${id}/annotated.jpg`,photoChecksums:result.checksums || {} };
  }
  return executeGuestImport(plan, {
    assertAccount,
    exists: async (collection,id) => { assertAccount();return (await getDocFromServer(doc(db,'users',uid,collection,id))).exists(); },
    upload: photos,
    async create(collection,id,fields) {
      assertAccount();
      const ref=doc(db,'users',uid,collection,id);
      const data={...fields};
      for(const key of ['createdAt','updatedAt','archivedAt','completedAt'])if(typeof data[key]==='string')data[key]=Timestamp.fromDate(new Date(data[key]));
      try {
        return await runTransaction(db,async transaction=>{const existing=await transaction.get(ref);assertAccount();if(existing.exists())return false;transaction.set(ref,data);return true;});
      } catch(error) {
        // A lost acknowledgement must not turn a safe retry into an overwrite.
        const existing=await getDocFromServer(ref).catch(()=>null);
        if(existing?.exists())return false;
        throw error;
      }
    }
  },onProgress);
}
