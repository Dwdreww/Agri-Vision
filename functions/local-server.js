"use strict";

// Local pilot service. Credentials and photos stay outside the checkout.
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const { readImages } = require("./local-uploads");
const operations = require("./index");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const photos = require("./local-photos");
const { createStore, createRecommendationService } = require("./local-recommendations");

function createApp({ auth = getAuth(), db = getFirestore(), handlers = operations,
  photoStore = photos, apiKey = process.env.GEMINI_API_KEY || "", recommendationProvider,
  recommendationStore, now, fetchImpl, timeoutMs } = {}) {

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.get("/api/workspace/health", (_req, res) => res.json({ success: true, photos: true, sharing: true, deletion: true, storage: "local", recommendations: recommendations.available }));
app.use(express.json({ limit: "32kb" }));

app.use(async (req, res, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "");
  if (!match) return res.status(401).json({ error: "Sign in to continue." });
  try {
    const token = await auth.verifyIdToken(match[1], true);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(token.uid)) return res.status(401).json({ error: "Invalid account." });
    req.account = { uid: token.uid, token };
    next();
  } catch (error) {
    const invalid = /auth\/(argument-error|invalid-id-token|id-token-expired|id-token-revoked|user-disabled|user-not-found)/.test(error.code || "");
    res.status(invalid ? 401 : 503).json({ error: invalid ? "Your session has expired or is invalid. Sign in again." : "Authentication is temporarily unavailable." });
  }
});

// Serialize mutations per account so uploads cannot race account/scan deletion.
const queues = new Map();
async function withAccountLock(uid, operation) {
  const previous = queues.get(uid) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(uid, current);
  try { return await current; }
  finally { if (queues.get(uid) === current) queues.delete(uid); }
}

function scanId(req) {
  const id = req.params.scanId;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id || "")) {
    const error = new Error("Invalid scan."); error.status = 400; throw error;
  }
  return id;
}

async function requireActiveAccount(uid) {
  const profile = await db.doc(`users/${uid}`).get();
  if (!profile.exists || profile.get("deletionInProgress") === true) {
    const error = new Error("Your account is not available for changes."); error.status = 409; throw error;
  }
}

const recommendations = createRecommendationService({
  store: recommendationStore || createStore({ scanDirectory: photoStore.scanDirectory, rootDirectory: process.env.AGRI_VISION_PHOTO_DIR }),
  getScan: async (uid, id) => {
    const record = await db.doc(`users/${uid}/scans/${id}`).get();
    return record.exists ? record.data() : null;
  },
  requireActiveAccount, withAccountLock, apiKey, provider: recommendationProvider,
  ...(now ? { now } : {}), ...(fetchImpl ? { fetchImpl } : {}), ...(timeoutMs ? { timeoutMs } : {})
});

app.get("/api/workspace/scans/:scanId/recommendations", route(async (req, res) => {
  res.json(await recommendations.read(req.account.uid, scanId(req)));
}));

app.post("/api/workspace/scans/:scanId/recommendations", route(async (req, res) => {
  const controller = new AbortController();
  const onClose = () => { if (!res.writableFinished) controller.abort(); };
  res.once("close", onClose);
  if (res.destroyed) controller.abort();
  try {
    const result = await recommendations.generate(req.account.uid, scanId(req), req.body, controller.signal);
    if (!res.destroyed) res.json(result);
  } finally { res.off("close", onClose); }
}));


function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

app.post("/api/workspace/scans/:scanId/photos", route(async (req, res) => {
  const id = scanId(req);
  const images = await readImages(req);
  await withAccountLock(req.account.uid, async () => {
    await requireActiveAccount(req.account.uid);
    const record = await db.doc(`users/${req.account.uid}/scans/${id}`).get();
    if (record.exists) throw Object.assign(new Error("This scan is already saved."), { status: 409 });
    await photos.save(req.account.uid, id, images);
  });
  res.json({ saved: true });
}));

app.delete("/api/workspace/scans/:scanId/photos", route(async (req, res) => {
  const id = scanId(req);
  await withAccountLock(req.account.uid, async () => {
    await requireActiveAccount(req.account.uid);
    const record = await db.doc(`users/${req.account.uid}/scans/${id}`).get();
    if (record.exists) throw Object.assign(new Error("Saved photos must be removed with their scan."), { status: 409 });
    await photos.removePrefix(`users/${req.account.uid}/scans/${id}/`);
  });
  res.json({ deleted: true });
}));

app.get("/api/workspace/photos/:scanId/:imageName", route(async (req, res) => {
  const id = scanId(req);
  if (!["prepared.jpg", "annotated.jpg"].includes(req.params.imageName)) return res.status(404).json({ error: "Photo not found." });
  await requireActiveAccount(req.account.uid);
  const record = await db.doc(`users/${req.account.uid}/scans/${id}`).get();
  if (!record.exists || record.get("deletionInProgress") === true || record.get("storageProvider") !== "local") return res.status(404).json({ error: "Photo not found." });
  const file = path.join(photos.scanDirectory(req.account.uid, id), req.params.imageName);
  await fs.access(file);
  res.type("jpeg").sendFile(file);
}));

const allowedActions = ["shareScanResult", "revokeScanResult", "deleteScan", "deleteAccount"];
app.post("/api/workspace/actions/:action", route(async (req, res) => {
  if (!allowedActions.includes(req.params.action)) return res.status(404).json({ error: "Action not found." });
  const result = await withAccountLock(req.account.uid, () => handlers[req.params.action].run({ data: req.body, auth: req.account }));
  res.json({ data: result });
}));

app.use((error, _req, res, _next) => {
  if (res.destroyed) return;
  const codes = { "invalid-argument": 400, unauthenticated: 401, "permission-denied": 403, "not-found": 404, "failed-precondition": 409 };
  const status = error.status || codes[error.code] || (error.code === "ENOENT" ? 404 : 500);
  if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
  if (status >= 500) console.error("Workspace operation failed:", error.code || error.name);
  res.status(status).json({ ...(error.result || {}), error: error.result ? error.message : status >= 500 ? "The operation could not be completed. Please retry." : error.message });
});

return app;
}

if (require.main === module) {
  if (!photos.enabled() || !process.env.FIREBASE_PROJECT_ID) throw new Error("Use npm run pilot to configure the local workspace service");
  createApp().listen(Number(process.env.WORKSPACE_PORT || 5002), "127.0.0.1", () => console.log("Private local workspace service is listening on port", process.env.WORKSPACE_PORT || 5002));
}

module.exports = { createApp };
