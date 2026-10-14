import { GoogleAuth } from 'google-auth-library';
import { onCloudRun } from './config.js';

// Internal services only accept callers with the Cloud Run invoker role. The ID token goes
// in X-Serverless-Authorization so the end user's Authorization header can pass through.
const auth = new GoogleAuth();
const clients = new Map();

export async function serviceAuthHeaders(audience) {
  if (!onCloudRun) return {};
  if (!clients.has(audience)) clients.set(audience, auth.getIdTokenClient(audience));
  const client = await clients.get(audience);
  const headers = await client.getRequestHeaders();
  const value = headers instanceof Headers ? headers.get('authorization') : headers.Authorization;
  return { 'X-Serverless-Authorization': value };
}

export async function serviceFetch(baseUrl, path, init = {}) {
  const headers = { ...(await serviceAuthHeaders(baseUrl)), ...init.headers };
  return fetch(new URL(path, baseUrl), { ...init, headers, signal: AbortSignal.timeout(10_000) });
}
