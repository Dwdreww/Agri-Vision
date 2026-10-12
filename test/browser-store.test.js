import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createBrowserStore, BrowserStorageError } from '../src/browser-store.js';

function fixture() {
  const indexedDB = new IDBFactory();
  return { indexedDB, store: createBrowserStore({ indexedDB, name: 'test-workspace' }) };
}

test('browser records and photo bytes survive a fresh store instance without an account', async () => {
  const { indexedDB, store } = fixture();
  const state = await store.snapshot();
  assert.equal(state.ready, true);
  assert.equal(state.scans.length, 0);
  const farmId = await store.insert('farms', { name: 'Test farm', archivedAt: null });
  const plotId = await store.insert('plots', { farmId, name: 'Batch 1', archivedAt: null });
  await store.insert('observations', { plotId, note: 'Dry leaf tips', condition: 'unsure', observedAt: '2026-10-12' });
  const taskId = await store.insert('tasks', { plotId, title: 'Inspect again', dueDate: '2026-10-13', completedAt: null });
  await store.update('tasks', taskId, { completedAt: '2026-10-12T10:00:00.000Z' });
  const photo = new Blob(['saved-photo-bytes'], { type: 'image/jpeg' });
  await store.saveScan('scan-1', { plotId, topClass: 'Not analyzed', topConfidence: null, isPhotoOnly: true }, photo);
  const reopened = createBrowserStore({ indexedDB, name: 'test-workspace' });
  const next = await reopened.snapshot();
  assert.equal(next.farms.find(f => f.id === farmId).name, 'Test farm');
  assert.equal(next.observations[0].note, 'Dry leaf tips');
  assert.ok(next.tasks[0].completedAt);
  assert.equal(next.scans[0].topConfidence, null);
  assert.equal(next.scans[0].storageProvider, 'browser');
  assert.equal(next.scans[0].annotatedImagePath, null);
  assert.equal(await (await reopened.getPhoto(next.scans[0].preparedImagePath)).text(), 'saved-photo-bytes');
});

test('concurrent browser writes retain both records and retrying a photo save is idempotent', async () => {
  const { indexedDB, store } = fixture();
  const second = createBrowserStore({ indexedDB, name: 'test-workspace' });
  await Promise.all([store.insert('tasks', { title: 'A' }), second.insert('tasks', { title: 'B' })]);
  assert.equal((await store.snapshot()).tasks.length, 2);
  const photo = new Blob(['original']);
  await store.saveScan('same-id', { plotId: 'starter-plot', topClass: 'Not analyzed' }, photo);
  await second.saveScan('same-id', { plotId: 'starter-plot', topClass: 'Different' }, new Blob(['replacement']));
  const scans = (await store.snapshot()).scans;
  assert.equal(scans.length, 1);
  assert.equal(scans[0].topClass, 'Not analyzed');
  assert.equal(await (await store.getPhoto(scans[0].preparedImagePath)).text(), 'original');
});

test('aborted writes leave neither a record nor an orphaned photo', async () => {
  const { store } = fixture();
  await assert.rejects(store.mutate((state, photos) => {
    state.scans.push({ id: 'failed' });
    photos.put(new Blob(['bytes']), 'browser/scans/failed/prepared.jpg');
    throw new BrowserStorageError({ name: 'QuotaExceededError' });
  }), /storage is full/);
  assert.equal((await store.snapshot()).scans.length, 0);
  await assert.rejects(store.getPhoto('browser/scans/failed/prepared.jpg'));
  await assert.rejects(store.saveScan('invalid', { plotId: 'missing-plot' }, new Blob(['bytes'])));
  assert.equal((await store.snapshot()).scans.length, 0);
});

test('deletion and reset remove photo bytes; backups include the complete workspace and photos', async () => {
  const { store } = fixture();
  await store.saveScan('scan-1', { plotId: 'starter-plot' }, new Blob(['prepared']), new Blob(['annotated']));
  const backup = await store.backup();
  assert.equal(backup.workspace.scans.length, 1);
  assert.equal(backup.photos.length, 2);
  await store.deleteScan('scan-1');
  assert.equal((await store.snapshot()).scans.length, 0);
  await assert.rejects(store.getPhoto('browser/scans/scan-1/prepared.jpg'));
  await assert.rejects(store.getPhoto('browser/scans/scan-1/annotated.jpg'));
  await assert.rejects(store.getPhoto('users/cloud-user/scans/scan-1/prepared.jpg'));
  await store.insert('farms', { name: 'Other farm' });
  await store.saveScan('scan-2', { plotId: 'starter-plot' }, new Blob(['photo']));
  await store.reset();
  assert.equal((await store.snapshot()).farms.length, 1);
  assert.equal((await store.snapshot()).scans.length, 0);
  assert.equal((await store.backup()).photos.length, 0);
});

test('storage failure is surfaced rather than switching to an unsaved temporary workspace', async () => {
  const store = createBrowserStore({ indexedDB: null });
  await assert.rejects(store.snapshot(), BrowserStorageError);
  await assert.rejects(store.insert('tasks', { title: 'Must persist' }), BrowserStorageError);
});
