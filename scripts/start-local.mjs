import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadAiEnvironment, withoutAiSecrets } from './local-ai-config.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const publicEnv = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')
  .filter(line => line.trim().startsWith('VITE_'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const project = publicEnv.VITE_FIREBASE_PROJECT_ID;
if (Object.keys(publicEnv).some(name => /^VITE_.*(?:GEMINI|GOOGLE_AI)/i.test(name))) throw new Error('Remove AI keys from frontend settings. Use the private AI config instead.');
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project || '')) throw new Error('Set the actual Firebase project in .env first.');

const privateDirectory = path.join(os.homedir(), '.config', 'agri-vision');
fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(privateDirectory, 0o700);
const aiEnvironment = loadAiEnvironment(path.join(privateDirectory, 'ai.env'));
let credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credentialPath) {
  const { getProjectDefaultAccount } = require('firebase-tools/lib/auth');
  const api = require('firebase-tools/lib/api');
  const account = getProjectDefaultAccount(root);
  if (!account?.tokens?.refresh_token) throw new Error('Sign in with firebase login before starting the local pilot.');
  credentialPath = path.join(privateDirectory, `${project}-local-session.json`);
  fs.writeFileSync(credentialPath, JSON.stringify({ type: 'authorized_user', client_id: api.clientId(),
    client_secret: api.clientSecret(), refresh_token: account.tokens.refresh_token, quota_project_id: project }), { mode: 0o600 });
  fs.chmodSync(credentialPath, 0o600);
}
const photoDirectory = path.join(os.homedir(), '.local', 'share', 'agri-vision', project, 'photos');
fs.mkdirSync(photoDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(photoDirectory, 0o700);
const env = { ...withoutAiSecrets(process.env), ...withoutAiSecrets(publicEnv), GOOGLE_APPLICATION_CREDENTIALS: credentialPath,
  FIREBASE_PROJECT_ID: project, FIREBASE_CONFIG: JSON.stringify({ projectId: project }),
  AGRI_VISION_SERVER_MODE: 'local', AGRI_VISION_PHOTO_DIR: photoDirectory,
  VITE_WORKSPACE_MODE: 'local', MODEL_VERSION: 'pilot-v1', FLASK_DEBUG: 'false', HOST: '127.0.0.1', PORT: '5001' };

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const [command, args] of [
  [path.join(root, '.venv', 'bin', 'python'), ['app.py']],
  [process.execPath, ['functions/local-server.js']],
  [process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1']]
]) {
  const childEnv = args[0] === 'functions/local-server.js' ? { ...env, ...aiEnvironment } : env;
  const child = spawn(command, args, { cwd: root, env: childEnv, stdio: 'inherit' });
  children.push(child);
  child.on('error', error => { console.error('Could not start a local service:', error.message); stop(1); });
  child.on('exit', code => { if (!stopping) { console.error('A local service stopped. Restart with npm run pilot.'); stop(code || 1); } });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('Starting the local pilot. Firebase billing stays disabled; photos stay on this computer.');
