"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { test } = require("node:test");
const { createStore, createRecommendationService } = require("../local-recommendations");
const { MODEL, prepareScan } = require("../recommendations");

const consent = { regenerate: false, consentVersion: "2026-10-08" };
const scan = { topClass: "Crown Rot Disease", topConfidence: 90, detectionCount: 1, statusType: "risk", modelVersion: "pilot-v1" };
function lockFactory() {
  const locks = new Map();
  return async (uid, operation) => {
    const promise = (locks.get(uid) || Promise.resolve()).catch(() => {}).then(operation);
    locks.set(uid, promise);
    try { return await promise; } finally { if (locks.get(uid) === promise) locks.delete(uid); }
  };
}
function advice(date = new Date()) {
  return { source: "gemini", analysis: "The model reported possible Crown Rot Disease. Inspect the plant in person.", concerns: [],
    actions: [{ text: "Check the crown.", reason: "A photo cannot establish the actual cause." }], tips: [],
    provider: "Google Gemini", model: MODEL, generatedAt: date.toISOString() };
}
async function fixture(t, { provider, apiKey = "test-key", limits = {} } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agri-recommendations-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const scanDirectory = (uid, id) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || (id && !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error("Invalid private path");
    return path.join(root, uid, "scans", ...(id ? [id] : []));
  };
  const store = createStore({ scanDirectory, rootDirectory: root, ...limits });
  const records = new Map([["alice:one", { ...scan }], ["bob:one", { ...scan }]]);
  const active = new Set(["alice", "bob"]);
  const withAccountLock = lockFactory();
  let clock = new Date("2026-10-08T00:00:00Z");
  let calls = 0;
  const options = { store, apiKey, now: () => new Date(clock), withAccountLock,
    requireActiveAccount: async uid => { if (!active.has(uid)) throw Object.assign(new Error("Account unavailable."), { status: 409 }); },
    getScan: async (uid, id) => records.get(`${uid}:${id}`),
    provider: async (...args) => { calls++; return provider ? provider(...args) : advice(clock); } };
  return { root, store, scanDirectory, records, active, options, withAccountLock,
    service: createRecommendationService(options), calls: () => calls,
    advance: (milliseconds = 31000) => { clock = new Date(clock.getTime() + milliseconds); } };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("read is side-effect free; generation caches privately and restart reuses it", async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.service.read("alice", "one"), { available: true, recommendation: null });
  assert.equal(f.calls(), 0);
  const result = await f.service.generate("alice", "one", consent);
  assert.equal(result.recommendation.source, "gemini");
  assert.equal(f.calls(), 1);
  const file = path.join(f.scanDirectory("alice", "one"), "recommendations.json");
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(file))).mode & 0o777, 0o700);
  assert.deepEqual(await f.service.read("alice", "one"), result);
  const restarted = createRecommendationService(f.options);
  assert.deepEqual(await restarted.generate("alice", "one", consent), result);
  assert.equal(f.calls(), 1);
  assert.deepEqual(f.records.get("alice:one"), scan);
  f.records.set("alice:one", { ...scan, topConfidence: 70 });
  assert.equal((await f.service.read("alice", "one")).recommendation, null);
});

test("missing key and unknown or incomplete scans return standard without provider requests", async t => {
  const f = await fixture(t, { apiKey: "" });
  const result = await f.service.generate("alice", "one", consent);
  assert.equal(result.available, false);
  assert.equal(result.recommendation.source, "standard");
  assert.equal(f.calls(), 0);
  assert.equal((await f.service.read("alice", "one")).recommendation, null);
  const enabled = createRecommendationService({ ...f.options, apiKey: "key" });
  for (const value of [{ ...scan, topClass: "Unknown" }, { ...scan, topClass: "No Detection", detectionCount: 0 }, { ...scan, topConfidence: null }, { topClass: "Unknown" }]) {
    f.records.set("alice:one", value);
    assert.equal((await enabled.generate("alice", "one", { ...consent, regenerate: true })).recommendation.source, "standard");
  }
  assert.equal(f.calls(), 0);
});

test("owner scope, account locks and consent are checked before generation", async t => {
  const f = await fixture(t);
  for (const data of [{}, { ...consent, consentVersion: "old" }, { ...consent, regenerate: "yes" }, { ...consent, uid: "bob" }]) {
    await assert.rejects(f.service.generate("alice", "one", data), error => error.status === 400);
  }
  await assert.rejects(f.service.read("alice", "foreign"), error => error.status === 404);
  await assert.rejects(f.service.generate("foreign", "one", consent), error => error.status === 409);
  f.records.set("alice:one", { ...scan, deletionInProgress: true });
  await assert.rejects(f.service.generate("alice", "one", consent), error => error.status === 409);
  assert.equal(f.calls(), 0);
});

test("a cancelled request waiting on an account lock uses no quota or provider call", async t => {
  const f = await fixture(t);
  const acquired = deferred(); const release = deferred();
  const blocker = f.withAccountLock("alice", async () => { acquired.resolve(); await release.promise; });
  await acquired.promise;
  const controller = new AbortController();
  const operation = f.service.generate("alice", "one", consent, controller.signal);
  controller.abort(); release.resolve();
  await blocker;
  await assert.rejects(operation, error => error.status === 499);
  assert.equal(f.calls(), 0);
  await assert.rejects(fs.access(path.join(f.root, ".ai-usage-global.json")));
});

test("same-scan requests deduplicate while the global provider slot rejects extra work", async t => {
  const started = deferred();
  const pending = deferred();
  const f = await fixture(t, { provider: async () => { started.resolve(); return pending.promise; } });
  const one = f.service.generate("alice", "one", consent);
  const duplicate = f.service.generate("alice", "one", { ...consent, regenerate: true });
  await started.promise;
  await assert.rejects(f.service.generate("bob", "one", consent), error => error.status === 429 && error.retryAfter === 20 && error.result.recommendation.source === "standard");
  assert.equal(f.calls(), 1);
  pending.resolve(advice());
  assert.deepEqual(await one, await duplicate);
  assert.equal(f.calls(), 1);
});

test("persistent cooldown and daily caps count attempts, while cached reads are free", async t => {
  const f = await fixture(t, { limits: { ownerDailyLimit: 2, globalDailyLimit: 3 } });
  await f.service.generate("alice", "one", consent);
  const restarted = createRecommendationService(f.options);
  await assert.rejects(restarted.generate("alice", "one", { ...consent, regenerate: true }), error => error.status === 429 && error.retryAfter === 30);
  assert.equal((await restarted.generate("alice", "one", consent)).recommendation.source, "gemini");
  f.advance();
  await restarted.generate("alice", "one", { ...consent, regenerate: true });
  f.advance();
  await assert.rejects(restarted.generate("alice", "one", { ...consent, regenerate: true }), error => error.status === 429 && /allowance/.test(error.message));
  await restarted.generate("bob", "one", consent);
  f.advance();
  await assert.rejects(restarted.generate("bob", "one", { ...consent, regenerate: true }), error => error.status === 429);
  assert.equal(f.calls(), 3);
  const global = JSON.parse(await fs.readFile(path.join(f.root, ".ai-usage-global.json"), "utf8"));
  assert.deepEqual(Object.keys(global).sort(), ["count", "day", "lastAttemptAt"]);
  assert.equal(global.count, 3);
  f.advance(86400000);
  await restarted.generate("bob", "one", { ...consent, regenerate: true });
  assert.equal(f.calls(), 4);
});

test("failed regeneration preserves cached advice and consumes one reserved attempt", async t => {
  let fail = false;
  const f = await fixture(t, { provider: async () => {
    if (fail) throw Object.assign(new Error("Provider quota reached."), { status: 429, retryAfter: 90 });
    return advice();
  } });
  const first = await f.service.generate("alice", "one", consent);
  f.advance(); fail = true;
  await assert.rejects(f.service.generate("alice", "one", { ...consent, regenerate: true }), error => error.status === 429 && error.retryAfter === 90 && error.result.recommendation.analysis === first.recommendation.analysis);
  assert.deepEqual(await f.service.read("alice", "one"), first);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.scanDirectory("alice"), ".ai-usage.json"))).count, 2);
});

test("local scan deletion waits for generation; external deletion or edit prevents a late write", async t => {
  const started = deferred(); const pending = deferred();
  const f = await fixture(t, { provider: async () => { started.resolve(); return pending.promise; } });
  const generate = f.service.generate("alice", "one", consent);
  await started.promise;
  let deleted = false;
  const remove = f.withAccountLock("alice", async () => {
    f.records.delete("alice:one");
    await fs.rm(f.scanDirectory("alice", "one"), { recursive: true, force: true }); deleted = true;
  });
  assert.equal(deleted, false);
  pending.resolve(advice());
  await generate; await remove;
  await assert.rejects(fs.access(f.scanDirectory("alice", "one")));
  await assert.rejects(f.service.read("alice", "one"), error => error.status === 404);

  for (const external of ["delete", "edit", "account"]) {
    const startedAgain = deferred(); const waitAgain = deferred();
    const second = await fixture(t, { provider: async () => { startedAgain.resolve(); return waitAgain.promise; } });
    const operation = second.service.generate("alice", "one", consent);
    await startedAgain.promise;
    if (external === "delete") second.records.delete("alice:one");
    if (external === "edit") second.records.set("alice:one", { ...scan, topConfidence: 80 });
    if (external === "account") second.active.delete("alice");
    waitAgain.resolve(advice());
    await assert.rejects(operation, error => [404, 409].includes(error.status));
    await assert.rejects(fs.access(path.join(second.scanDirectory("alice", "one"), "recommendations.json")));
  }
});

test("account cleanup removes recommendation and owner quota files; corrupt quota fails closed", async t => {
  const f = await fixture(t);
  await f.service.generate("alice", "one", consent);
  await f.service.generate("bob", "one", consent);
  await fs.rm(f.scanDirectory("alice"), { recursive: true, force: true });
  await assert.rejects(fs.access(path.join(f.scanDirectory("alice"), ".ai-usage.json")));
  await fs.access(path.join(f.scanDirectory("bob", "one"), "recommendations.json"));
  await fs.access(path.join(f.root, ".ai-usage-global.json"));
  f.advance();
  await fs.writeFile(path.join(f.scanDirectory("bob"), ".ai-usage.json"), "invalid");
  await assert.rejects(f.service.generate("bob", "one", { ...consent, regenerate: true }), error => error.status === 503);
  assert.equal(f.calls(), 2);
});

test("corrupt sidecar is ignored and invalid private limits fail at startup", async t => {
  const f = await fixture(t);
  await f.store.write("alice", "one", prepareScan(scan).fingerprint, advice());
  await fs.writeFile(path.join(f.scanDirectory("alice", "one"), "recommendations.json"), "not-json");
  assert.equal((await f.service.read("alice", "one")).recommendation, null);
  await f.store.write("alice", "one", prepareScan(scan).fingerprint, { source: "gemini", generatedAt: new Date().toISOString() });
  assert.equal((await f.service.read("alice", "one")).recommendation, null);
  assert.throws(() => createStore({ scanDirectory: f.scanDirectory, rootDirectory: f.root, globalDailyLimit: 51 }));
  assert.throws(() => createStore({ scanDirectory: f.scanDirectory, rootDirectory: f.root, ownerDailyLimit: 0 }));
});

test("default limits allow ten attempts per owner and fifty across the pilot", async t => {
  const f = await fixture(t);
  let now = new Date("2026-10-08T00:00:00Z");
  for (let owner = 0; owner < 5; owner++) {
    for (let attempt = 0; attempt < 10; attempt++) {
      await f.store.reserve(`owner${owner}`, now);
      now = new Date(now.getTime() + 31000);
    }
    await assert.rejects(f.store.reserve(`owner${owner}`, now), error => error.status === 429);
  }
  await assert.rejects(f.store.reserve("anotherOwner", now), error => error.status === 429);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root, ".ai-usage-global.json"))).count, 50);
});
