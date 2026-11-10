"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { PUBLIC_AI_ERROR_CODES, PROVIDER_TIMEOUT_MS, MODEL, CONSENT_VERSION, SCHEMA_VERSION, failure, prepareScan, standardRecommendation, validateContent, requestGemini } = require("./recommendations");

async function readJson(file, { optional = true, cache = false } = {}) {
  try {
    const stat = await fs.stat(file);
    if (stat.size > 64 * 1024) throw new Error("Private metadata is too large");
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((optional && error.code === "ENOENT") || cache) return null;
    throw failure("Recommendation storage is temporarily unavailable.", 503, undefined, "AI_STORAGE_UNAVAILABLE");
  }
}

async function atomicJson(file, data) {
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(data), { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

function positiveLimit(value, fallback, maximum) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error("AI recommendation limits must be positive integers within the pilot maximum.");
  return number;
}

function validCachedRecommendation(value) {
  const text = item => typeof item === "string" && item.trim() && item.length <= 700;
  const list = items => Array.isArray(items) && items.length <= 3 && items.every(text);
  return value && ["gemini", "standard"].includes(value.source) && text(value.analysis)
    && list(value.concerns) && list(value.tips)
    && (value.photoObservations === undefined || (value.source === "gemini" && list(value.photoObservations)))
    && Array.isArray(value.actions) && value.actions.length > 0 && value.actions.length <= 4
    && value.actions.every(action => action && text(action.text) && text(action.reason))
    && (value.sections === undefined || (value.source === "gemini" && Array.isArray(value.sections)
      && value.sections.length === 15 && value.sections.every(section => text(section?.title) && text(section?.text))))
    && typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt))
    && (value.source === "standard" ? value.provider === null && value.model === null
      : value.provider === "Google Gemini" && value.model === MODEL);
}

function createStore({ scanDirectory, rootDirectory,
  ownerDailyLimit = process.env.AGRI_VISION_AI_OWNER_DAILY_LIMIT,
  globalDailyLimit = process.env.AGRI_VISION_AI_GLOBAL_DAILY_LIMIT,
  cooldownSeconds = process.env.AGRI_VISION_AI_COOLDOWN_SECONDS }) {
  const ownerLimit = positiveLimit(ownerDailyLimit, 10, 10);
  const globalLimit = positiveLimit(globalDailyLimit, 50, 50);
  const cooldownMs = positiveLimit(cooldownSeconds, 30, 86400) * 1000;
  function ownerLedger(uid) { return path.join(scanDirectory(uid), ".ai-usage.json"); }
  const globalLedger = path.join(rootDirectory, ".ai-usage-global.json");
  return {
    async read(uid, id, fingerprint) {
      const cached = await readJson(path.join(scanDirectory(uid, id), "recommendations.json"), { cache: true });
      if (cached?.version !== SCHEMA_VERSION || cached.fingerprint !== fingerprint
          || !validCachedRecommendation(cached.recommendation)) return null;
      return cached.recommendation;
    },
    async write(uid, id, fingerprint, recommendation) {
      await atomicJson(path.join(scanDirectory(uid, id), "recommendations.json"), { version: SCHEMA_VERSION, fingerprint, recommendation });
    },
    async reserve(uid, date) {
      const day = date.toISOString().slice(0, 10);
      const now = date.getTime();
      const [owner, global] = await Promise.all([readJson(ownerLedger(uid)), readJson(globalLedger)]);
      for (const ledger of [owner, global]) {
        if (ledger && (!/^\d{4}-\d{2}-\d{2}$/.test(ledger.day || "") || !Number.isInteger(ledger.count) || ledger.count < 0 || !Number.isFinite(ledger.lastAttemptAt))) {
          throw failure("Recommendation limits are temporarily unavailable.", 503, undefined, "AI_STORAGE_UNAVAILABLE");
        }
      }
      const cooldown = owner ? cooldownMs - (now - owner.lastAttemptAt) : 0;
      if (cooldown > 0) throw failure("Please wait before generating recommendations again.", 429, Math.ceil(cooldown / 1000));
      const ownerCount = owner?.day === day ? owner.count : 0;
      const globalCount = global?.day === day ? global.count : 0;
      if (ownerCount >= ownerLimit || globalCount >= globalLimit) {
        const tomorrow = new Date(`${day}T00:00:00.000Z`).getTime() + 86400000;
        throw failure("Today's AI recommendation allowance has been used. Standard guidance is still available.", 429, Math.max(1, Math.ceil((tomorrow - now) / 1000)));
      }
      // Reserve before calling the provider. Failed calls also consume an
      // attempt; a restart must not silently reset the pilot's allowance.
      await atomicJson(globalLedger, { day, count: globalCount + 1, lastAttemptAt: now });
      await atomicJson(ownerLedger(uid), { day, count: ownerCount + 1, lastAttemptAt: now });
    }
  };
}

async function readScanForRecommendation(db, uid, id) {
  const record = await db.doc(`users/${uid}/scans/${id}`).get();
  if (!record.exists) return null;
  const scan = record.data();
  // New scans store the variety at capture. Older records can use the recorded
  // growing-area variety when their original scan did not store a snapshot.
  if (!Object.hasOwn(scan, "cultivar") && typeof scan.plotId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(scan.plotId)) {
    const plot = await db.doc(`users/${uid}/plots/${scan.plotId}`).get();
    return { ...scan, cultivar: plot.data()?.variety };
  }
  return scan;
}

function createRecommendationService({ store, getScan, loadPhoto, hasPhotoConsent, requireActiveAccount, withAccountLock,
  apiKey = process.env.GEMINI_API_KEY || "", provider = requestGemini, now = () => new Date(), fetchImpl, timeoutMs = PROVIDER_TIMEOUT_MS }) {
  const available = Boolean(apiKey.trim());
  const inFlight = new Map();
  let providerBusy = false;

  async function load(uid, id) {
    await requireActiveAccount(uid);
    const scan = await getScan(uid, id);
    if (!scan) throw failure("Scan not found.", 404);
    if (scan.deletionInProgress === true) throw failure("Scan deletion is in progress.", 409);
    return scan;
  }

  async function readCached(uid, id, prepared) {
    const current = await store.read(uid, id, prepared.fingerprint);
    if (current) return current;
    for (const fingerprint of prepared.previousFingerprints || []) {
      const previous = await store.read(uid, id, fingerprint);
      if (!previous) continue;
      if (previous.source === "standard") return standardRecommendation(prepared, new Date(previous.generatedAt));
      try {
        const { analysis, concerns, actions, tips } = previous;
        validateContent({ analysis, concerns, actions, tips }, prepared);
        return previous;
      } catch { /* Old advice must satisfy today's stricter content rules. */ }
    }
    return null;
  }

  async function read(uid, id) {
    return withAccountLock(uid, async () => {
      const prepared = prepareScan(await load(uid, id));
      return { available, recommendation: await readCached(uid, id, prepared) || standardRecommendation(prepared, now()) };
    });
  }

  async function generate(uid, id, data, signal) {
    function checkCancelled() { if (signal?.aborted) throw failure("Recommendation request was cancelled.", 499); }
    checkCancelled();
    if (!data || typeof data !== "object" || Array.isArray(data)
        || typeof data.regenerate !== "boolean" || data.consentVersion !== CONSENT_VERSION
        || Object.keys(data).some(key => !["regenerate", "consentVersion"].includes(key))) {
      throw failure("Confirm the AI data notice before requesting recommendations.");
    }
    const key = `${uid}:${id}`;
    if (inFlight.has(key)) return inFlight.get(key);
    const operation = withAccountLock(uid, async () => {
      checkCancelled();
      const scan = await load(uid, id);
      const prepared = prepareScan(scan);
      const cached = await readCached(uid, id, prepared);
      checkCancelled();
      if (cached && !data.regenerate && !(prepared.photoReview && cached.source === "standard")) {
        return { available, recommendation: cached };
      }
      const standard = standardRecommendation(prepared, now());
      if (prepared.inconclusive && !prepared.photoReview) {
        try { await store.write(uid, id, prepared.fingerprint, standard); }
        catch {
          const error = failure("The recommendation could not be saved. Your scan is still saved.", 503, undefined, "AI_STORAGE_UNAVAILABLE");
          error.result = { available, recommendation: cached || standard };
          throw error;
        }
        return { available, recommendation: standard };
      }
      if (!available) return { available, recommendation: cached || standard };
      const fallback = { available, recommendation: cached || standard };
      async function checkPhotoConsent() {
        if (!hasPhotoConsent || await hasPhotoConsent(uid)) return;
        const error = failure("Enable photo-based recommendations before sending this scan to Gemini.", 403, undefined, "AI_PHOTO_CONSENT_REQUIRED");
        error.result = fallback;
        throw error;
      }
      await checkPhotoConsent();
      if (providerBusy) {
        const busy = failure("AI recommendations are busy. Please try again shortly.", 429, 20);
        busy.result = { available, recommendation: cached || standard };
        throw busy;
      }
      providerBusy = true;
      try {
        checkCancelled();
        const photo = await loadPhoto(uid, id, scan).catch(() => null);
        if (!Buffer.isBuffer(photo) || photo.length < 3 || photo.length > 10 * 1024 * 1024
            || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) {
          const error = failure("The saved scan photo is unavailable. You can still use the standard guidance.", 503, undefined, "AI_PHOTO_UNAVAILABLE");
          error.result = fallback;
          throw error;
        }
        checkCancelled();
        await checkPhotoConsent();
        try { await store.reserve(uid, now()); }
        catch (error) {
          if (error.status === 429) throw error;
          throw failure("Recommendation limits could not be saved. Please try again later.", 503, undefined, "AI_STORAGE_UNAVAILABLE");
        }
        checkCancelled();
        let recommendation;
        try {
          recommendation = await provider(prepared, { apiKey, photo, fetchImpl, timeoutMs, now, signal });
        } catch (error) {
          if (error.status === 499) throw error;
          const status = error.status === 429 ? 429 : 503;
          const publicError = failure([429, 503].includes(error.status) ? error.message : "AI recommendations are temporarily unavailable. Please try again later.", status, error.retryAfter);
          if (PUBLIC_AI_ERROR_CODES.includes(error.code)) publicError.code = error.code;
          publicError.result = { available, recommendation: cached || standard };
          throw publicError;
        }
        // Account locks cover local deletion. Recheck after the network call as
        // well, so an external account deletion or record edit cannot recreate
        // a deleted directory or attach advice to changed model results.
        const current = prepareScan(await load(uid, id));
        checkCancelled();
        if (current.fingerprint !== prepared.fingerprint) throw failure("This scan changed while recommendations were being generated. Please try again.", 409);
        try { await store.write(uid, id, prepared.fingerprint, recommendation); }
        catch { throw failure("The recommendation could not be saved. Your scan is still saved.", 503, undefined, "AI_STORAGE_UNAVAILABLE"); }
        return { available, recommendation };
      } catch (error) {
        if (["EACCES", "EPERM", "ENOSPC", "EIO", "EROFS"].includes(error.code)) {
          error = failure("The recommendation could not be saved. Your scan is still saved.", 503, undefined, "AI_STORAGE_UNAVAILABLE");
        }
        if ((error.status === 429 || error.code === "AI_STORAGE_UNAVAILABLE") && !error.result) error.result = { available, recommendation: cached || standard };
        throw error;
      } finally { providerBusy = false; }
    });
    inFlight.set(key, operation);
    try { return await operation; }
    finally { if (inFlight.get(key) === operation) inFlight.delete(key); }
  }
  return { available, read, generate };
}

module.exports = { createStore, createRecommendationService, atomicJson, validCachedRecommendation, readScanForRecommendation };
