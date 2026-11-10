import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseAiEnvironment } from './local-ai-config.mjs';
import { publicConfiguration, privateDirectory, vercelContext, reportFailure } from './cloud-admin.mjs';

async function configure() {
  const v = await vercelContext();
  const identity = JSON.parse(await fs.readFile(path.join(privateDirectory, 'cloud-identity.json'), 'utf8'));
  const publicEnv = await publicConfiguration();
  const ai = parseAiEnvironment(await fs.readFile(path.join(os.homedir(), '.config/agri-vision/ai.env'), 'utf8'));
  const values = { ...Object.fromEntries(Object.entries(publicEnv).filter(([key]) => key.startsWith('VITE_FIREBASE_'))),
    ...identity.environment, ...ai, BLOB_STORE_ID: 'store_SPQe9boVtwptCeSk', VITE_WORKSPACE_MODE: 'cloud' };
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ keys: Object.keys(values), targets: ['production','preview'], staticGoogleKeys: false })); return; }
  for (const [key,value] of Object.entries(values)) {
    const result = await v.request(`/v10/projects/${v.project.projectId}/env?upsert=true`, { method: 'POST', data: { key, value: String(value), type: key === 'GEMINI_API_KEY' ? 'sensitive' : 'encrypted', target: ['production','preview'] } });
    if (result.failed?.length) throw new Error(`The environment update failed for ${key}.`);
  }
  console.log(JSON.stringify({ configured: Object.keys(values), staticGoogleKeys: false }));
}
configure().catch(reportFailure);
