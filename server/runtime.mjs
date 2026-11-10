import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore } from 'firebase-admin/firestore';
import { ExternalAccountClient, GoogleAuth } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

let resources;
export function getCloudResources() {
  if (!resources) resources = createResources().catch(error => { resources = undefined; throw error; });
  return resources;
}

async function createResources() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const number = process.env.GCP_PROJECT_NUMBER;
  const pool = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const provider = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const email = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  if (!projectId || !number || !pool || !provider || !email) {
    throw Object.assign(new Error('Cloud workspace configuration is incomplete.'), { status: 503 });
  }
  // Runtime access is scoped to this Vercel project's OIDC identity. No owner
  // refresh token or service-account private key is installed in the deployment.
  const authClient = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const credential = {
    async getAccessToken() {
      const token = await authClient.getAccessToken();
      if (!token.token) throw new Error('Cloud identity could not be verified.');
      return { access_token: token.token, expires_in: Math.max(1, Math.floor(((authClient.credentials.expiry_date || Date.now() + 3600000) - Date.now()) / 1000)) };
    }
  };
  const app = getApps().find(app => app.name === 'cloud-workspace') || initializeApp({ projectId, credential }, 'cloud-workspace');
  // Firestore accepts the same federated Google auth client directly. Firebase
  // Admin's getFirestore helper only accepts certificate/default credentials.
  const db = new Firestore({ projectId, preferRest: true, auth: new GoogleAuth({ projectId, authClient }) });
  return { db, auth: getAuth(app), projectId };
}
