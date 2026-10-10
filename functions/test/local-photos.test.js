"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const photos = require("../local-photos");

test("private photos reject traversal and invalid replacements, and delete only the requested owner", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agri-vision-photos-"));
  process.env.AGRI_VISION_SERVER_MODE = "local";
  process.env.AGRI_VISION_PHOTO_DIR = directory;
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  try {
    await photos.save("alice", "scan1", { prepared: jpeg, annotated: jpeg });
    await photos.save("bob", "scan1", { prepared: jpeg, annotated: jpeg });
    assert.throws(() => photos.scanDirectory("../bob", "scan1"));
    assert.throws(() => photos.scanDirectory("alice", "../scan1"));
    await assert.rejects(photos.removePrefix("users/alice/scans/../../bob/"));
    await assert.rejects(photos.save("alice", "scan1", { prepared: jpeg, annotated: Buffer.from("bad") }));
    assert.deepEqual(await fs.readFile(path.join(photos.scanDirectory("alice", "scan1"), "prepared.jpg")), jpeg);
    await photos.removePrefix("users/alice/scans/scan1/");
    await assert.rejects(fs.access(photos.scanDirectory("alice", "scan1")));
    await fs.access(photos.scanDirectory("bob", "scan1"));
    await photos.removePrefix("users/bob/scans/");
    await assert.rejects(fs.access(photos.scanDirectory("bob", "scan1")));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    delete process.env.AGRI_VISION_SERVER_MODE;
    delete process.env.AGRI_VISION_PHOTO_DIR;
  }
});
