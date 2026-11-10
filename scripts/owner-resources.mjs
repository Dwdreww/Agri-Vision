// Local administration only. This module is excluded from Vercel deployments.
import os from 'node:os';
import path from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { publicConfiguration, googleContext } from './cloud-admin.mjs';
export async function ownerResources() {
  const config = await publicConfiguration();
  const projectId = config.VITE_FIREBASE_PROJECT_ID;
  await googleContext(projectId); // Fail closed if billing was enabled.
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(os.homedir(), '.config/agri-vision', `${projectId}-local-session.json`);
  const app = getApps().find(a=>a.name==='local-cloud-migration') || initializeApp({projectId,credential:applicationDefault()},'local-cloud-migration');
  return { config, projectId, db:getFirestore(app), auth:getAuth(app), photoRoot:path.join(os.homedir(),'.local/share/agri-vision',projectId,'photos') };
}
