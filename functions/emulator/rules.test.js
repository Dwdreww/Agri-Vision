"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");

const projectId = "demo-agri-vision-rules-test";
const root = path.resolve(__dirname, "../..");
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.join(root, "firestore.rules"), "utf8") },
    storage: { rules: fs.readFileSync(path.join(root, "storage.rules"), "utf8") },
  });
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      db.doc("users/alice").set({ createdAt: new Date() }),
      db.doc("users/bob").set({ createdAt: new Date() }),
      db.doc("users/locked").set({ deletionInProgress: true }),
      db.doc("users/alice/scans/saved").set({
        topClass: "No Disease",
        topConfidence: 90,
        detectionCount: 1,
        statusType: "healthy",
        modelVersion: "pilot-v1",
        shareForResearch: true,
        researchResultId: "random-copy",
      }),
      db.doc("users/alice/scans/deleting").set({ deletionInProgress: true }),
      db.doc("researchResults/random-copy").set({ topClass: "No Disease", month: "2026-10" }),
    ]);
  });
});

after(async () => {
  if (env) await env.cleanup();
});

test("accounts cannot read or change another account's records", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  const bob = env.authenticatedContext("bob").firestore();
  await assertSucceeds(alice.doc("users/alice/scans/saved").get());
  await assertFails(bob.doc("users/alice/scans/saved").get());
  await assertFails(bob.doc("users/alice/farms/foreign").set({ name: "Foreign" }));
  await assertSucceeds(alice.doc("users/alice/farms/owned").set({ name: "Owned" }));
});

test("client cannot publish research or change managed scan fields", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  await assertFails(alice.doc("researchResults/forged").set({ topClass: "Forged" }));
  await assertFails(alice.doc("users/alice/scans/saved").update({ shareForResearch: false }));
  await assertFails(alice.doc("users/alice/scans/saved").update({ topClass: "Changed" }));
  await assertFails(alice.doc("users/alice/scans/saved").delete());
  await assertSucceeds(alice.doc("users/alice/scans/saved").update({ plotId: "plot1" }));
});

test("research claim reads only sanitized collection", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  const researcher = env.authenticatedContext("researcher", { researcher: true }).firestore();
  await assertFails(alice.doc("researchResults/random-copy").get());
  await assertSucceeds(researcher.doc("researchResults/random-copy").get());
  await assertFails(researcher.doc("users/alice/scans/saved").get());
});

test("storage keeps scans private and allows cleanup before scan save", async () => {
  const alice = env.authenticatedContext("alice").storage();
  const bob = env.authenticatedContext("bob").storage();
  const temporary = alice.ref("users/alice/scans/temporary/prepared.jpg");
  await assertSucceeds(temporary.putString("jpeg", "raw", { contentType: "image/jpeg" }));
  await assertFails(bob.ref("users/alice/scans/temporary/prepared.jpg").getMetadata());
  await assertSucceeds(temporary.delete());

  const saved = alice.ref("users/alice/scans/saved/prepared.jpg");
  await assertSucceeds(saved.putString("jpeg", "raw", { contentType: "image/jpeg" }));
  await assertFails(saved.delete());
  await assertFails(alice.ref("users/alice/scans/deleting/prepared.jpg")
    .putString("jpeg", "raw", { contentType: "image/jpeg" }));
  await assertFails(env.authenticatedContext("locked").storage()
    .ref("users/locked/scans/temporary/prepared.jpg")
    .putString("jpeg", "raw", { contentType: "image/jpeg" }));
});
