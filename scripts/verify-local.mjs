// Live pilot verification: creates disposable synthetic accounts, then removes them.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { initializeApp as clientApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDocFromServer, getDocs, collection, Timestamp } from 'firebase/firestore';

const root = path.resolve(import.meta.dirname, '..');
const config = Object.fromEntries((await fs.readFile(path.join(root, '.env'), 'utf8')).split('\n')
  .filter(line => line.includes('=') && !line.trim().startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const privateRoot = path.join(os.homedir(), '.config', 'agri-vision');
const fixtureFile = path.join(privateRoot, 'qa-session.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS ||= path.join(privateRoot, `${config.VITE_FIREBASE_PROJECT_ID}-local-session.json`);
const require = createRequire(path.join(root, 'functions', 'package.json'));
const adminApp = require('firebase-admin/app').initializeApp({ projectId: config.VITE_FIREBASE_PROJECT_ID });
const adminAuth = require('firebase-admin/auth').getAuth(adminApp);
const adminDb = require('firebase-admin/firestore').getFirestore(adminApp);
const photoRoot = path.join(os.homedir(), '.local', 'share', 'agri-vision', config.VITE_FIREBASE_PROJECT_ID, 'photos');
const accounts = [];
let checks = 0;
const origin = 'http://127.0.0.1:5173';
function passed(label) { console.log(`PASS ${label}`); checks++; }
async function cleanup(uid) {
  const scans = await adminDb.collection(`users/${uid}/scans`).get();
  for (const scan of scans.docs) if (scan.get('researchResultId')) await adminDb.doc(`researchResults/${scan.get('researchResultId')}`).delete();
  await adminDb.recursiveDelete(adminDb.doc(`users/${uid}`));
  await fs.rm(path.join(photoRoot, uid), { recursive: true, force: true });
  await adminAuth.deleteUser(uid).catch(error => { if (error.code !== 'auth/user-not-found') throw error; });
}
if (['--cleanup-ui', '--lock-ui', '--unlock-ui'].some(flag => process.argv.includes(flag))) {
  const fixture = JSON.parse(await fs.readFile(fixtureFile, 'utf8'));
  const user = await adminAuth.getUser(fixture.uid);
  assert.equal(user.email, fixture.email);
  assert.ok(user.email.startsWith('pilot-qa-owner-') && user.email.endsWith('@example.com'), 'Only a disposable QA account may be changed.');
  if (process.argv.includes('--cleanup-ui')) {
    await cleanup(fixture.uid);
    await fs.rm(fixtureFile);
    console.log('Removed the disposable browser verification account.');
  } else {
    await adminDb.doc(`users/${fixture.uid}`).update({ deletionInProgress: process.argv.includes('--lock-ui') });
    console.log('Updated the disposable account for save-recovery verification.');
  }
  process.exit(0);
}
async function account(label) {
  const app = clientApp({ apiKey: config.VITE_FIREBASE_API_KEY, projectId: config.VITE_FIREBASE_PROJECT_ID,
    authDomain: config.VITE_FIREBASE_AUTH_DOMAIN }, `qa-${label}-${randomUUID()}`);
  const email = `pilot-qa-${label}-${randomUUID()}@example.com`;
  const password = `QA-${randomUUID()}-9a!`;
  const user = (await createUserWithEmailAndPassword(getAuth(app), email, password)).user;
  const item = { app, auth: getAuth(app), db: getFirestore(app), uid: user.uid, email, password };
  accounts.push(item);
  await setDoc(doc(item.db, 'users', item.uid), { displayName: 'Pilot verification', createdAt: Timestamp.now() });
  return item;
}
async function request(item, pathname, options = {}) {
  const headers = { ...options.headers };
  if (item) headers.Authorization = `Bearer ${await item.auth.currentUser.getIdToken()}`;
  return fetch(`${origin}${pathname}`, { ...options, headers, signal: AbortSignal.timeout(120000) });
}
async function action(item, name, data) {
  const response = await request(item, `/api/workspace/actions/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result.data;
}
async function saveScan(item, id, prediction) {
  const jpeg = Buffer.from(prediction.annotated_image.split(',')[1], 'base64');
  const form = new FormData();
  for (const name of ['prepared', 'annotated']) form.append(name, new Blob([jpeg], { type: 'image/jpeg' }), `${name}.jpg`);
  const response = await request(item, `/api/workspace/scans/${id}/photos`, { method: 'POST', body: form });
  assert.equal(response.status, 200, await response.text());
  await setDoc(doc(item.db, 'users', item.uid, 'scans', id), {
    farmId: 'qa-farm', plotId: 'qa-plot', createdAt: Timestamp.now(), statusType: prediction.status_type,
    statusLabel: prediction.status_label, topClass: prediction.top_class, topConfidence: prediction.top_confidence,
    detectionCount: prediction.detection_count, modelVersion: prediction.model_version, userCondition: 'unsure',
    storageProvider: 'local', hasPhotos: true, shareForResearch: false,
    preparedImagePath: `users/${item.uid}/scans/${id}/prepared.jpg`,
    annotatedImagePath: `users/${item.uid}/scans/${id}/annotated.jpg`,
    note: 'Private QA note that must never enter research', detections: prediction.detections
  });
}
let keep;
try {
  const owner = await account('owner');
  const other = await account('other');
  assert.equal(owner.auth.currentUser.emailVerified, false);
  passed('immediate email/password registration');
  await setDoc(doc(owner.db, 'users', owner.uid, 'farms', 'qa-farm'), { name: 'Verification farm', archivedAt: null, createdAt: Timestamp.now() });
  await setDoc(doc(owner.db, 'users', owner.uid, 'plots', 'qa-plot'), { name: 'Pineapple plot', farmId: 'qa-farm', archivedAt: null, createdAt: Timestamp.now() });
  await setDoc(doc(owner.db, 'users', owner.uid, 'observations', 'qa-observation'), {
    plotId: 'qa-plot', observedAt: new Date().toISOString().slice(0, 10), condition: 'unsure', note: 'Inspect leaf tips', createdAt: Timestamp.now() });
  await setDoc(doc(owner.db, 'users', owner.uid, 'tasks', 'qa-task'), {
    plotId: 'qa-plot', title: 'Inspect the pineapple plot', dueDate: '2026-10-06', completedAt: null, createdAt: Timestamp.now() });
  assert.equal((await getDocFromServer(doc(owner.db, 'users', owner.uid, 'farms', 'qa-farm'))).data().name, 'Verification farm');
  await assert.rejects(getDocFromServer(doc(other.db, 'users', owner.uid, 'farms', 'qa-farm')), error => error.code === 'permission-denied');
  passed('private farm, plot, observation, and care-task records');
  assert.equal((await request(null, '/api/predict', { method: 'POST' })).status, 401);
  assert.equal((await request(null, '/api/workspace/actions/shareScanResult', { method: 'POST' })).status, 401);
  assert.equal((await request(null, '/api/workspace/photos/qa-scan/annotated.jpg', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  passed('scanner and private service reject signed-out and invalid sessions');
  const image = new FormData();
  image.append('image', new Blob([await fs.readFile(path.join(root, 'pineappletest.png'))], { type: 'image/png' }), 'pineappletest.png');
  const inference = await request(owner, '/api/predict', { method: 'POST', body: image });
  const prediction = await inference.json();
  assert.equal(inference.status, 200, JSON.stringify(prediction));
  assert.equal(prediction.success, true);
  assert.equal(prediction.model_version, 'pilot-v1');
  assert.ok(prediction.annotated_image.startsWith('data:image/jpeg;base64,'));
  passed('real authenticated YOLO and EfficientNet prediction');
  const invalidPhotos = new FormData();
  invalidPhotos.append('prepared', new Blob([Buffer.from(prediction.annotated_image.split(',')[1], 'base64')], { type: 'image/jpeg' }), 'prepared.jpg');
  invalidPhotos.append('annotated', new Blob(['invalid image'], { type: 'image/jpeg' }), 'annotated.jpg');
  assert.equal((await request(owner, '/api/workspace/scans/qa-invalid/photos', { method: 'POST', body: invalidPhotos })).status, 400);
  await assert.rejects(fs.access(path.join(photoRoot, owner.uid, 'scans', 'qa-invalid')));
  await saveScan(owner, 'qa-scan', prediction);
  const photo = await request(owner, '/api/workspace/photos/qa-scan/annotated.jpg');
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('cache-control'), 'no-store');
  assert.ok((await photo.arrayBuffer()).byteLength > 100);
  assert.equal((await request(other, '/api/workspace/photos/qa-scan/annotated.jpg')).status, 404);
  assert.equal((await request(other, '/api/workspace/actions/deleteScan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scanId: 'qa-scan' }) })).status, 404);
  assert.equal((await request(owner, '/api/workspace/scans/qa-scan/photos', { method: 'DELETE' })).status, 409);
  passed('saved JPEG photos are private and protected from unsaved cleanup');
  const health = await (await request(null, '/api/workspace/health')).json();
  assert.equal(typeof health.recommendations, 'boolean');
  assert.equal((await request(null, '/api/workspace/scans/qa-scan/recommendations')).status, 401);
  assert.equal((await request(other, '/api/workspace/scans/qa-scan/recommendations')).status, 404);
  const recommendationsBefore = (await getDocFromServer(doc(owner.db, 'users', owner.uid, 'scans', 'qa-scan'))).data();
  const cachedAdvice = await request(owner, '/api/workspace/scans/qa-scan/recommendations');
  assert.equal(cachedAdvice.status, 200);
  assert.equal(typeof (await cachedAdvice.json()).available, 'boolean');
  const invalidConsent = await request(owner, '/api/workspace/scans/qa-scan/recommendations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regenerate: false }) });
  assert.equal(invalidConsent.status, 400);
  if (!health.recommendations) {
    const fallback = await request(owner, '/api/workspace/scans/qa-scan/recommendations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regenerate: false, consentVersion: '2026-10-08' }) });
    assert.equal(fallback.status, 200);
    const fallbackBody = await fallback.json();
    assert.equal(fallbackBody.available, false);
    assert.equal(fallbackBody.recommendation.source, 'standard');
  }
  assert.deepEqual((await getDocFromServer(doc(owner.db, 'users', owner.uid, 'scans', 'qa-scan'))).data(), recommendationsBefore);
  passed('recommendation ownership, explicit consent, missing-key fallback, and unchanged scan records');
  await setDoc(doc(owner.db, 'users', owner.uid, 'scans', 'qa-inconclusive'), {
    topClass: 'Unknown', topConfidence: null, detectionCount: 0, statusType: 'monitor',
    modelVersion: 'legacy-unknown', hasPhotos: false, importedFromLegacy: true, shareForResearch: false,
    createdAt: Timestamp.now()
  });
  const inconclusive = await request(owner, '/api/workspace/scans/qa-inconclusive/recommendations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ regenerate: false, consentVersion: '2026-10-08' }) });
  assert.equal(inconclusive.status, 200);
  assert.equal((await inconclusive.json()).recommendation.source, 'standard');
  const inconclusiveCache = path.join(photoRoot, owner.uid, 'scans', 'qa-inconclusive', 'recommendations.json');
  await fs.access(inconclusiveCache);
  const reread = await request(owner, '/api/workspace/scans/qa-inconclusive/recommendations');
  assert.equal((await reread.json()).recommendation.source, 'standard');
  await action(owner, 'deleteScan', { scanId: 'qa-inconclusive' });
  await assert.rejects(fs.access(inconclusiveCache));
  passed('inconclusive imported scans retain standard guidance and scan removal deletes the private advice');
  await assert.rejects(setDoc(doc(owner.db, 'users', owner.uid, 'scans', 'qa-bypass'), { shareForResearch: true }), error => error.code === 'permission-denied');
  await action(owner, 'shareScanResult', { scanId: 'qa-scan' });
  let resultId = (await adminDb.doc(`users/${owner.uid}/scans/qa-scan`).get()).get('researchResultId');
  const research = (await adminDb.doc(`researchResults/${resultId}`).get()).data();
  assert.deepEqual(Object.keys(research).sort(), ['detectionCount', 'modelVersion', 'month', 'statusType', 'topClass', 'topConfidence', 'userCondition'].sort());
  await assert.rejects(getDocs(collection(other.db, 'researchResults')), error => error.code === 'permission-denied');
  await adminAuth.setCustomUserClaims(other.uid, { researcher: true });
  await signInWithEmailAndPassword(other.auth, other.email, other.password);
  assert.ok((await getDocs(collection(other.db, 'researchResults'))).docs.some(item => item.id === resultId));
  assert.equal((await request(other, '/api/workspace/photos/qa-scan/annotated.jpg')).status, 404);
  passed('research opt-in is sanitized; researcher access grants no private-photo access');
  await action(owner, 'revokeScanResult', { scanId: 'qa-scan' });
  assert.equal((await adminDb.doc(`researchResults/${resultId}`).get()).exists, false);
  passed('research revocation removes the contributed copy');
  await action(owner, 'shareScanResult', { scanId: 'qa-scan' });
  resultId = (await adminDb.doc(`users/${owner.uid}/scans/qa-scan`).get()).get('researchResultId');
  await action(owner, 'deleteScan', { scanId: 'qa-scan' });
  assert.equal((await adminDb.doc(`users/${owner.uid}/scans/qa-scan`).get()).exists, false);
  assert.equal((await adminDb.doc(`researchResults/${resultId}`).get()).exists, false);
  await assert.rejects(fs.access(path.join(photoRoot, owner.uid, 'scans', 'qa-scan')));
  passed('scan deletion removes its record, photos, and research copy');
  await saveScan(other, 'qa-account-scan', prediction);
  await setDoc(doc(other.db, 'users', other.uid, 'scans', 'qa-account-advice'), {
    topClass: 'No Detection', topConfidence: null, detectionCount: 0, statusType: 'monitor',
    modelVersion: 'pilot-v1', hasPhotos: false, shareForResearch: false, createdAt: Timestamp.now()
  });
  const accountAdvice = await request(other, '/api/workspace/scans/qa-account-advice/recommendations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ regenerate: false, consentVersion: '2026-10-08' }) });
  assert.equal(accountAdvice.status, 200);
  await fs.access(path.join(photoRoot, other.uid, 'scans', 'qa-account-advice', 'recommendations.json'));
  await action(other, 'shareScanResult', { scanId: 'qa-account-scan' });
  const accountResult = (await adminDb.doc(`users/${other.uid}/scans/qa-account-scan`).get()).get('researchResultId');
  const unconfirmed = await request(other, '/api/workspace/actions/deleteAccount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unconfirmed.status, 400);
  await action(other, 'deleteAccount', { confirm: true });
  assert.equal((await adminDb.doc(`users/${other.uid}`).get()).exists, false);
  assert.equal((await adminDb.doc(`researchResults/${accountResult}`).get()).exists, false);
  await assert.rejects(fs.access(path.join(photoRoot, other.uid, 'scans')));
  await assert.rejects(adminAuth.getUser(other.uid), error => error.code === 'auth/user-not-found');
  assert.equal((await request(other, '/api/workspace/photos/qa-account-scan/annotated.jpg')).status, 401);
  passed('confirmed account removal deletes records, photos, private advice, contributions, and login');
  if (process.argv.includes('--keep-ui-fixture')) {
    keep = owner.uid;
    await fs.writeFile(fixtureFile, JSON.stringify({ uid: owner.uid, email: owner.email, password: owner.password }), { mode: 0o600 });
    await fs.chmod(fixtureFile, 0o600);
    console.log('Disposable browser fixture is ready; remove with --cleanup-ui after browser checks.');
  }
  console.log(`${checks} end-to-end checks passed.`);
} finally {
  for (const item of accounts) {
    if (item.uid !== keep) await cleanup(item.uid);
    await deleteApp(item.app);
  }
  await require('firebase-admin/app').deleteApp(adminApp);
}
