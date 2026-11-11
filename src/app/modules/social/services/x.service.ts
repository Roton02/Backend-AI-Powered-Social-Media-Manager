import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import prisma from '../../../../shared/prisma';
import config from '../../../../config';
import { freshAccessToken, platformFailure, saveRefreshableAccount } from './refreshable-token.service';

// X (Twitter) posting with OAuth 2.0 + PKCE. X API usage is billed per request (pay-per-use).
export const xScopes = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'];
export const xCallback = () => `${config.app.backendUrl}/api/v1/social/callback/x`;
export const X_TEXT_LIMIT = 280;
const tokenUrl = 'https://api.x.com/2/oauth2/token';

export function pkcePair() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function xAuthUrl(state: string, challenge: string) {
  return `https://x.com/i/oauth2/authorize?${new URLSearchParams({ response_type: 'code', client_id: config.social.x_client_id as string, redirect_uri: xCallback(), scope: xScopes.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256' })}`;
}

// Confidential client: credentials go in a Basic header, never in the URL.
const tokenRequest = async (body: Record<string, string>) => (await axios.post(tokenUrl, new URLSearchParams(body), {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${config.social.x_client_id}:${config.social.x_client_secret}`).toString('base64') }, timeout: 15000,
})).data;

/** Exchanges the code and saves the X profile with encrypted tokens. */
export async function connectX(code: string, verifier: string, workspaceId: string) {
  const token = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: xCallback(), code_verifier: verifier });
  const me = (await axios.get('https://api.x.com/2/users/me', { params: { 'user.fields': 'name,username' }, headers: { Authorization: `Bearer ${token.access_token}` }, timeout: 15000 })).data?.data;
  if (!me?.id) throw new Error('X profile unavailable');
  const granted = String(token.scope || '').split(/[\s,]+/);
  const capabilities = { publishing: ['tweet.write', 'media.write'].every(s => granted.includes(s)) && Boolean(token.refresh_token), messaging: false, comments: false };
  await saveRefreshableAccount(workspaceId, 'X', me.id, me.username ? `${me.name || me.username} (@${me.username})` : me.name || 'X profile', token, capabilities);
}

const readError = (body: any) => ({ code: body.title || body.type || body.errors?.[0]?.code, message: body.detail || body.errors?.[0]?.message || body.title });

async function xRequest(account: any, request: any) {
  try { return (await axios.request({ timeout: 30000, ...request })).data; }
  catch (error: any) {
    if (error.response?.status === 401) await prisma.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
    const failure = platformFailure('X', error, readError);
    if (error.response?.status === 402) failure.metaError.message = 'Your X developer account has no API credits. Add credits in the X developer console';
    throw failure;
  }
}

/** Posts text with up to one image and returns the post ID. */
export const refreshX = (refreshToken: string) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

export async function publishX(account: any, content: string, imageUrl?: string) {
  const token = await freshAccessToken(account, 'X', refreshX);
  const headers = { Authorization: `Bearer ${token}` };
  let media: any;
  if (imageUrl) {
    let image: any;
    try { image = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 5 * 1024 * 1024 }); }
    catch (error: any) {
      // Nothing was sent to X yet, so a too-large image is a definite rejection.
      if (/maxContentLength/i.test(String(error?.message))) throw Object.assign(new Error('Image too large'), { metaError: { status: 413, code: 'image_too_large', message: 'X accepts images up to 5 MB' } });
      throw error;
    }
    const form = new FormData();
    form.append('media', new Blob([image.data], { type: image.headers?.['content-type'] || 'image/jpeg' }), 'image.jpg');
    form.append('media_category', 'tweet_image');
    media = { media_ids: [(await xRequest(account, { method: 'POST', url: 'https://api.x.com/2/media/upload', data: form, headers })).data.id] };
  }
  const post = await xRequest(account, { method: 'POST', url: 'https://api.x.com/2/tweets', data: { ...(content ? { text: content } : {}), ...(media ? { media } : {}) }, headers });
  return { id: post.data?.id as string };
}
