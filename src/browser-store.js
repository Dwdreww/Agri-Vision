export const BROWSER_UID = 'browser-workspace';
export const recordCollections = ['farms', 'plots', 'scans', 'observations', 'tasks'];

export class BrowserStorageError extends Error {
  constructor(cause) {
    super(cause?.name === 'QuotaExceededError'
      ? 'Browser storage is full. Export a backup or remove an old photo, then try again.'
      : 'Browser storage is unavailable. Allow this site to save data, then reload.');
    this.name = 'BrowserStorageError';
    this.cause = cause;
  }
}

export function newBrowserId() { return globalThis.crypto.randomUUID(); }

function initialWorkspace() {
  const now = new Date().toISOString();
  return {
    version: 1,
    profile: { displayName: 'Grower', createdAt: now, historyImportedAt: null },
    farms: [{ id: 'starter-farm', name: 'My growing space', notes: '', archivedAt: null, createdAt: now, updatedAt: now }],
    plots: [{ id: 'starter-plot', farmId: 'starter-farm', name: 'Pineapple checks', variety: 'Pineapple', plantedAt: '', notes: '', archivedAt: null, createdAt: now, updatedAt: now }],
    scans: [], observations: [], tasks: []
  };
}

// A record and its photos commit together; a failed save never reports success.
export function createBrowserStore({ indexedDB = globalThis.indexedDB, name = 'agri-vision-browser-v1' } = {}) {
  let database;
  let channel;
  const listeners = new Set();
  async function open() {
    if (!database) database = new Promise((resolve, reject) => {
      if (!indexedDB) { reject(new BrowserStorageError()); return; }
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('workspace');
        request.result.createObjectStore('photos');
      };
      request.onerror = () => reject(new BrowserStorageError(request.error));
      request.onblocked = () => reject(new BrowserStorageError());
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = null; };
        const tx = db.transaction('workspace', 'readwrite');
        const store = tx.objectStore('workspace');
        const get = store.get('current');
        get.onsuccess = () => { if (!get.result) store.put(initialWorkspace(), 'current'); };
        tx.oncomplete = () => resolve(db);
        tx.onabort = () => { db.close(); reject(new BrowserStorageError(tx.error)); };
      };
    }).catch(error => { database = null; throw error; });
    return database;
  }
  async function snapshot() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workspace', 'readonly');
      const request = tx.objectStore('workspace').get('current');
      tx.oncomplete = () => resolve({ ...request.result, ready: true });
      tx.onabort = () => reject(new BrowserStorageError(tx.error));
    });
  }
  function refresh() {
    snapshot().then(state => listeners.forEach(listener => listener.onChange(state)))
      .catch(error => listeners.forEach(listener => listener.onError?.(error)));
  }
  async function mutate(change) {
    const db = await open();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(['workspace', 'photos'], 'readwrite');
      const store = tx.objectStore('workspace');
      const request = store.get('current');
      let result;
      let failure;
      request.onsuccess = () => {
        try {
          const state = request.result;
          result = change(state, tx.objectStore('photos'));
          store.put(state, 'current');
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || new BrowserStorageError(tx.error));
    });
    refresh();
    channel?.postMessage('updated');
    return result;
  }
  function subscribe(onChange, onError) {
    const listener = { onChange, onError };
    listeners.add(listener);
    if (typeof window !== 'undefined' && !channel && typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(name);
      channel.onmessage = refresh;
      window.addEventListener('focus', refresh);
    }
    snapshot().then(state => { if (listeners.has(listener)) onChange(state); })
      .catch(error => { if (listeners.has(listener)) onError?.(error); });
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        channel?.close(); channel = null;
        if (typeof window !== 'undefined') window.removeEventListener('focus', refresh);
      }
    };
  }
  async function insert(collection, fields) {
    const id = newBrowserId();
    await mutate(state => { state[collection].push({ ...fields, id, createdAt: new Date().toISOString() }); });
    return id;
  }
  function update(collection, id, fields) {
    return mutate(state => {
      const item = state[collection].find(item => item.id === id);
      if (!item) throw new Error('This record no longer exists.');
      Object.assign(item, fields, { updatedAt: new Date().toISOString() });
    });
  }
  function saveScan(id, record, prepared, annotated = null) {
    return mutate((state, photos) => {
      if (state.scans.some(scan => scan.id === id)) return id;
      const plot = state.plots.find(plot => plot.id === record.plotId && !plot.archivedAt);
      if (!plot || !state.farms.some(farm => farm.id === plot.farmId && !farm.archivedAt)) throw new Error('Choose an active plot before saving.');
      const preparedImagePath = `browser/scans/${id}/prepared.jpg`;
      const annotatedImagePath = annotated ? `browser/scans/${id}/annotated.jpg` : null;
      photos.put(prepared, preparedImagePath);
      if (annotated) photos.put(annotated, annotatedImagePath);
      state.scans.push({ ...record, id, farmId: plot.farmId, preparedImagePath, annotatedImagePath,
        storageProvider: 'browser', hasPhotos: true, shareForResearch: false, createdAt: new Date().toISOString() });
      return id;
    });
  }
  async function getPhoto(path) {
    if (!/^browser\/scans\/[A-Za-z0-9_-]+\/(prepared|annotated)\.jpg$/.test(path || '')) throw new Error('This photo is not in this browser workspace.');
    const db = await open();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly');
      const request = tx.objectStore('photos').get(path);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(new BrowserStorageError(tx.error));
    });
    if (!blob) throw new Error('This saved photo is no longer available.');
    return blob;
  }
  function deleteScan(id) {
    return mutate((state, photos) => {
      state.scans = state.scans.filter(scan => scan.id !== id);
      photos.delete(`browser/scans/${id}/prepared.jpg`);
      photos.delete(`browser/scans/${id}/annotated.jpg`);
    });
  }
  function reset() {
    return mutate((state, photos) => { Object.assign(state, initialWorkspace()); photos.clear(); });
  }
  async function backup() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['workspace', 'photos'], 'readonly');
      const workspace = tx.objectStore('workspace').get('current');
      const keys = tx.objectStore('photos').getAllKeys();
      const blobs = tx.objectStore('photos').getAll();
      tx.oncomplete = () => resolve({ workspace: workspace.result, photos: keys.result.map((path, i) => ({ path, blob: blobs.result[i] })) });
      tx.onabort = () => reject(new BrowserStorageError(tx.error));
    });
  }
  return { snapshot, subscribe, mutate, insert, update, saveScan, getPhoto, deleteScan, reset, backup };
}

export const browserStore = createBrowserStore();
