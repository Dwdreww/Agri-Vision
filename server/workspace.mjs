import { createRequire } from 'node:module';
import { createPhotoStore, PHOTO_PROVIDER, MAX_UPLOAD_BYTES } from './photo-store.mjs';
import { createRecommendationStore } from './recommendation-store.mjs';
import { createAccountLock } from './account-lock.mjs';
import { getCloudResources } from './runtime.mjs';
const require = createRequire(import.meta.url);
const { createRecommendationService, readScanForRecommendation } = require('../functions/local-recommendations.js');
const { createWorkspaceOperations } = require('../functions/workspace-operations.js');
const { CONSENT_VERSION, PUBLIC_AI_ERROR_CODES } = require('../functions/recommendations.js');

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
async function readJson(request, limit = 32768) {
  if (Number(request.headers.get('content-length')) > limit) throw invalid('This request is too large.', 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) throw invalid('This request is too large.', 413);
  try { return JSON.parse(text); } catch { throw invalid('The request could not be read.'); }
}

export function createCloudWorkspace({ db, auth, photos = createPhotoStore(),
  withAccountLock = createAccountLock(db), recommendationStore = createRecommendationStore(db),
  apiKey = process.env.GEMINI_API_KEY || '', recommendationProvider, now, fetchImpl } = {}) {
  const operations = createWorkspaceOperations({ db, auth, photos });
  async function requireActiveAccount(uid) {
    const record = await db.doc(`users/${uid}`).get();
    if (!record.exists || record.get('deletionInProgress') === true) throw invalid('Your account is not available for changes.', 409);
  }
  const recommendations = createRecommendationService({
    store: recommendationStore,
    getScan: (uid, id) => readScanForRecommendation(db, uid, id),
    async hasPhotoConsent(uid) {
      const profile = (await db.doc(`users/${uid}`).get()).data();
      const preference = profile?.preferences?.recommendations;
      return profile?.deletionInProgress !== true && preference?.version === CONSENT_VERSION && preference.enabled === true;
    },
    async loadPhoto(uid, id, scan) {
      if (scan.storageProvider !== PHOTO_PROVIDER || scan.hasPhotos === false) return null;
      const result = await photos.read(uid, id, 'prepared.jpg');
      return result?.statusCode === 200 ? Buffer.from(await new Response(result.stream).arrayBuffer()) : null;
    },
    requireActiveAccount, withAccountLock, apiKey,
    ...(recommendationProvider ? { provider: recommendationProvider } : {}),
    ...(now ? { now } : {}), ...(fetchImpl ? { fetchImpl } : {})
  });

  async function account(request) {
    const match = /^Bearer ([^\s]{1,16384})$/i.exec(request.headers.get('authorization') || '');
    if (!match) throw invalid('Sign in to continue.', 401);
    try {
      const token = await auth.verifyIdToken(match[1], true);
      if (!idPattern.test(token.uid)) throw invalid('Invalid account.', 401);
      return { uid: token.uid, token };
    } catch (error) {
      if (/auth\/(argument-error|invalid-id-token|id-token-expired|id-token-revoked|user-disabled|user-not-found)/.test(error.code || '') || error.status === 401) throw invalid('Your session has expired or is invalid. Sign in again.', 401);
      throw invalid('Authentication is temporarily unavailable. Please try again.', 503);
    }
  }
  return async function handle(request) {
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
      const url = new URL(request.url);
      const parts = url.pathname === '/api/workspace' && url.searchParams.has('workspacePath')
        ? url.searchParams.get('workspacePath').split('/').filter(Boolean)
        : url.pathname.split('/').filter(Boolean).slice(2);
      if (parts.length === 1 && parts[0] === 'health' && request.method === 'GET') {
        return json({ success: true, photos: true, sharing: true, deletion: true, storage: PHOTO_PROVIDER, recommendations: recommendations.available });
      }
      const user = await account(request);
      const uid = user.uid;
      if (parts[0] === 'scans' && parts.length === 3) {
        const id = parts[1];
        if (!idPattern.test(id)) throw invalid('Invalid scan.');
        if (parts[2] === 'recommendations') {
          if (request.method === 'GET') return json(await recommendations.read(uid, id));
          if (request.method === 'POST') return json(await recommendations.generate(uid, id, await readJson(request), request.signal));
        }
        if (parts[2] === 'photos' && ['POST', 'DELETE'].includes(request.method)) {
          const images = {};
          if (request.method === 'POST') {
            if (Number(request.headers.get('content-length')) > MAX_UPLOAD_BYTES + 16384) throw invalid('Choose a smaller photo.', 413);
            let form;
            try { form = await request.formData(); } catch { throw invalid('The photo upload could not be read.'); }
            if ([...form.keys()].length !== 2 || [...form.keys()].some(key => !['prepared', 'annotated'].includes(key))) throw invalid('Upload the original and annotated JPEG photos.');
            for (const name of ['prepared', 'annotated']) {
              const file = form.get(name);
              if (!file || typeof file.arrayBuffer !== 'function' || file.size > MAX_UPLOAD_BYTES) throw invalid('Choose valid JPEG photos smaller than 4 MB.');
              images[name] = Buffer.from(await file.arrayBuffer());
            }
          }
          return await withAccountLock(uid, async () => {
            await requireActiveAccount(uid);
            const record = await db.doc(`users/${uid}/scans/${id}`).get();
            if (record.exists) throw invalid('Saved photos must be changed through their scan record.', 409);
            if (request.method === 'DELETE') {
              await photos.removePrefix(`users/${uid}/scans/${id}/`);
              return json({ deleted: true });
            }
            const checksums = await photos.save(uid, id, images);
            return json({ saved: true, checksums });
          });
        }
      }
      if (parts[0] === 'photos' && parts.length === 3 && request.method === 'GET') {
        const [, id, name] = parts;
        if (!idPattern.test(id) || !['prepared.jpg', 'annotated.jpg'].includes(name)) throw invalid('Photo not found.', 404);
        await requireActiveAccount(uid);
        const record = await db.doc(`users/${uid}/scans/${id}`).get();
        if (!record.exists || record.get('deletionInProgress') === true || record.get('storageProvider') !== PHOTO_PROVIDER) throw invalid('Photo not found.', 404);
        const result = await photos.read(uid, id, name);
        if (result?.statusCode !== 200) throw invalid('Photo not found.', 404);
        return new Response(result.stream, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      if (parts[0] === 'actions' && parts.length === 2 && request.method === 'POST') {
        const operation = operations[parts[1]];
        if (!operation || !['shareScanResult', 'revokeScanResult', 'deleteScan', 'deleteAccount'].includes(parts[1])) throw invalid('Action not found.', 404);
        const data = await readJson(request);
        return await withAccountLock(uid, async () => json({ data: await operation({ data, auth: user }) }));
      }
      throw invalid('Workspace route not found.', 404);
    } catch (error) {
      const status = error.status || ({ 'invalid-argument': 400, unauthenticated: 401, 'permission-denied': 403, 'not-found': 404, 'failed-precondition': 409 })[error.code] || 500;
      if (status >= 500) console.error('Cloud workspace operation failed:', error.code || error.name);
      return json({ ...(error.result || {}), ...(PUBLIC_AI_ERROR_CODES.includes(error.code) ? { errorCode: error.code } : {}), error: error.result || status < 500 ? error.message : 'The operation could not be completed. Please try again.' }, status,
        error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
    }
  };
}

let workspace;
export async function cloudWorkspace(request) {
  try {
    if (!workspace) workspace = getCloudResources().then(resources => createCloudWorkspace(resources)).catch(error => { workspace = undefined; throw error; });
    return await (await workspace)(request);
  } catch (error) {
    console.error('Cloud workspace initialization failed:', error.code || error.name);
    return json({ error: 'The cloud workspace is temporarily unavailable. Please try again.' }, 503);
  }
}
