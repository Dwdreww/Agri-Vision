// Owner-only provisioning/migration helpers. Never imported into the deployed API.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GoogleAuth } from 'google-auth-library';
export const root = path.resolve(import.meta.dirname, '..');
export const privateDirectory = path.join(os.homedir(), '.config/agri-vision/cloud-migration-2026-11-04');
export async function privateJson(name, value) {
  await fs.mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  await fs.chmod(privateDirectory, 0o700);
  await fs.writeFile(path.join(privateDirectory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
export async function publicConfiguration() {
  const config = {};
  for (const line of (await fs.readFile(path.join(root, '.env'), 'utf8')).split('\n')) {
    const match = /^(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) config[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return config;
}
export async function vercelContext() {
  const project = JSON.parse(await fs.readFile(path.join(root, '.vercel/project.json'), 'utf8'));
  const auth = JSON.parse(await fs.readFile(path.join(os.homedir(), 'Library/Application Support/com.vercel.cli/auth.json'), 'utf8'));
  async function request(endpoint, { method = 'GET', data } = {}) {
    const response = await fetch(`https://api.vercel.com${endpoint}${endpoint.includes('?') ? '&' : '?'}teamId=${project.orgId}`, {
      method, headers: { Authorization: `Bearer ${auth.token}`, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {})
    });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(`Vercel request failed: ${body.error?.code || response.status}`), { status: response.status });
    return body;
  }
  const teams = await request('/v2/teams?limit=100');
  const team = teams.teams?.find(team => team.id === project.orgId);
  if (team?.billing?.plan !== 'hobby') throw new Error('The selected Vercel project is not on the free Hobby plan. No paid changes are permitted.');
  const current = await request(`/v9/projects/${project.projectId}`);
  if (current.name !== project.projectName || !current.oidcTokenConfig?.enabled || current.oidcTokenConfig.issuerMode !== 'team') throw new Error('Verify the linked project and its team OIDC configuration first.');
  return { project, team, request };
}
export async function googleContext(projectId) {
  const client = await new GoogleAuth({ keyFilename: path.join(os.homedir(), '.config/agri-vision', `${projectId}-local-session.json`), scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  async function request(url, { method = 'GET', data, optional = false } = {}) {
    try { return (await client.request({ url, method, ...(data ? { data } : {}) })).data; }
    catch (error) { if (optional && error.response?.status === 404) return null; throw error; }
  }
  const billing = await request(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`);
  if (billing.billingEnabled) throw new Error('Firebase billing is enabled; inspect the project before applying this free-only migration.');
  const project = await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`);
  return { client, request, project };
}
export async function vercelEnvironmentValue(context, key) {
  const list = await context.request(`/v10/projects/${context.project.projectId}/env`);
  const entry = list.envs.find(item => item.key === key);
  if (!entry) throw new Error(`Missing server setting: ${key}`);
  const decrypted = await context.request(`/v1/projects/${context.project.projectId}/env/${entry.id}`);
  if (!decrypted.decrypted || !decrypted.value) throw new Error(`Server setting could not be decrypted: ${key}`);
  return decrypted.value;
}
export function reportFailure(error) {
  console.error(JSON.stringify({ failed: true, status: error.response?.status || error.status, code: error.response?.data?.error?.status || error.code,
    message: error.response?.data?.error?.message || error.message }));
  process.exitCode = 1;
}
