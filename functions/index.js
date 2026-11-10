"use strict";
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const localPhotos = require("./local-photos");
const { createWorkspaceOperations, WorkspaceOperationError } = require("./workspace-operations");
if (!getApps().length) initializeApp();
const REGION = "asia-southeast1";
const options = { region: REGION, maxInstances: 5, timeoutSeconds: 120 };
const deletionOptions = { region: REGION, maxInstances: 2, timeoutSeconds: 540, memory: "512MiB" };
const photos = {
  supports: provider => localPhotos.enabled() ? provider === "local" : provider === "firebase",
  async removePrefix(prefix) {
    if (localPhotos.enabled()) return localPhotos.removePrefix(prefix);
    const [files] = await getStorage().bucket().getFiles({ prefix });
    for (let index = 0; index < files.length; index += 20) {
      await Promise.all(files.slice(index, index + 20).map(async file => {
        try { await file.delete(); } catch (error) { if (error.code !== 404) throw error; }
      }));
    }
  }
};
const operations = createWorkspaceOperations({ db: getFirestore(), auth: getAuth(), photos });
function publicError(handler) {
  return async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof WorkspaceOperationError) throw new HttpsError(error.code, error.message);
      logger.error("Firebase operation failed", error);
      throw new HttpsError("internal", "The operation could not be completed. Please retry.");
    }
  };
}
for (const name of ["shareScanResult", "revokeScanResult", "deleteScan", "deleteAccount"]) {
  exports[name] = onCall(name === "deleteAccount" ? deletionOptions : options, publicError(operations[name]));
}
