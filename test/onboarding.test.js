import test from 'node:test';
import assert from 'node:assert/strict';
import { isSetupHidden, rememberSetupHidden, setupProgress } from '../src/onboarding.js';

function starter() {
  return { farms: [{ id: 'starter-farm', name: 'My growing space' }], plots: [{ id: 'starter-plot', farmId: 'starter-farm', name: 'Pineapple checks' }], scans: [] };
}

test('both new accounts and unnamed guest starter records begin with setup', () => {
  assert.equal(setupProgress({ farms: [], plots: [], scans: [] }).completed, 0);
  const data = starter();
  const before = structuredClone(data);
  const progress = setupProgress(data);
  assert.equal(progress.completed, 0);
  assert.equal(progress.farm.id, 'starter-farm');
  assert.deepEqual(data, before);
});

test('naming existing guest locations and saving a real check completes setup without duplicates', () => {
  const data = starter();
  data.farms[0].name = 'Santos Farm';
  assert.equal(setupProgress(data).completed, 1);
  data.plots[0].name = 'East Field';
  assert.equal(setupProgress(data).completed, 2);
  data.scans.push({ id: 'photo-1', plotId: 'starter-plot', isPhotoOnly: true, topClass: 'Not analyzed' });
  const reopened = JSON.parse(JSON.stringify(data));
  assert.equal(setupProgress(reopened).complete, true);
  assert.equal(reopened.farms.length, 1);
  assert.equal(reopened.plots.length, 1);
});

test('unassigned checks and archived locations do not mark an active first check complete', () => {
  const data = starter();
  data.farms[0].name = 'Santos Farm';
  data.plots[0].name = 'East Field';
  data.scans.push({ id: 'old-summary', plotId: null });
  assert.equal(setupProgress(data).complete, false);
  data.plots[0].archivedAt = '2026-10-19';
  data.scans.push({ id: 'old-photo', plotId: 'starter-plot' });
  assert.equal(setupProgress(data).completed, 1);
  data.farms[0].archivedAt = '2026-10-19';
  assert.equal(setupProgress(data).completed, 0);
});

test('deliberately saving the starter names also counts as completing location setup', () => {
  const data = starter();
  data.farms[0].createdAt = data.plots[0].createdAt = '2026-10-12';
  data.farms[0].updatedAt = data.plots[0].updatedAt = '2026-10-19';
  assert.equal(setupProgress(data).completed, 2);
});

test('pausing the guide is isolated per account and blocked storage leaves it available', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  rememberSetupHidden(storage, 'guest', true);
  assert.equal(isSetupHidden(storage, 'guest'), true);
  assert.equal(isSetupHidden(storage, 'account'), false);
  rememberSetupHidden(storage, 'guest', false);
  assert.equal(isSetupHidden(storage, 'guest'), false);
  const blocked = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  rememberSetupHidden(blocked, 'guest', true);
  assert.equal(isSetupHidden(blocked, 'guest'), false);
});
