"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { MODEL, CONSENT_VERSION, SCHEMA_VERSION, failure, prepareScan, standardRecommendation, requestGemini } = require("./recommendations");

async function readJson(file, { optional = true, cache = false } = {}) {
  try {
    const stat = await fs.stat(file);
    if (stat.size > 64 * 1024) throw new Error("Private metadata is too large");
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((optional && error.code === "ENOENT") || cache) return null;
    throw failure("Recommendation storage is temporarily unavailable.", 503);
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
    && Array.isArray(value.actions) && value.actions.length > 0 && value.actions.length <= 4
    && value.actions.every(action => action && text(action.text) && text(action.reason))
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
          throw failure("Recommendation limits are temporarily unavailable.", 503);
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

function createRecommendationService({ store, getScan, requireActiveAccount, withAccountLock,
  apiKey = process.env.GEMINI_API_KEY || "", provider = requestGemini, now = () => new Date(), fetchImpl, timeoutMs = 20000 }) {
  const available = Boolean(apiKey.trim());
  const inFlight = new Map();
  let providerBusy = false;

  async function load(uid, id) {
    await requireActiveAccount(uid);
    const scan = await getScan(uid, id);
    if (!scan) throw failure("Scan not found.", 404);
    if (scan.deletionInProgress === true) throw failure("Scan deletion is in progress.", 409);
    return prepareScan(scan);
  }

  async function read(uid, id) {
    return withAccountLock(uid, async () => {
      const prepared = await load(uid, id);
      return { available, recommendation: await store.read(uid, id, prepared.fingerprint) };
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
      const prepared = await load(uid, id);
      const cached = await store.read(uid, id, prepared.fingerprint);
      checkCancelled();
      if (cached && !data.regenerate) return { available, recommendation: cached };
      const standard = standardRecommendation(prepared, now());
      if (prepared.inconclusive) {
        await store.write(uid, id, prepared.fingerprint, standard);
        return { available, recommendation: standard };
      }
      if (!available) return { available, recommendation: cached || standard };
      if (providerBusy) {
        const busy = failure("AI recommendations are busy. Please try again shortly.", 429, 20);
        busy.result = { available, recommendation: cached || standard };
        throw busy;
      }
      providerBusy = true;
      try {
        checkCancelled();
        await store.reserve(uid, now());
        checkCancelled();
        let recommendation;
        try {
          recommendation = await provider(prepared, { apiKey, fetchImpl, timeoutMs, now, signal });
        } catch (error) {
          if (error.status === 499) throw error;
          const status = error.status === 429 ? 429 : 503;
          const publicError = failure([429, 503].includes(error.status) ? error.message : "AI recommendations are temporarily unavailable. Please try again later.", status, error.retryAfter);
          publicError.result = { available, recommendation: cached || standard };
          throw publicError;
        }
        // Account locks cover local deletion. Recheck after the network call as
        // well, so an external account deletion or record edit cannot recreate
        // a deleted directory or attach advice to changed model results.
        const current = await load(uid, id);
        checkCancelled();
        if (current.fingerprint !== prepared.fingerprint) throw failure("This scan changed while recommendations were being generated. Please try again.", 409);
        await store.write(uid, id, prepared.fingerprint, recommendation);
        return { available, recommendation };
      } catch (error) {
        if (error.status === 429 && !error.result) error.result = { available, recommendation: cached || standard };
        throw error;
      } finally { providerBusy = false; }
    });
    inFlight.set(key, operation);
    try { return await operation; }
    finally { if (inFlight.get(key) === operation) inFlight.delete(key); }
  }
  return { available, read, generate };
}

module.exports = { createStore, createRecommendationService, atomicJson };
