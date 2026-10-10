"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { sanitizedResearchResult } = require("./research");
const localPhotos = require("./local-photos");

initializeApp();

const db = getFirestore();
const REGION = "asia-southeast1";
const callableOptions = { region: REGION, maxInstances: 5, timeoutSeconds: 120 };
const deletionOptions = { region: REGION, maxInstances: 2, timeoutSeconds: 540, memory: "512MiB" };

function authenticatedUid(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to continue.");
  }
  return uid;
}

function requestedScanId(request) {
  const scanId = request.data?.scanId;
  if (typeof scanId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(scanId)) {
    throw new HttpsError("invalid-argument", "A valid scanId is required.");
  }
  return scanId;
}

function privateScanRef(uid, scanId) {
  return db.doc(`users/${uid}/scans/${scanId}`);
}

function userRef(uid) {
  return db.doc(`users/${uid}`);
}

function requireActiveProfile(snapshot) {
  if (!snapshot.exists) {
    throw new HttpsError("failed-precondition", "Complete account setup first.");
  }
  if (snapshot.get("deletionInProgress") === true) {
    throw new HttpsError("failed-precondition", "Account deletion is in progress.");
  }
}

function requireExistingScan(snapshot) {
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Scan not found.");
  }
  if (snapshot.get("deletionInProgress") === true) {
    throw new HttpsError("failed-precondition", "Scan deletion is in progress.");
  }
}

function requireAvailablePhotos(snapshot) {
  if (snapshot.get("hasPhotos") === true
      && localPhotos.enabled() !== (snapshot.get("storageProvider") === "local")) {
    throw new HttpsError("failed-precondition", "Remove this scan from the workspace where its photos are stored.");
  }
}

function publicError(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Firebase operation failed", error);
      throw new HttpsError("internal", "The operation could not be completed. Please retry.");
    }
  };
}

async function deleteFileIfPresent(file) {
  try {
    await file.delete();
  } catch (error) {
    if (error.code !== 404) throw error;
  }
}

async function deleteFilesUnder(prefix) {
  if (localPhotos.enabled()) {
    await localPhotos.removePrefix(prefix);
    return;
  }
  const [files] = await getStorage().bucket().getFiles({ prefix });
  for (let index = 0; index < files.length; index += 20) {
    await Promise.all(files.slice(index, index + 20).map(deleteFileIfPresent));
  }
}

exports.shareScanResult = onCall(callableOptions, publicError(async (request) => {
  const uid = authenticatedUid(request);
  const scanId = requestedScanId(request);
  const scanRef = privateScanRef(uid, scanId);
  let resultId;

  await db.runTransaction(async (transaction) => {
    const [profile, scan] = await Promise.all([
      transaction.get(userRef(uid)),
      transaction.get(scanRef),
    ]);
    requireActiveProfile(profile);
    requireExistingScan(scan);

    let result;
    try {
      result = sanitizedResearchResult(scan.data());
    } catch (error) {
      throw new HttpsError("failed-precondition", error.message);
    }

    resultId = scan.get("researchResultId") || db.collection("researchResults").doc().id;
    transaction.set(db.doc(`researchResults/${resultId}`), result);
    transaction.update(scanRef, {
      shareForResearch: true,
      researchResultId: resultId,
      researchSharedAt: FieldValue.serverTimestamp(),
    });
  });

  return { shared: true };
}));

exports.revokeScanResult = onCall(callableOptions, publicError(async (request) => {
  const uid = authenticatedUid(request);
  const scanRef = privateScanRef(uid, requestedScanId(request));

  await db.runTransaction(async (transaction) => {
    const [profile, scan] = await Promise.all([
      transaction.get(userRef(uid)),
      transaction.get(scanRef),
    ]);
    requireActiveProfile(profile);
    requireExistingScan(scan);
    const resultId = scan.get("researchResultId");
    if (resultId) transaction.delete(db.doc(`researchResults/${resultId}`));
    transaction.update(scanRef, {
      shareForResearch: false,
      researchResultId: FieldValue.delete(),
      researchSharedAt: FieldValue.delete(),
    });
  });

  return { shared: false };
}));

exports.deleteScan = onCall(callableOptions, publicError(async (request) => {
  const uid = authenticatedUid(request);
  const scanId = requestedScanId(request);
  const scanRef = privateScanRef(uid, scanId);

  // Lock the scan before external file deletion. A failed call can be retried.
  let resultId;
  await db.runTransaction(async (transaction) => {
    const [profile, scan] = await Promise.all([
      transaction.get(userRef(uid)),
      transaction.get(scanRef),
    ]);
    requireActiveProfile(profile);
    if (!scan.exists) throw new HttpsError("not-found", "Scan not found.");
    requireAvailablePhotos(scan);
    resultId = scan.get("researchResultId");
    transaction.update(scanRef, { deletionInProgress: true });
  });

  if (resultId) await db.doc(`researchResults/${resultId}`).delete();
  await deleteFilesUnder(`users/${uid}/scans/${scanId}/`);
  await scanRef.delete();
  return { deleted: true };
}));

exports.deleteAccount = onCall(deletionOptions, publicError(async (request) => {
  const uid = authenticatedUid(request);
  if (request.data?.confirm !== true) {
    throw new HttpsError("invalid-argument", "Account deletion must be confirmed.");
  }
  const authTime = Number(request.auth.token.auth_time);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authTime) || authTime < now - 300 || authTime > now + 30) {
    throw new HttpsError("failed-precondition", "Sign in again before deleting your account.");
  }

  const profileRef = userRef(uid);
  await db.runTransaction(async (transaction) => {
    const scans = await transaction.get(profileRef.collection("scans"));
    for (const scan of scans.docs) requireAvailablePhotos(scan);
    transaction.set(profileRef, { deletionInProgress: true }, { merge: true });
  });

  // Remove every contributed result before removing the private scan records
  // that hold the otherwise anonymous research document IDs.
  const scans = await profileRef.collection("scans").get();
  for (const scan of scans.docs) requireAvailablePhotos(scan);
  const resultIds = [...new Set(scans.docs.map((scan) => scan.get("researchResultId")).filter(Boolean))];
  for (let index = 0; index < resultIds.length; index += 400) {
    const batch = db.batch();
    for (const resultId of resultIds.slice(index, index + 400)) {
      batch.delete(db.doc(`researchResults/${resultId}`));
    }
    await batch.commit();
  }

  await deleteFilesUnder(`users/${uid}/scans/`);
  await db.recursiveDelete(profileRef);
  await getAuth().deleteUser(uid);
  return { deleted: true };
}));
