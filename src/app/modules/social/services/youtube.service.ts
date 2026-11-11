import axios from 'axios';
import prisma from '../../../../shared/prisma';
import ApiError from '../../../../errors/ApiErrors';
import config from '../../../../config';
import { encryptToken, decryptToken } from './meta.service';

// YouTube channel publishing via Google OAuth (YouTube Data API v3). Video uploads only.
export const youtubeScopes = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
export const youtubeCallback = () => `${config.app.backendUrl}/api/v1/social/callback/youtube`;
const tokenUrl = 'https://oauth2.googleapis.com/token';
export const isVideoUrl = (url: string) => /\/video\/upload\//.test(url) || /\.mp4(\?|$)/i.test(url);

export function youtubeAuthUrl(state: string) {
  // offline + consent so Google returns a refresh token (access tokens last about an hour).
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.social.youtube_client_id as string, redirect_uri: youtubeCallback(), response_type: 'code', scope: youtubeScopes.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })}`;
}

/** Exchanges the code, finds the chosen channel and saves it with encrypted tokens. Throws 'NO_CHANNEL' if the Google account has no channel. */
export async function connectYoutube(code: string, workspaceId: string) {
  const token = (await axios.post(tokenUrl, new URLSearchParams({ code, client_id: config.social.youtube_client_id as string, client_secret: config.social.youtube_client_secret as string, redirect_uri: youtubeCallback(), grant_type: 'authorization_code' }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data;
  const channel = (await axios.get('https://www.googleapis.com/youtube/v3/channels', { params: { part: 'snippet', mine: true }, headers: { Authorization: `Bearer ${token.access_token}` }, timeout: 15000 })).data.items?.[0];
  if (!channel?.id) throw new Error('NO_CHANNEL');
  const existing = await prisma.socialAccount.findFirst({ where: { workspaceId, platform: 'YOUTUBE', externalAccountId: channel.id } });
  // Google only returns a refresh token on consent; keep the previous one if this reconnect did not include it.
  const refreshToken = token.refresh_token ? encryptToken(token.refresh_token) : existing?.refreshToken || null;
  const capabilities = { publishing: String(token.scope || '').split(' ').includes(youtubeScopes[0]) && Boolean(refreshToken), messaging: false, comments: false };
  const data = {
    workspaceId, platform: 'YOUTUBE' as const, externalAccountId: channel.id, accountName: channel.snippet?.title || 'YouTube channel',
    // tokenExpiry stays empty: the short-lived access token is refreshed before every upload.
    accessToken: encryptToken(token.access_token), refreshToken, tokenExpiry: null,
    settings: { capabilities }, connectionStatus: capabilities.publishing ? 'CONNECTED' : 'LIMITED_ACCESS',
  };
  if (existing) await prisma.socialAccount.update({ where: { id: existing.id }, data }); else await prisma.socialAccount.create({ data });
}

function platformError(error: any, fallback: { status: number; code: string; message: string }) {
  const apiError: any = new ApiError(502, 'The platform could not complete this request. Check your connection and try again.');
  const body = error?.response?.data?.error;
  // Same shape as Meta errors so the worker can tell a definite rejection from an ambiguous failure. Never includes tokens.
  if (error?.response) apiError.metaError = { status: error.response.status, code: body?.errors?.[0]?.reason || body?.status || (typeof body === 'string' ? body : fallback.code), message: body?.message || error.response.data?.error_description || fallback.message };
  console.error('YouTube request failed:', JSON.stringify(apiError.metaError || { network: error?.code || 'no response' }));
  return apiError;
}

export async function freshAccessToken(account: any) {
  if (!account.refreshToken) throw Object.assign(new ApiError(409, 'Reconnect this YouTube channel.'), { metaError: { status: 401, code: 'no_refresh_token', message: 'YouTube access expired. Reconnect the channel' } });
  try {
    return (await axios.post(tokenUrl, new URLSearchParams({ client_id: config.social.youtube_client_id as string, client_secret: config.social.youtube_client_secret as string, refresh_token: decryptToken(account.refreshToken), grant_type: 'refresh_token' }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data.access_token as string;
  } catch (error: any) {
    if (error.response?.data?.error === 'invalid_grant') {
      await prisma.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
      throw Object.assign(new ApiError(409, 'Reconnect this YouTube channel.'), { metaError: { status: 401, code: 'invalid_grant', message: 'YouTube access expired or was removed. Reconnect the channel' } });
    }
    throw platformError(error, { status: 502, code: 'token_refresh', message: 'Could not refresh YouTube access' });
  }
}

// YouTube rejects < and > in titles/descriptions; titles are limited to 100 characters.
const clean = (text: string) => text.replace(/[<>]/g, '');
export function videoDetails(content: string) {
  const firstLine = clean(content).split('\n').map(l => l.trim()).find(Boolean) || 'New video';
  return { title: firstLine.slice(0, 100), description: clean(content).slice(0, 5000) };
}

/** Uploads the video with a resumable upload and returns the YouTube video ID. */
export async function publishYoutube(account: any, content: string, videoUrl: string) {
  const accessToken = await freshAccessToken(account);
  const video = await axios.get(videoUrl, { responseType: 'stream', timeout: 60000 });
  const length = Number(video.headers['content-length']);
  let uploadUrl: string;
  try {
    const init = await axios.post('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      { snippet: { ...videoDetails(content), categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', ...(length ? { 'X-Upload-Content-Length': String(length) } : {}) }, timeout: 30000 });
    uploadUrl = init.headers.location;
  } catch (error: any) { video.data.destroy(); throw platformError(error, { status: 502, code: 'upload_init', message: 'YouTube did not accept the upload' }); }
  try {
    const done = await axios.put(uploadUrl, video.data, { headers: { 'Content-Type': 'video/mp4', ...(length ? { 'Content-Length': String(length) } : {}) }, maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 15 * 60 * 1000 });
    return { id: done.data?.id as string };
  } catch (error: any) { throw platformError(error, { status: 502, code: 'upload', message: 'YouTube upload failed' }); }
}
