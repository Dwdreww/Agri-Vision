import { browserStore, recordCollections } from './browser-store.js';
import { numericConfidence } from './confidence.js';

export const collectionNames = recordCollections;
export const watchAccount = (_uid, onChange, onError) => browserStore.subscribe(onChange, onError);
export const createFarm = (_uid, fields) => browserStore.insert('farms', { name: fields.name.trim(), notes: fields.notes?.trim() || '', archivedAt: null });
export const createPlot = (_uid, fields) => browserStore.insert('plots', { farmId: fields.farmId, name: fields.name.trim(), variety: fields.variety?.trim() || '', plantedAt: fields.plantedAt || '', notes: fields.notes?.trim() || '', archivedAt: null });
export const updateFarm = (_uid, id, fields) => browserStore.update('farms', id, { name: fields.name.trim(), notes: fields.notes?.trim() || '' });
export const updatePlot = (_uid, id, fields) => browserStore.update('plots', id, { name: fields.name.trim(), variety: fields.variety?.trim() || '', plantedAt: fields.plantedAt || '', notes: fields.notes?.trim() || '' });
export const archiveFarm = (_uid, id) => browserStore.update('farms', id, { archivedAt: new Date().toISOString() });
export const archivePlot = (_uid, id) => browserStore.update('plots', id, { archivedAt: new Date().toISOString() });
export const createObservation = (_uid, fields) => browserStore.insert('observations', { plotId: fields.plotId, observedAt: fields.observedAt, condition: fields.condition, note: fields.note.trim() });
export const createTask = (_uid, fields) => browserStore.insert('tasks', { plotId: fields.plotId, title: fields.title.trim(), dueDate: fields.dueDate, note: fields.note?.trim() || '', completedAt: null });
export const setTaskCompleted = (_uid, task, completed) => browserStore.update('tasks', task.id, { completedAt: completed ? new Date().toISOString() : null });

function resultBlob(dataUrl) {
  if (!dataUrl?.startsWith('data:image/jpeg;base64,')) return null;
  return new Blob([Uint8Array.from(atob(dataUrl.split(',')[1]), character => character.charCodeAt(0))], { type: 'image/jpeg' });
}
export function saveScan(_uid, id, plotId, farmId, preparedFile, prediction, userCondition) {
  return browserStore.saveScan(id, { plotId, farmId,
    statusLabel: prediction.status_label || 'Monitor', statusType: prediction.status_type || 'monitor',
    topClass: prediction.top_class || 'No Detection', topConfidence: numericConfidence(prediction.top_confidence),
    detectionCount: Number(prediction.detection_count) || 0, detections: prediction.detections || [],
    preprocessingSteps: prediction.preprocessing_steps || [], preprocessingSummary: prediction.preprocessing_summary || {},
    message: prediction.message || '', recommendation: prediction.recommendation || '',
    modelVersion: prediction.model_version || 'unknown', imageWidth: Number(prediction.image_width) || 0,
    imageHeight: Number(prediction.image_height) || 0, userCondition: userCondition || null,
    importedFromLegacy: false, isPhotoOnly: Boolean(prediction.is_photo_only)
  }, preparedFile, resultBlob(prediction.annotated_image));
}
export const deleteScan = id => browserStore.deleteScan(id);
export const deleteAccount = () => browserStore.reset();
export const fetchPrivateImage = (path, provider) => provider === 'browser' ? browserStore.getPhoto(path) : Promise.reject(new Error('This photo belongs to an account workspace.'));
export const cleanupUnsavedScan = async () => {}; // Photos and records are atomic in IndexedDB.
export const linkImportedScan = (_uid, id, plotId, farmId) => browserStore.update('scans', id, { plotId, farmId });
export const shareScan = async () => { throw new Error('Research sharing requires the account service.'); };
export const revokeScan = shareScan;
export function importLegacyHistory(_uid, rows) {
  return browserStore.mutate(state => {
    if (state.profile.historyImportedAt) throw new Error('Browser history was already imported.');
    for (const row of rows.slice(0, 12)) state.scans.push({ id: crypto.randomUUID(), plotId: null, farmId: null,
      topClass: typeof row.topClass === 'string' ? row.topClass.slice(0, 100) : 'Unknown',
      topConfidence: numericConfidence(row.confidence), statusType: ['healthy', 'risk', 'monitor'].includes(row.type) ? row.type : 'monitor',
      statusLabel: typeof row.label === 'string' ? row.label.slice(0, 80) : 'Legacy scan',
      detectionCount: Math.max(0, Number(row.detections) || 0), modelVersion: 'legacy-unknown',
      hasPhotos: false, importedFromLegacy: true, shareForResearch: false,
      createdAt: Number.isNaN(new Date(row.time).getTime()) ? new Date().toISOString() : new Date(row.time).toISOString() });
    state.profile.historyImportedAt = new Date().toISOString();
  });
}
