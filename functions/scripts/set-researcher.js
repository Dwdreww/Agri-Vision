#!/usr/bin/env node
"use strict";

const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function usage() {
  return "Usage: FIREBASE_PROJECT_ID=<project-id> node functions/scripts/set-researcher.js (--uid <uid> | --email <email>) (--grant | --revoke)";
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--grant" || arg === "--revoke") {
      parsed[arg.slice(2)] = true;
    } else if (arg === "--uid" || arg === "--email") {
      parsed[arg.slice(2)] = args[++index];
    } else {
      throw new Error(usage());
    }
  }
  if (!process.env.FIREBASE_PROJECT_ID ||
      Boolean(parsed.uid) === Boolean(parsed.email) ||
      Boolean(parsed.grant) === Boolean(parsed.revoke)) {
    throw new Error(usage());
  }
  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectId = process.env.FIREBASE_PROJECT_ID;
  initializeApp({ credential: applicationDefault(), projectId });
  const auth = getAuth();
  const user = options.uid
    ? await auth.getUser(options.uid)
    : await auth.getUserByEmail(options.email);
  const claims = { ...(user.customClaims || {}) };
  if (options.grant) claims.researcher = true;
  else delete claims.researcher;
  await auth.setCustomUserClaims(user.uid, claims);
  process.stdout.write(
    `${options.grant ? "Granted" : "Revoked"} researcher access for ${user.email || user.uid} ` +
    `(uid ${user.uid}) in ${projectId}. The user must refresh their ID token.\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
