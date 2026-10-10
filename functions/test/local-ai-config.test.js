"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

test("private AI config parses a small whitelist and never reaches frontend child environments", async t => {
  const { parseAiEnvironment, loadAiEnvironment, withoutAiSecrets } = await import("../../scripts/local-ai-config.mjs");
  assert.deepEqual(parseAiEnvironment("# private\nGEMINI_API_KEY='fake-key'\nAGRI_VISION_AI_GLOBAL_DAILY_LIMIT=20\n"), { GEMINI_API_KEY: "fake-key", AGRI_VISION_AI_GLOBAL_DAILY_LIMIT: "20" });
  for (const text of ["VITE_GEMINI_API_KEY=key", "GEMINI_API_KEY=one\nGEMINI_API_KEY=two", "GEMINI_API_KEY=$(command)", "AGRI_VISION_AI_GLOBAL_DAILY_LIMIT=-2"]) assert.throws(() => parseAiEnvironment(text));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agri-ai-config-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "ai.env");
  assert.deepEqual(loadAiEnvironment(file, {}), {});
  await fs.writeFile(file, "GEMINI_API_KEY=file-key\n", { mode: 0o600 });
  assert.deepEqual(loadAiEnvironment(file, {}), { GEMINI_API_KEY: "file-key" });
  assert.deepEqual(loadAiEnvironment(file, { GEMINI_API_KEY: "environment-key" }), { GEMINI_API_KEY: "environment-key" });
  await fs.chmod(file, 0o644);
  assert.throws(() => loadAiEnvironment(file, {}), /chmod 600/);
  assert.deepEqual(withoutAiSecrets({ GEMINI_API_KEY: "secret", GOOGLE_API_KEY: "other", VITE_GEMINI_API_KEY: "bad", VITE_FIREBASE_API_KEY: "public", PATH: "path" }), { VITE_FIREBASE_API_KEY: "public", PATH: "path" });
});
