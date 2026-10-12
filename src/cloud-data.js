import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions, storage, workspaceMode } from './firebase';
import { numericConfidence } from './confidence';

async function workspaceRequest(path, { method = 'POST', body, blob = false } = {}) {
  if (!auth.currentUser) throw new Error('Sign in to continue.');
  const token = await auth.currentUser.getIdToken();
  const form = body instanceof FormData;
  const response = await fetch(`/api/workspace/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(!form && body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: form ? body : JSON.stringify(body) } : {})
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'The workspace service is unavailable. Please try again.');
  }
  return blob ? response.blob() : response.json();
}

function serverAction(name, data) {
  if (workspaceMode === 'local') return workspaceRequest(`actions/${name}`, { body: data });
  if (workspaceMode !== 'firebase') throw new Error('This workspace action is not enabled yet.');
  return httpsCallable(functions, name)(data);
}

export const collectionNames = ['farms', 'plots', 'scans', 'observations', 'tasks'];

export function userCollection(uid, name) {
  return collection(db, 'users', uid, name);
}

export function userDocument(uid, name, id) {
  return doc(db, 'users', uid, name, id);
}

export function watchAccount(uid, onChange, onError) {
  const data = { profile: null, farms: [], plots: [], scans: [], observations: [], tasks: [] };
  const ready = new Set();
  const emit = () => onChange({ ...data, ready: ready.size === collectionNames.length + 1 });
  const unsubscribers = [
    onSnapshot(doc(db, 'users', uid), snapshot => {
      data.profile = snapshot.exists() ? snapshot.data() : null;
      ready.add('profile');
      emit();
    }, onError)
  ];

  for (const name of collectionNames) {
    unsubscribers.push(onSnapshot(userCollection(uid, name), snapshot => {
      data[name] = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      ready.add(name);
      emit();
    }, onError));
  }
  return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}

export async function createFarm(uid, fields) {
  const item = doc(userCollection(uid, 'farms'));
  await setDoc(item, {
    name: fields.name.trim(),
    notes: fields.notes?.trim() || '',
    archivedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return item.id;
}

export async function createPlot(uid, fields) {
  const item = doc(userCollection(uid, 'plots'));
  await setDoc(item, {
    farmId: fields.farmId,
    name: fields.name.trim(),
    variety: fields.variety?.trim() || '',
    plantedAt: fields.plantedAt || '',
    notes: fields.notes?.trim() || '',
    archivedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return item.id;
}

export function updateFarm(uid, id, fields) {
  return updateDoc(userDocument(uid, 'farms', id), {
    name: fields.name.trim(),
    notes: fields.notes?.trim() || '',
    updatedAt: serverTimestamp()
  });
}

export function updatePlot(uid, id, fields) {
  return updateDoc(userDocument(uid, 'plots', id), {
    name: fields.name.trim(),
    variety: fields.variety?.trim() || '',
    plantedAt: fields.plantedAt || '',
    notes: fields.notes?.trim() || '',
    updatedAt: serverTimestamp()
  });
}

export function archiveFarm(uid, id) {
  return updateDoc(userDocument(uid, 'farms', id), { archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export function archivePlot(uid, id) {
  return updateDoc(userDocument(uid, 'plots', id), { archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export function createObservation(uid, fields) {
  return setDoc(doc(userCollection(uid, 'observations')), {
    plotId: fields.plotId,
    observedAt: fields.observedAt,
    condition: fields.condition,
    note: fields.note.trim(),
    createdAt: serverTimestamp()
  });
}

export function createTask(uid, fields) {
  return setDoc(doc(userCollection(uid, 'tasks')), {
    plotId: fields.plotId,
    title: fields.title.trim(),
    dueDate: fields.dueDate,
    note: fields.note?.trim() || '',
    completedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export function setTaskCompleted(uid, task, completed) {
  return updateDoc(userDocument(uid, 'tasks', task.id), {
    completedAt: completed ? serverTimestamp() : null,
    updatedAt: serverTimestamp()
  });
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl?.startsWith('data:image/jpeg;base64,')) {
    throw new Error('The scanner did not return a JPEG result image.');
  }
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: 'image/jpeg' });
}

export async function saveScan(uid, scanId, plotId, farmId, preparedFile, prediction, userCondition) {
  const basePath = `users/${uid}/scans/${scanId}`;
  const preparedImagePath = `${basePath}/prepared.jpg`;
  const annotatedImagePath = `${basePath}/annotated.jpg`;
  const scanRef = userDocument(uid, 'scans', scanId);
  const existing = await getDocFromServer(scanRef);
  if (existing.exists()) return scanId;
  let recordWriteStarted = false;
  try {
    if (workspaceMode === 'local') {
      const photos = new FormData();
      photos.append('prepared', preparedFile, 'prepared.jpg');
      photos.append('annotated', dataUrlToBlob(prediction.annotated_image), 'annotated.jpg');
      await workspaceRequest(`scans/${scanId}/photos`, { body: photos });
    } else if (workspaceMode === 'firebase') {
      await uploadBytes(ref(storage, preparedImagePath), preparedFile, { contentType: 'image/jpeg' });
      await uploadBytes(ref(storage, annotatedImagePath), dataUrlToBlob(prediction.annotated_image), { contentType: 'image/jpeg' });
    } else throw new Error('Photo saving is not enabled in this workspace yet.');
    recordWriteStarted = true;
    await setDoc(scanRef, {
    plotId,
    farmId,
    statusLabel: prediction.status_label || 'Monitor',
    statusType: prediction.status_type || 'monitor',
    topClass: prediction.top_class || 'No Detection',
    topConfidence: numericConfidence(prediction.top_confidence),
    detectionCount: Number(prediction.detection_count) || 0,
    detections: Array.isArray(prediction.detections) ? prediction.detections : [],
    preprocessingSteps: Array.isArray(prediction.preprocessing_steps) ? prediction.preprocessing_steps : [],
    preprocessingSummary: prediction.preprocessing_summary || {},
    message: prediction.message || '',
    recommendation: prediction.recommendation || '',
    modelVersion: prediction.model_version || 'unknown',
    imageWidth: Number(prediction.image_width) || 0,
    imageHeight: Number(prediction.image_height) || 0,
    preparedImagePath,
    annotatedImagePath,
    storageProvider: workspaceMode === 'local' ? 'local' : 'firebase',
    hasPhotos: true,
    importedFromLegacy: false,
    userCondition: userCondition || null,
    shareForResearch: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    // A lost acknowledgement may mean the record exists. Never remove its photos.
    if (recordWriteStarted) {
      try {
        const confirmed = await getDocFromServer(scanRef);
        if (confirmed.exists()) return scanId;
      } catch { throw error; }
    }
    if (workspaceMode === 'local') {
      await workspaceRequest(`scans/${scanId}/photos`, { method: 'DELETE' }).catch(() => {});
    } else if (workspaceMode === 'firebase') {
      await Promise.allSettled([
        deleteObject(ref(storage, preparedImagePath)),
        deleteObject(ref(storage, annotatedImagePath))
      ]);
    }
    throw error;
  }
  return scanId;
}

export function shareScan(scanId) {
  return serverAction('shareScanResult', { scanId });
}

export function revokeScan(scanId) {
  return serverAction('revokeScanResult', { scanId });
}

export function deleteScan(scanId) {
  return serverAction('deleteScan', { scanId });
}

export function deleteAccount() {
  return serverAction('deleteAccount', { confirm: true });
}

export function linkImportedScan(uid, scanId, plotId, farmId) {
  return updateDoc(userDocument(uid, 'scans', scanId), { plotId, farmId, updatedAt: serverTimestamp() });
}

export async function importLegacyHistory(uid, rows) {
  const profile = await getDocFromServer(doc(db, 'users', uid));
  if (profile.data()?.historyImportedAt) throw new Error('This account already imported browser history.');
  const batch = writeBatch(db);
  for (const row of rows.slice(0, 12)) {
    const parsed = new Date(row.time);
    const createdAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    batch.set(doc(userCollection(uid, 'scans')), {
      plotId: null,
      farmId: null,
      statusLabel: typeof row.label === 'string' ? row.label.slice(0, 80) : 'Legacy scan',
      statusType: ['healthy', 'risk', 'monitor'].includes(row.type) ? row.type : 'monitor',
      topClass: typeof row.topClass === 'string' ? row.topClass.slice(0, 100) : 'Unknown',
      topConfidence: numericConfidence(row.confidence),
      detectionCount: Math.max(0, Number(row.detections) || 0),
      detections: [],
      preprocessingSteps: [],
      preprocessingSummary: {},
      message: '',
      recommendation: '',
      modelVersion: 'legacy-unknown',
      hasPhotos: false,
      importedFromLegacy: true,
      legacyDisplayTime: typeof row.time === 'string' ? row.time.slice(0, 100) : '',
      userCondition: null,
      shareForResearch: false,
      createdAt: Timestamp.fromDate(createdAt)
    });
  }
  batch.set(doc(db, 'users', uid), { historyImportedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}

export function fetchPrivateImage(path, provider) {
  if (provider === 'local') {
    const match = /^users\/([^/]+)\/scans\/([A-Za-z0-9_-]{1,128})\/(prepared|annotated)\.jpg$/.exec(path || '');
    if (!match || match[1] !== auth.currentUser?.uid) return Promise.reject(new Error('Your account does not have access to this photo.'));
    return workspaceRequest(`photos/${match[2]}/${match[3]}.jpg`, { method: 'GET', blob: true });
  }
  return getBlob(ref(storage, path));
}

export async function cleanupUnsavedScan(uid, scanId) {
  if (!scanId) return;
  // Only delete after the server confirms there is no scan record for these files.
  const confirmed = await getDocFromServer(userDocument(uid, 'scans', scanId));
  if (confirmed.exists()) return;
  if (workspaceMode === 'local') {
    await workspaceRequest(`scans/${scanId}/photos`, { method: 'DELETE' });
    return;
  }
  if (workspaceMode !== 'firebase') return;
  const basePath = `users/${uid}/scans/${scanId}`;
  await Promise.allSettled([
    deleteObject(ref(storage, `${basePath}/prepared.jpg`)),
    deleteObject(ref(storage, `${basePath}/annotated.jpg`))
  ]);
}
