// Pure planning/execution code. A backup never chooses its destination account.
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const collections = ['farms', 'plots', 'scans', 'observations', 'tasks'];
const idPattern = /^[A-Za-z0-9_-]{1,80}$/;
const text = (value, maximum = 1000) => typeof value === 'string' ? value.slice(0, maximum) : '';
const fail = message => { throw new Error(message); };
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function decodePhoto(value) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value || '');
  if (!match) fail('The backup contains an unsupported photo. Use a guest backup exported by AgriVision.');
  let bytes;
  try { bytes = Uint8Array.from(atob(match[1]), character => character.charCodeAt(0)); }
  catch { fail('A photo in this backup could not be read.'); }
  if (bytes.length < 3 || bytes.length > 2 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) fail('A photo in this backup is invalid or larger than 2 MB.');
  return new Blob([bytes], { type: 'image/jpeg' });
}

export async function planGuestImport(contents) {
  if (new TextEncoder().encode(contents).byteLength > MAX_BACKUP_BYTES) fail('Choose a backup smaller than 50 MB.');
  let backup;
  try { backup = JSON.parse(contents); } catch { fail('This backup could not be read. Choose the JSON file exported from guest Settings.'); }
  if (backup?.format !== 'agri-vision-browser-backup' || backup.version !== 1 || !backup.workspace || !Array.isArray(backup.photos)) fail('Choose an AgriVision guest backup exported from Settings.');
  const workspace = backup.workspace;
  if (!date(workspace.profile?.createdAt)) fail('This backup is missing its original workspace date.');
  for (const collection of collections) {
    if (!Array.isArray(workspace[collection]) || workspace[collection].length > 5000) fail('The backup has an invalid record list.');
    const ids = new Set();
    for (const record of workspace[collection]) {
      if (!record || !idPattern.test(record.id) || ids.has(record.id)) fail('The backup contains invalid or repeated record identifiers.');
      ids.add(record.id);
    }
  }
  const namespace = (await digest(workspace.profile.createdAt)).slice(0, 16);
  const destination = (collection, id) => `guest-${namespace}-${collection}-${id}`;
  const farms = new Set(workspace.farms.map(item => item.id));
  const plots = new Map(workspace.plots.map(item => [item.id, item]));
  for (const plot of workspace.plots) if (!farms.has(plot.farmId)) fail('A growing area in this backup has no matching farm.');
  for (const kind of ['scans', 'observations', 'tasks']) for (const item of workspace[kind]) {
    if ((item.plotId || kind !== 'scans') && !plots.has(item.plotId)) fail('A record in this backup has no matching growing area.');
  }
  const photos = new Map();
  for (const photo of backup.photos) {
    if (!/^browser\/scans\/[A-Za-z0-9_-]{1,80}\/(prepared|annotated)\.jpg$/.test(photo?.path || '') || photos.has(photo.path)) fail('The backup contains an invalid or repeated photo path.');
    photos.set(photo.path, photo.dataUrl);
  }
  const common = item => ({ createdAt: date(item.createdAt) || date(workspace.profile.createdAt), updatedAt: date(item.updatedAt) || date(item.createdAt) || date(workspace.profile.createdAt), importedFromBrowser: true, importSource: namespace });
  const records = [];
  for (const item of workspace.farms) records.push({ collection: 'farms', id: destination('farms', item.id), fields: { ...common(item), name: text(item.name, 120), notes: text(item.notes), archivedAt: date(item.archivedAt) } });
  for (const item of workspace.plots) records.push({ collection: 'plots', id: destination('plots', item.id), fields: { ...common(item), farmId: destination('farms', item.farmId), name: text(item.name, 120), variety: text(item.variety, 120), plantedAt: text(item.plantedAt, 10), notes: text(item.notes), archivedAt: date(item.archivedAt) } });
  for (const item of workspace.scans) {
    const fields = { ...common(item) };
    for (const key of ['statusLabel','statusType','topClass','modelVersion','inferenceMode','scannerProfile','classificationScope','userCondition','legacyDisplayTime']) if (item[key] != null) fields[key] = text(item[key], 400);
    for (const key of ['message','recommendation']) fields[key] = text(item[key], 4000);
    for (const key of ['topConfidence','detectorTopConfidence']) fields[key] = typeof item[key] === 'number' && Number.isFinite(item[key]) ? item[key] : null;
    for (const key of ['detectionCount','imageWidth','imageHeight']) fields[key] = Number.isFinite(item[key]) ? Math.max(0, item[key]) : 0;
    fields.detections = Array.isArray(item.detections) ? item.detections.slice(0,300) : [];
    fields.preprocessingSteps = Array.isArray(item.preprocessingSteps) ? item.preprocessingSteps.slice(0,30) : [];
    fields.preprocessingSummary = item.preprocessingSummary && typeof item.preprocessingSummary === 'object' ? item.preprocessingSummary : {};
    if (JSON.stringify(fields).length > 200000) fail('A scan in this backup is too large to import.');
    fields.isPhotoOnly = Boolean(item.isPhotoOnly);
    fields.classificationAvailable = !fields.isPhotoOnly && item.classificationAvailable !== false;
    fields.importedFromLegacy = Boolean(item.importedFromLegacy);
    fields.shareForResearch = false;
    const plot = plots.get(item.plotId);
    fields.plotId = plot ? destination('plots', plot.id) : null;
    fields.farmId = plot ? destination('farms', plot.farmId) : null;
    let prepared, annotated;
    if (item.hasPhotos) {
      const sourcePath = `browser/scans/${item.id}/prepared.jpg`;
      prepared = decodePhoto(photos.get(sourcePath));
      annotated = item.annotatedImagePath ? decodePhoto(photos.get(`browser/scans/${item.id}/annotated.jpg`)) : prepared;
    }
    fields.hasPhotos = Boolean(prepared);
    records.push({ collection: 'scans', id: destination('scans',item.id), fields, ...(prepared ? { prepared, annotated } : {}) });
  }
  for (const item of workspace.observations) records.push({ collection: 'observations', id: destination('observations',item.id), fields: { ...common(item), plotId: destination('plots',item.plotId), observedAt: text(item.observedAt,10), condition: ['normal','concerning','unsure'].includes(item.condition) ? item.condition : 'unsure', note: text(item.note) } });
  for (const item of workspace.tasks) records.push({ collection: 'tasks', id: destination('tasks',item.id), fields: { ...common(item), plotId: destination('plots',item.plotId), title: text(item.title,100), dueDate: text(item.dueDate,10), note: text(item.note,500), completedAt: date(item.completedAt) } });
  return { namespace, records, counts: Object.fromEntries(collections.map(collection => [collection, workspace[collection].length])), photos: records.filter(item => item.prepared).length };
}

export async function executeGuestImport(plan, adapter, onProgress = () => {}) {
  let imported = 0, skipped = 0;
  for (const record of plan.records) {
    adapter.assertAccount();
    if (await adapter.exists(record.collection, record.id)) skipped++;
    else {
      const fields = { ...record.fields };
      if (record.prepared) Object.assign(fields, await adapter.upload(record.id, record.prepared, record.annotated));
      adapter.assertAccount();
      if (await adapter.create(record.collection, record.id, fields)) imported++; else skipped++;
    }
    onProgress({ completed: imported + skipped, total: plan.records.length, imported, skipped });
  }
  return { imported, skipped };
}
