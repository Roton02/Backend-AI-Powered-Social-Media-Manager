import axios from 'axios';
import prisma from '../../../../shared/prisma';
import config from '../../../../config';
import { redisConnection as redis } from '../../../../shared/queue.service';
import { decryptToken, graphBase } from './meta.service';
import { freshAccessToken } from './refreshable-token.service';
import { refreshTiktok } from './tiktok.service';
import { refreshX } from './x.service';
import { freshAccessToken as youtubeAccessToken } from './youtube.service';

// Keeps connections alive for accounts that rarely post, and finds dead ones before a scheduled post fails.
// - TikTok / X: renew the rotating refresh token weekly (unused refresh tokens eventually lapse).
// - YouTube: refresh daily; a removed or expired grant is marked EXPIRED right away.
// - Facebook / Instagram: ask Meta daily whether the Page token is valid and when its 90-day data access ends.
const DAY = 24 * 60 * 60 * 1000;
const intervalFor = (platform: string) => (platform === 'TIKTOK' || platform === 'X' ? 7 * DAY : DAY);

async function patchSettings(accountId: string, patch: Record<string, any>) {
  const fresh = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (fresh) await prisma.socialAccount.update({ where: { id: accountId }, data: { settings: { ...((fresh.settings || {}) as any), ...patch } } });
}

async function checkMeta(account: any) {
  const appToken = `${config.social.facebook_client_id}|${config.social.facebook_client_secret}`;
  const info = (await axios.get(`${graphBase()}/debug_token`, { params: { input_token: decryptToken(account.accessToken), access_token: appToken }, timeout: 15000 })).data?.data;
  if (!info) throw new Error('No token information');
  // Only a definite answer from Meta marks the account expired; network errors are retried next run.
  if (info.is_valid === false) await prisma.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
  return { dataAccessExpiresAt: info.data_access_expires_at ? info.data_access_expires_at * 1000 : null };
}

/** Runs the keep-alive for one account. Errors never include tokens. */
export async function keepAccountAlive(account: any) {
  let patch: Record<string, any> = {};
  if (account.platform === 'FACEBOOK' || account.platform === 'INSTAGRAM') patch = await checkMeta(account);
  else if (account.platform === 'YOUTUBE') await youtubeAccessToken(account);
  else if (account.platform === 'TIKTOK') await freshAccessToken({ ...account, token: decryptToken(account.accessToken) }, 'TikTok', refreshTiktok, true);
  else if (account.platform === 'X') await freshAccessToken({ ...account, token: decryptToken(account.accessToken) }, 'X', refreshX, true);
  else return false; // LinkedIn cannot be renewed without LinkedIn's approval; the Accounts page warns before it expires.
  await patchSettings(account.id, { ...patch, keepAliveAt: Date.now() });
  return true;
}

/** Checks every connected account that is due. Safe to run often: each account is handled at most once per interval. */
export async function runTokenKeepAlive(now = Date.now()) {
  const accounts = await prisma.socialAccount.findMany({ where: { connectionStatus: { in: ['CONNECTED', 'LIMITED_ACCESS'] } } });
  let checked = 0;
  for (const account of accounts) {
    if (now - (Number((account.settings as any)?.keepAliveAt) || 0) < intervalFor(account.platform)) continue;
    const lock = `keepalive:${account.id}`;
    if (!await redis.set(lock, '1', 'EX', 300, 'NX')) continue;
    try { if (await keepAccountAlive(account)) checked++; }
    catch (error: any) { console.error('Token keep-alive failed:', JSON.stringify({ platform: account.platform, status: error?.response?.status || error?.metaError?.status || error?.code || 'unknown' })); }
    finally { await redis.del(lock); }
  }
  return checked;
}
