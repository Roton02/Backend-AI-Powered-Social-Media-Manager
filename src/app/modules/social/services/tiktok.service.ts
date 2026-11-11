import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import prisma from '../../../../shared/prisma';
import config from '../../../../config';
import { freshAccessToken, platformFailure, saveRefreshableAccount } from './refreshable-token.service';

// TikTok video posting (Login Kit + Content Posting API, Direct Post). Until TikTok audits the app,
// posts are private-only. Local development uses the Desktop platform, which allows an
// http://localhost:<port> redirect and needs PKCE with a HEX-encoded SHA-256 challenge.
export const tiktokScopes = ['user.info.basic', 'video.publish'];
export const tiktokCallback = () => `${config.app.backendUrl}/api/v1/social/callback/tiktok`;
export const TIKTOK_TEXT_LIMIT = 2200;
const api = 'https://open.tiktokapis.com/v2';
const MB = 1024 * 1024;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export function tiktokPkce() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('hex') };
}

export function tiktokAuthUrl(state: string, challenge: string) {
  return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: config.social.tiktok_client_id as string, scope: tiktokScopes.join(','), response_type: 'code', redirect_uri: tiktokCallback(), state, code_challenge: challenge, code_challenge_method: 'S256' })}`;
}

// TikTok's token endpoint can answer an error with HTTP 200, so check the body too.
async function tokenRequest(body: Record<string, string>) {
  const data = (await axios.post(`${api}/oauth/token/`, new URLSearchParams({ client_key: config.social.tiktok_client_id as string, client_secret: config.social.tiktok_client_secret as string, ...body }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data;
  if (!data?.access_token) throw Object.assign(new Error(data?.error || 'TikTok token request failed'), { rejected: true });
  return data;
}

const readError = (body: any) => ({ code: body.error?.code, message: body.error?.message });

async function tiktokRequest(account: any, token: string, path: string, data: any = {}) {
  try {
    const body = (await axios.post(`${api}${path}`, data, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' }, timeout: 30000 })).data;
    if (body?.error?.code && body.error.code !== 'ok') throw { response: { status: 422, data: body } };
    return body.data;
  } catch (error: any) {
    if (error.response?.status === 401 && account.id) await prisma.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
    throw platformFailure('TikTok', error, readError);
  }
}

const creatorInfo = (account: any, token: string) => tiktokRequest(account, token, '/post/publish/creator_info/query/');

/** Exchanges the code and saves the TikTok creator with encrypted tokens. */
export async function connectTiktok(code: string, verifier: string, workspaceId: string) {
  const token = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: tiktokCallback(), code_verifier: verifier });
  const granted = String(token.scope || '').split(/[\s,]+/);
  const capabilities = { publishing: granted.includes('video.publish') && Boolean(token.refresh_token), messaging: false, comments: false };
  let name = 'TikTok account';
  if (capabilities.publishing) {
    const info = await creatorInfo({ id: null }, token.access_token).catch(() => null);
    if (info?.creator_username) name = `${info.creator_nickname || info.creator_username} (@${info.creator_username})`;
  }
  await saveRefreshableAccount(workspaceId, 'TIKTOK', token.open_id, name, token, capabilities);
}

/** Splits a file using TikTok's rules: 5-64 MB chunks, the last chunk takes the remainder; files up to 64 MB go in one chunk. */
export function chunkPlan(size: number) {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

/** Uploads the video as a Direct Post and waits for TikTok to confirm it. Returns the post or publish ID. */
export async function publishTiktok(account: any, content: string, videoUrl: string) {
  const token = await freshAccessToken(account, 'TikTok', refreshToken => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }));
  const info = await creatorInfo(account, token);
  const options: string[] = info?.privacy_level_options || [];
  // Unaudited apps can only post privately; PUBLIC is used only when TikTok offers it.
  const privacy = options.includes('PUBLIC_TO_EVERYONE') && process.env.TIKTOK_PRIVATE_ONLY !== 'true' ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY';
  const video = Buffer.from((await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: 110 * MB })).data);
  const { chunkSize, count } = chunkPlan(video.length);
  const init = await tiktokRequest(account, token, '/post/publish/video/init/', {
    post_info: { title: content.slice(0, TIKTOK_TEXT_LIMIT), privacy_level: privacy, disable_comment: Boolean(info?.comment_disabled), disable_duet: Boolean(info?.duet_disabled), disable_stitch: Boolean(info?.stitch_disabled), brand_content_toggle: false, brand_organic_toggle: false },
    source_info: { source: 'FILE_UPLOAD', video_size: video.length, chunk_size: chunkSize, total_chunk_count: count },
  });
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize, end = i === count - 1 ? video.length - 1 : start + chunkSize - 1;
    try {
      await axios.put(init.upload_url, video.subarray(start, end + 1), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${video.length}` }, maxBodyLength: Infinity, timeout: 10 * 60 * 1000 });
    } catch (error: any) { throw platformFailure('TikTok', error, () => ({ code: 'upload_failed', message: 'TikTok did not accept the video upload' })); }
  }
  // Publishing is asynchronous. Poll up to about 3 minutes; an unknown outcome is reported as ambiguous.
  for (let attempt = 0; attempt < 36; attempt++) {
    const status = await tiktokRequest(account, token, '/post/publish/status/fetch/', { publish_id: init.publish_id });
    if (status?.status === 'PUBLISH_COMPLETE') return { id: String(status.publicaly_available_post_id?.[0] || init.publish_id) };
    if (status?.status === 'FAILED') throw Object.assign(new Error('TikTok publish failed'), { metaError: { status: 422, code: status.fail_reason || 'failed', message: `TikTok could not publish the video (${status.fail_reason || 'no reason given'})` } });
    await wait(5000);
  }
  throw new Error('TikTok is still processing the video.');
}
