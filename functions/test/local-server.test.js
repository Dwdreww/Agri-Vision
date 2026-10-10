"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { test } = require("node:test");
const { createApp } = require("../local-server");
const { createStore } = require("../local-recommendations");
const { MODEL } = require("../recommendations");

const scan = { topClass: "Crown Rot Disease", topConfidence: 91, detectionCount: 1, statusType: "risk", modelVersion: "pilot-v1", recommendation: "Existing scanner next step." };
const consent = { regenerate: false, consentVersion: "2026-10-08" };
async function endpointFixture(t, { apiKey = "test-key", provider, now } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agri-api-test-"));
  const scanDirectory = (uid, id) => path.join(directory, uid, "scans", ...(id ? [id] : []));
  const records = new Map([
    ["users/alice", {}], ["users/bob", {}], ["users/locked", { deletionInProgress: true }],
    ["users/alice/scans/one", { ...scan }], ["users/bob/scans/private", { ...scan, topClass: "No Disease", statusType: "healthy" }],
    ["users/alice/scans/deleting", { ...scan, deletionInProgress: true }],
    ["users/alice/scans/imported", { topClass: "Unknown", topConfidence: null, detectionCount: 0, statusType: "monitor", importedFromLegacy: true }]
  ]);
  let calls = 0;
  const app = createApp({
    auth: { verifyIdToken: async (token, revoked) => {
      assert.equal(revoked, true);
      if (!["alice", "bob", "locked"].includes(token)) throw Object.assign(new Error("invalid"), { code: "auth/invalid-id-token" });
      return { uid: token };
    } },
    db: { doc: name => ({ get: async () => ({ exists: records.has(name), get: key => records.get(name)?.[key], data: () => records.get(name) }) }) },
    handlers: {
      deleteScan: { run: async request => {
        const name = `users/${request.auth.uid}/scans/${request.data.scanId}`;
        if (!records.has(name)) throw Object.assign(new Error("Scan not found."), { status: 404 });
        records.delete(name);
        await fs.rm(scanDirectory(request.auth.uid, request.data.scanId), { force: true, recursive: true });
        return { deleted: true };
      } }
    },
    photoStore: { scanDirectory },
    recommendationStore: createStore({ scanDirectory, rootDirectory: directory }),
    apiKey, ...(now ? { now } : {}), recommendationProvider: async (...args) => {
      calls++;
      if (provider) return provider(...args);
      return { source: "gemini", analysis: "The model reported possible Crown Rot Disease. Inspect the sample.", concerns: [],
        actions: [{ text: "Check drainage.", reason: "Review moisture conditions." }], tips: [], provider: "Google Gemini", model: MODEL, generatedAt: "2026-10-08T00:00:00.000Z" };
    }
  });
  const server = await new Promise(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const base = `http://127.0.0.1:${server.address().port}/api/workspace`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { force: true, recursive: true }); });
  async function request(route, { uid = "alice", method = "GET", body, signal } = {}) {
    return fetch(`${base}/${route}`, { method, headers: { ...(uid ? { Authorization: `Bearer ${uid}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal });
  }
  return { request, records, directory, scanDirectory, calls: () => calls };
}

test("HTTP recommendation routes authenticate, isolate accounts and never generate on GET", async t => {
  const f = await endpointFixture(t);
  const health = await f.request("health", { uid: null });
  assert.equal((await health.json()).recommendations, true);
  for (const uid of [null, "expired"]) assert.equal((await f.request("scans/one/recommendations", { uid })).status, 401);
  assert.equal((await f.request("scans/private/recommendations")).status, 404);
  assert.equal((await f.request("scans/one/recommendations", { uid: "bob" })).status, 404);
  assert.equal((await f.request("scans/one/recommendations", { uid: "locked" })).status, 409);
  assert.equal((await f.request("scans/deleting/recommendations")).status, 409);
  const read = await f.request("scans/one/recommendations");
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.deepEqual(await read.json(), { available: true, recommendation: null });
  assert.equal(f.calls(), 0);
  assert.equal((await f.request("scans/one/recommendations", { method: "POST", body: { ...consent, consentVersion: "old" } })).status, 400);
  const generated = await f.request("scans/one/recommendations", { method: "POST", body: consent });
  assert.equal(generated.status, 200);
  assert.equal((await generated.json()).recommendation.source, "gemini");
  const cached = await f.request("scans/one/recommendations", { method: "POST", body: consent });
  assert.equal(cached.status, 200);
  assert.equal(f.calls(), 1);
  assert.deepEqual(f.records.get("users/alice/scans/one"), scan);
  const limited = await f.request("scans/one/recommendations", { method: "POST", body: { ...consent, regenerate: true } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal((await limited.json()).recommendation.source, "gemini");
});

test("HTTP missing key and null-confidence imports remain usable and sidecars delete with scan", async t => {
  const f = await endpointFixture(t, { apiKey: "" });
  assert.equal((await (await f.request("health")).json()).recommendations, false);
  const result = await f.request("scans/one/recommendations", { method: "POST", body: consent });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).recommendation.source, "standard");
  const imported = await f.request("scans/imported/recommendations", { method: "POST", body: consent });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).recommendation.source, "standard");
  assert.equal((await (await f.request("scans/imported/recommendations")).json()).recommendation.source, "standard");
  await fs.access(path.join(f.scanDirectory("alice", "imported"), "recommendations.json"));
  const removed = await f.request("actions/deleteScan", { method: "POST", body: { scanId: "imported" } });
  assert.equal(removed.status, 200);
  await assert.rejects(fs.access(f.scanDirectory("alice", "imported")));
  assert.equal(f.calls(), 0);
});

test("HTTP provider rate limits retain safe guidance and a retry header", async t => {
  const f = await endpointFixture(t, { provider: async () => { throw Object.assign(new Error("The AI request allowance is currently unavailable."), { status: 429, retryAfter: 75 }); } });
  const response = await f.request("scans/one/recommendations", { method: "POST", body: consent });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "75");
  const body = await response.json();
  assert.equal(body.available, true);
  assert.equal(body.recommendation.source, "standard");
  assert.ok(!JSON.stringify(body).includes("test-key"));
  assert.equal(f.calls(), 1);
});
