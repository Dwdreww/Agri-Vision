"use strict";
const { FieldValue } = require("firebase-admin/firestore");
const { sanitizedResearchResult } = require("./research");
class WorkspaceOperationError extends Error {
  constructor(code, message) { super(message); this.name = "WorkspaceOperationError"; this.code = code; }
}
function createWorkspaceOperations({ db, auth, photos }) {
function authenticatedUid(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new WorkspaceOperationError("unauthenticated", "Sign in to continue.");
  }
  return uid;
}

function requestedScanId(request) {
  const scanId = request.data?.scanId;
  if (typeof scanId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(scanId)) {
    throw new WorkspaceOperationError("invalid-argument", "A valid scanId is required.");
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
    throw new WorkspaceOperationError("failed-precondition", "Complete account setup first.");
  }
  if (snapshot.get("deletionInProgress") === true) {
    throw new WorkspaceOperationError("failed-precondition", "Account deletion is in progress.");
  }
}

function requireExistingScan(snapshot) {
  if (!snapshot.exists) {
    throw new WorkspaceOperationError("not-found", "Scan not found.");
  }
  if (snapshot.get("deletionInProgress") === true) {
    throw new WorkspaceOperationError("failed-precondition", "Scan deletion is in progress.");
  }
}

function requireAvailablePhotos(snapshot) {
  if (snapshot.get("hasPhotos") === true && !photos.supports(snapshot.get("storageProvider") || "firebase")) {
    throw new WorkspaceOperationError("failed-precondition", "This record's photos have not been moved to this workspace yet.");
  }
}

const shareScanResult = async (request) => {
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
      throw new WorkspaceOperationError("failed-precondition", error.message);
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
};

const revokeScanResult = async (request) => {
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
};

const deleteScan = async (request) => {
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
    if (!scan.exists) throw new WorkspaceOperationError("not-found", "Scan not found.");
    requireAvailablePhotos(scan);
    resultId = scan.get("researchResultId");
    transaction.update(scanRef, { deletionInProgress: true });
  });

  if (resultId) await db.doc(`researchResults/${resultId}`).delete();
  await photos.removePrefix(`users/${uid}/scans/${scanId}/`);
  await db.recursiveDelete(scanRef);
  return { deleted: true };
};

const deleteAccount = async (request) => {
  const uid = authenticatedUid(request);
  if (request.data?.confirm !== true) {
    throw new WorkspaceOperationError("invalid-argument", "Account deletion must be confirmed.");
  }
  const authTime = Number(request.auth.token.auth_time);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authTime) || authTime < now - 300 || authTime > now + 30) {
    throw new WorkspaceOperationError("failed-precondition", "Sign in again before deleting your account.");
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

  await photos.removePrefix(`users/${uid}/scans/`);
  await db.recursiveDelete(profileRef);
  await auth.deleteUser(uid);
  return { deleted: true };
};

return { shareScanResult, revokeScanResult, deleteScan, deleteAccount };
}
module.exports = { createWorkspaceOperations, WorkspaceOperationError };
