// Exercise the public release using disposable accounts; never use a grower's session.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const config = Object.fromEntries((await fs.readFile(path.join(root, '.env'), 'utf8')).split('\n')
  .filter(line => line.includes('=') && !line.trim().startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const privateRoot = path.join(os.homedir(), '.config', 'agri-vision');
const fixturePath = path.join(privateRoot, 'demo-qa-session.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS ||= path.join(privateRoot, `${config.VITE_FIREBASE_PROJECT_ID}-local-session.json`);
const require = createRequire(path.join(root, 'functions/package.json'));
const admin = require('firebase-admin/app').initializeApp({ projectId: config.VITE_FIREBASE_PROJECT_ID });
const auth = require('firebase-admin/auth').getAuth(admin);
const db = require('firebase-admin/firestore').getFirestore(admin);
const accounts = new Set();
async function cleanup(uid) {
  const user = await auth.getUser(uid);
  assert.ok(user.email.startsWith('public-demo-qa-') && user.email.endsWith('@example.com'));
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await auth.deleteUser(uid);
}
if (process.argv.includes('--cleanup-ui') || process.argv.includes('--check-ui')) {
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  assert.equal((await auth.getUser(fixture.uid)).email, fixture.email);
  assert.equal((await db.collection(`users/${fixture.uid}/scans`).get()).size, 0, 'Demo must not persist a scan.');
  assert.equal((await db.collection(`users/${fixture.uid}/farms`).get()).size, 0, 'Demo must work without a farm.');
  if (process.argv.includes('--cleanup-ui')) { await cleanup(fixture.uid); await fs.rm(fixturePath); }
  console.log('PASS disposable demo account has no saved scans or farm requirement.');
  process.exit(0);
}
const origins = process.argv.slice(2).filter(arg => arg.startsWith('https://') || /^http:\/\/127\.0\.0\.1:\d+$/.test(arg));
assert.ok(origins.length > 0, 'Provide the backend and/or frontend HTTPS origins (or a loopback QA server).');
async function createAccount() {
  const email = `public-demo-qa-${randomUUID()}@example.com`, password = `QA-${randomUUID()}-8a!`;
  const user = await auth.createUser({ email, password, displayName: 'Public demo verification' });
  accounts.add(user.uid);
  return { uid: user.uid, email, password };
}
async function signIn(account) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.VITE_FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }) });
  assert.equal(response.status, 200, 'Disposable account sign-in failed.');
  return (await response.json()).idToken;
}
async function predict(origin, token, withPhoto = false) {
  const form = new FormData();
  if (withPhoto) form.append('image', new Blob([await fs.readFile(path.join(root, 'assets/plates/preview-photo.webp'))], { type: 'image/webp' }), 'pineapple.webp');
  return fetch(`${origin}/api/predict`, { method: 'POST', body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(180000) });
}
const results = [];
try {
  for (const origin of origins) {
    const healthResponse = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(30000) });
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.scanner_ready, true);
    assert.equal(health.classification_ready, true);
    assert.equal(health.auth_mode, 'rest');
    assert.equal(health.detector_artifact, 'bestv3.pt');
    assert.equal(health.detector_sha256, '28a5c00ab63b92c052f5e4701cdc0f79f857f59ca6c7f5e81e78e78f41b544c5');
    assert.equal(health.model_version, 'yolov8m-28a5c00ab63b-effnetb0-03af1ac8bba3-roi-v3');
    const account = await createAccount();
    const token = await signIn(account);
    assert.equal((await predict(origin)).status, 401);
    assert.equal((await predict(origin, 'invalid')).status, 401);
    const parts = token.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    assert.equal((await predict(origin, parts.join('.'))).status, 401, 'Tampered signature must be rejected by Google.');
    const response = await predict(origin, token, true);
    const prediction = await response.json();
    assert.equal(response.status, 200, JSON.stringify({ error: prediction.error }));
    assert.equal(prediction.success, true);
    assert.equal(prediction.model_version, health.model_version);
    assert.equal(prediction.classification_available, true);
    assert.ok(prediction.detection_count > 0);
    assert.equal(prediction.classification_scope, 'yolo-regions');
    assert.ok(prediction.detections.every(region => region.classification_available && Number.isFinite(region.efficientnet_confidence_percent)));
    await auth.updateUser(account.uid, { disabled: true });
    assert.equal((await predict(origin, token)).status, 401, 'Disabled account must be rejected.');
    await auth.updateUser(account.uid, { disabled: false });
    const renewedToken = await signIn(account);
    await new Promise(resolve => setTimeout(resolve, 1500));
    await auth.revokeRefreshTokens(account.uid);
    assert.equal((await predict(origin, renewedToken)).status, 401, 'Revoked session must be rejected.');
    const finalToken = await signIn(account);
    await cleanup(account.uid); accounts.delete(account.uid);
    assert.equal((await predict(origin, finalToken)).status, 401, 'Deleted account must be rejected.');
    results.push({ origin, modelVersion: health.model_version, authMode: health.auth_mode,
      condition: prediction.top_class, classifierConfidence: prediction.top_confidence,
      detectedRegions: prediction.detection_count,
      checks: ['health', 'signed-out', 'invalid token', 'tampered signature', 'real paired inference', 'disabled account', 'revoked session', 'deleted account'] });
    console.log(`PASS ${origin}: current model pair, real inference, and all session rejection checks.`);
  }
  if (process.argv.includes('--keep-ui')) {
    try { await fs.access(fixturePath); throw new Error('An existing demo QA fixture must be cleaned up first.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const fixture = await createAccount();
    await fs.mkdir(privateRoot, { recursive: true, mode: 0o700 });
    await fs.writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
    accounts.delete(fixture.uid);
    console.log('Prepared a private disposable account for browser verification.');
  }
  const evidence = path.join(root, 'output/release-2026-11-03/public-verification.json');
  await fs.mkdir(path.dirname(evidence), { recursive: true });
  await fs.writeFile(evidence, JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2) + '\n');
} finally {
  for (const uid of accounts) await cleanup(uid);
}
