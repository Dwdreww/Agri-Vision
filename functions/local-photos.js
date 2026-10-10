"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function enabled() {
  return process.env.AGRI_VISION_SERVER_MODE === "local" && Boolean(process.env.AGRI_VISION_PHOTO_DIR);
}

function scanDirectory(uid, scanId) {
  if (!enabled()) throw new Error("Local photo storage is not configured");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || (scanId && !/^[A-Za-z0-9_-]{1,128}$/.test(scanId))) {
    throw new Error("Invalid private photo path");
  }
  return path.join(path.resolve(process.env.AGRI_VISION_PHOTO_DIR), uid, "scans", ...(scanId ? [scanId] : []));
}

async function save(uid, scanId, images) {
  const destination = scanDirectory(uid, scanId);
  const temporary = `${destination}.upload-${randomUUID()}`;
  await fs.mkdir(temporary, { recursive: true, mode: 0o700 });
  try {
    for (const name of ["prepared", "annotated"]) {
      const bytes = images[name];
      if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > 10 * 1024 * 1024
          || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
        throw Object.assign(new Error("Upload two JPEG photos, each no larger than 10 MiB"), { status: 400 });
      }
      await fs.writeFile(path.join(temporary, `${name}.jpg`), bytes, { mode: 0o600, flag: "wx" });
    }
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function removePrefix(prefix) {
  const match = /^users\/([A-Za-z0-9_-]{1,128})\/scans\/(?:([A-Za-z0-9_-]{1,128})\/)?$/.exec(prefix);
  if (!match) throw new Error("Invalid private photo prefix");
  await fs.rm(scanDirectory(match[1], match[2]), { recursive: true, force: true });
}

module.exports = { enabled, scanDirectory, save, removePrefix };
