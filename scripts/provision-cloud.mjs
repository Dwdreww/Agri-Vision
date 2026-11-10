import fs from 'node:fs/promises';
import path from 'node:path';
import { publicConfiguration, privateDirectory, privateJson, vercelContext, googleContext, reportFailure } from './cloud-admin.mjs';

async function provision() {
  const config = await publicConfiguration();
  const projectId = config.VITE_FIREBASE_PROJECT_ID;
  const vercel = await vercelContext();
  const google = await googleContext(projectId);
  const number = google.project.projectNumber;
  const poolId = 'agri-vision-vercel';
  const providerId = 'vercel';
  const email = `agri-vision-workspace@${projectId}.iam.gserviceaccount.com`;
  const roleId = 'agriVisionWorkspaceAuth';
  const pool = `projects/${number}/locations/global/workloadIdentityPools/${poolId}`;
  const provider = `${pool}/providers/${providerId}`;
  const account = `projects/${projectId}/serviceAccounts/${email}`;
  const environments = ['production', 'preview'];
  const principals = environments.map(env => `principal://iam.googleapis.com/${pool}/subject/owner:${vercel.team.slug}:project:${vercel.project.projectName}:environment:${env}`);
  const plan = { projectId, projectNumber: number, vercelProject: vercel.project.projectName, vercelPlan: 'hobby', firebaseBillingEnabled: false,
    serviceAccount: email, pool, provider, environments, roles: ['roles/datastore.user', `projects/${projectId}/roles/${roleId}`],
    authPermissions: ['firebaseauth.users.get', 'firebaseauth.users.delete'], principals, staticGoogleKeys: false };
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify(plan, null, 2)); return; }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function wait(operation, host) {
    let current = operation;
    for (let attempt = 0; !current.done && current.name && attempt < 90; attempt++) {
      await sleep(1000); current = await google.request(`https://${host}/v1/${current.name}`);
    }
    if (current.error) throw new Error(`Cloud provisioning failed: ${current.error.message}`);
    if (current.name && !current.done) throw new Error('Cloud provisioning is still pending. Rerun after it completes.');
  }
  for (const name of ['iam.googleapis.com', 'iamcredentials.googleapis.com', 'sts.googleapis.com']) {
    const state = await google.request(`https://serviceusage.googleapis.com/v1/projects/${number}/services/${name}`);
    if (state.state !== 'ENABLED') {
      await wait(await google.request(`https://serviceusage.googleapis.com/v1/projects/${number}/services/${name}:enable`, { method: 'POST', data: {} }), 'serviceusage.googleapis.com');
      console.log(`Enabled ${name}`);
    }
  }
  const iam = resource => `https://iam.googleapis.com/v1/${resource}`;
  if (!await google.request(iam(pool), { optional: true })) {
    await wait(await google.request(iam(`projects/${number}/locations/global/workloadIdentityPools?workloadIdentityPoolId=${poolId}`), { method: 'POST', data: { displayName: 'AgriVision Vercel', description: 'Private account workspace on the linked Vercel project.' } }), 'iam.googleapis.com');
  }
  const providerBody = {
    displayName: 'Vercel project identity',
    oidc: { issuerUri: `https://oidc.vercel.com/${vercel.team.slug}`, allowedAudiences: [`https://vercel.com/${vercel.team.slug}`] },
    attributeMapping: { 'google.subject': 'assertion.sub' },
    attributeCondition: `assertion.owner_id == '${vercel.project.orgId}' && assertion.project_id == '${vercel.project.projectId}' && assertion.environment in ['production', 'preview']`
  };
  const existingProvider = await google.request(iam(provider), { optional: true });
  if (!existingProvider) await wait(await google.request(iam(`${pool}/providers?workloadIdentityPoolProviderId=${providerId}`), { method: 'POST', data: providerBody }), 'iam.googleapis.com');
  else if (existingProvider.attributeCondition !== providerBody.attributeCondition || existingProvider.oidc?.issuerUri !== providerBody.oidc.issuerUri) throw new Error('The existing workload provider has different trust conditions; it was not changed.');
  if (!await google.request(iam(account), { optional: true })) await google.request(iam(`projects/${projectId}/serviceAccounts`), { method: 'POST', data: { accountId: 'agri-vision-workspace', serviceAccount: { displayName: 'AgriVision cloud workspace', description: 'Keyless private account records and owner-confirmed account removal.' } } });
  const roleName = `projects/${projectId}/roles/${roleId}`;
  const existingRole = await google.request(iam(roleName), { optional: true });
  if (!existingRole) await google.request(iam(`projects/${projectId}/roles`), { method: 'POST', data: { roleId, role: { title: 'AgriVision account verification', description: 'Verify account revocation and perform owner-confirmed account removal.', includedPermissions: plan.authPermissions, stage: 'GA' } } });
  else if (JSON.stringify([...existingRole.includedPermissions].sort()) !== JSON.stringify([...plan.authPermissions].sort())) throw new Error('The existing custom role differs from the reviewed permission set.');
  const policyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`;
  const policy = await google.request(policyUrl + ':getIamPolicy', { method: 'POST', data: { options: { requestedPolicyVersion: 3 } } });
  try { await fs.access(path.join(privateDirectory, 'project-iam-before.json')); } catch { await privateJson('project-iam-before.json', policy); }
  policy.bindings ||= [];
  for (const role of plan.roles) {
    let binding = policy.bindings.find(binding => binding.role === role && !binding.condition);
    if (!binding) { binding = { role, members: [] }; policy.bindings.push(binding); }
    if (!binding.members.includes(`serviceAccount:${email}`)) binding.members.push(`serviceAccount:${email}`);
  }
  await google.request(policyUrl + ':setIamPolicy', { method: 'POST', data: { policy } });
  const accountPolicy = await google.request(iam(account + ':getIamPolicy'), { method: 'POST', data: {} });
  accountPolicy.bindings ||= [];
  let trust = accountPolicy.bindings.find(binding => binding.role === 'roles/iam.workloadIdentityUser' && !binding.condition);
  if (!trust) { trust = { role: 'roles/iam.workloadIdentityUser', members: [] }; accountPolicy.bindings.push(trust); }
  for (const principal of principals) if (!trust.members.includes(principal)) trust.members.push(principal);
  await google.request(iam(account + ':setIamPolicy'), { method: 'POST', data: { policy: accountPolicy } });
  const result = { ...plan, configuredAt: new Date().toISOString(), environment: { FIREBASE_PROJECT_ID: projectId, GCP_PROJECT_NUMBER: number, GCP_SERVICE_ACCOUNT_EMAIL: email, GCP_WORKLOAD_IDENTITY_POOL_ID: poolId, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: providerId } };
  await privateJson('cloud-identity.json', result);
  console.log(JSON.stringify({ configured: true, serviceAccount: email, staticGoogleKeys: false, billingEnabled: false }));
}
provision().catch(reportFailure);
