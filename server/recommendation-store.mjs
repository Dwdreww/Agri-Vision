import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validCachedRecommendation } = require('../functions/local-recommendations.js');
const { SCHEMA_VERSION, failure } = require('../functions/recommendations.js');

export const recommendationPath = (uid, id) => `users/${uid}/scans/${id}/private/recommendations`;
const limit = (value, fallback, maximum) => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? Math.min(Number(value), maximum) : fallback;
export function createRecommendationStore(db, {
  ownerLimit = limit(process.env.AGRI_VISION_AI_OWNER_DAILY_LIMIT, 10, 10),
  globalLimit = limit(process.env.AGRI_VISION_AI_GLOBAL_DAILY_LIMIT, 50, 50),
  cooldownMs = limit(process.env.AGRI_VISION_AI_COOLDOWN_SECONDS, 30, 86400) * 1000
} = {}) {
  return {
    async read(uid, id, fingerprint) {
      const record = await db.doc(recommendationPath(uid, id)).get();
      if (!record.exists) return null;
      const cached = record.data();
      return cached.version === SCHEMA_VERSION && cached.fingerprint === fingerprint && validCachedRecommendation(cached.recommendation) ? cached.recommendation : null;
    },
    async write(uid, id, fingerprint, recommendation) {
      await db.doc(recommendationPath(uid, id)).set({ version: SCHEMA_VERSION, fingerprint, recommendation });
    },
    async reserve(uid, date) {
      const ownerRef = db.doc(`users/${uid}/private/recommendation-usage`);
      const globalRef = db.doc('serverState/recommendation-usage');
      const day = date.toISOString().slice(0, 10);
      const now = date.getTime();
      await db.runTransaction(async tx => {
        const [ownerSnapshot, globalSnapshot] = await Promise.all([tx.get(ownerRef), tx.get(globalRef)]);
        const owner = ownerSnapshot.data();
        const global = globalSnapshot.data();
        for (const ledger of [owner, global]) {
          if (ledger && (!/^\d{4}-\d{2}-\d{2}$/.test(ledger.day || '') || !Number.isInteger(ledger.count) || ledger.count < 0 || !Number.isFinite(ledger.lastAttemptAt))) {
            throw failure('Recommendation limits are temporarily unavailable.', 503, undefined, 'AI_STORAGE_UNAVAILABLE');
          }
        }
        const cooldown = owner ? cooldownMs - (now - owner.lastAttemptAt) : 0;
        if (cooldown > 0) throw failure('Please wait before generating recommendations again.', 429, Math.ceil(cooldown / 1000));
        const ownerCount = owner?.day === day ? owner.count : 0;
        const globalCount = global?.day === day ? global.count : 0;
        if (ownerCount >= ownerLimit || globalCount >= globalLimit) {
          const tomorrow = new Date(`${day}T00:00:00.000Z`).getTime() + 86400000;
          throw failure("Today's recommendation allowance has been used. Standard guidance remains available.", 429, Math.max(1, Math.ceil((tomorrow - now) / 1000)));
        }
        tx.set(ownerRef, { day, count: ownerCount + 1, lastAttemptAt: now });
        tx.set(globalRef, { day, count: globalCount + 1, lastAttemptAt: now });
      });
    }
  };
}
