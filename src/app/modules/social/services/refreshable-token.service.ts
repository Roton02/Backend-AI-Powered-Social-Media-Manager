import prisma from '../../../../shared/prisma';
import ApiError from '../../../../errors/ApiErrors';
import { redisConnection as redis } from '../../../../shared/queue.service';
import { encryptToken, decryptToken } from './meta.service';

// Shared by platforms with short-lived access tokens and rotating refresh tokens (TikTok, X).
// The access-token expiry lives in settings, not tokenExpiry, so the account does not show as
// expired every two hours; only a failed refresh marks it EXPIRED.
export type TokenSet = { access_token: string; refresh_token?: string; expires_in?: number };
const margin = 5 * 60 * 1000;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function saveRefreshableAccount(workspaceId: string, platform: 'TIKTOK' | 'X', externalAccountId: string, accountName: string, token: TokenSet, capabilities: any) {
  const data = {
    workspaceId, platform, externalAccountId, accountName,
    accessToken: encryptToken(token.access_token), refreshToken: token.refresh_token ? encryptToken(token.refresh_token) : null, tokenExpiry: null,
    settings: { capabilities, accessExpiresAt: Date.now() + (token.expires_in || 7200) * 1000 },
    connectionStatus: capabilities.publishing ? 'CONNECTED' : 'LIMITED_ACCESS',
  };
  const existing = await prisma.socialAccount.findFirst({ where: { workspaceId, platform, externalAccountId } });
  if (existing) await prisma.socialAccount.update({ where: { id: existing.id }, data }); else await prisma.socialAccount.create({ data });
}

const valid = (account: any) => Number(account?.settings?.accessExpiresAt) > Date.now() + margin;
const reconnect = (label: string, code: string) => Object.assign(new ApiError(409, `Reconnect this ${label} account.`), { metaError: { status: 401, code, message: `${label} access expired or was removed. Reconnect the account` } });

/**
 * Returns a usable access token, refreshing it when needed. Refresh tokens are single-use on these
 * platforms, so a Redis lock makes sure parallel jobs for one account never refresh twice.
 */
export async function freshAccessToken(account: any, label: string, refresh: (refreshToken: string) => Promise<TokenSet>, force = false) {
  // force: renew even if the access token is still valid (keep-alive for accounts that rarely post).
  if (!force && valid(account)) return account.token as string;
  const lock = `token-refresh:${account.id}`;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await redis.set(lock, '1', 'EX', 30, 'NX')) {
      try {
        const current = await prisma.socialAccount.findUnique({ where: { id: account.id } });
        if (!force && valid(current)) return decryptToken(current!.accessToken);
        if (!current?.refreshToken) throw reconnect(label, 'no_refresh_token');
        let token: TokenSet;
        try { token = await refresh(decryptToken(current.refreshToken)); }
        catch (error: any) {
          const status = error?.response?.status;
          if (error?.rejected || status === 400 || status === 401) {
            await prisma.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
            throw reconnect(label, 'invalid_refresh_token');
          }
          throw error;
        }
        await prisma.socialAccount.update({ where: { id: account.id }, data: {
          accessToken: encryptToken(token.access_token),
          refreshToken: token.refresh_token ? encryptToken(token.refresh_token) : current.refreshToken,
          settings: { ...(current.settings as any), accessExpiresAt: Date.now() + (token.expires_in || 7200) * 1000 },
        } });
        return token.access_token;
      } finally { await redis.del(lock); }
    }
    await wait(500);
  }
  throw new ApiError(503, `${label} access could not be refreshed. Try again.`);
}

/** Same error shape as Meta errors so the worker can tell a definite rejection from an ambiguous failure. Never includes tokens. */
export function platformFailure(label: string, error: any, read: (body: any) => { code?: any; message?: string }) {
  const apiError: any = new ApiError(502, 'The platform could not complete this request. Check your connection and try again.');
  if (error?.response) apiError.metaError = { status: error.response.status, ...read(error.response.data || {}) };
  console.error(`${label} request failed:`, JSON.stringify(apiError.metaError || { network: error?.code || 'no response' }));
  return apiError;
}
