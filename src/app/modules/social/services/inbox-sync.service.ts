import prisma from '../../../../shared/prisma';
import { redisConnection as redis } from '../../../../shared/queue.service';
import { decryptToken, metaRequest } from './meta.service';
import { recordDirectMessage } from './inbox.service';
import type { Attachment } from './inbox-cache.service';

// Fetches Messenger and Instagram DMs with the Conversations API instead of webhooks, so the inbox
// also works on localhost. Each pass re-reads a few minutes of overlap; saving is idempotent.
const OVERLAP_MS = 5 * 60 * 1000;
const FIRST_SYNC_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAGES = 4;
const fields = 'participants,updated_time,messages.limit(20){id,created_time,from,message,sticker,attachments{mime_type,name,image_data{url,animated_gif_url},video_data{url},file_url}}';

export const canSyncInbox = (account: any) =>
  ['FACEBOOK', 'INSTAGRAM'].includes(account.platform) && ['CONNECTED', 'LIMITED_ACCESS'].includes(account.connectionStatus) && Boolean((account.settings as any)?.capabilities?.messaging);

// Emojis arrive as plain text and are shown as text. Stickers (including Messenger's thumbs-up) and files are typed attachments.
export function attachmentsOf(m: any): Attachment[] {
  const list: Attachment[] = [];
  if (typeof m.sticker === 'string') list.push({ type: 'sticker', url: m.sticker });
  for (const a of m.attachments?.data || []) {
    const mime = String(a.mime_type || '');
    if (a.image_data?.url) list.push({ type: 'image', url: a.image_data.animated_gif_url || a.image_data.url });
    else if (a.video_data?.url) list.push({ type: 'video', url: a.video_data.url });
    else if (typeof a.file_url === 'string') list.push({ type: mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'file', url: a.file_url, ...(a.name ? { name: String(a.name) } : {}) });
  }
  return list.filter(a => /^https:\/\//.test(a.url));
}

/** Imports new DMs for one account. Returns how many messages were saved. */
export async function syncAccountInbox(account: any) {
  const settings = (account.settings || {}) as any;
  const firstSync = !settings.inboxSyncedAt;
  const since = firstSync ? Date.now() - FIRST_SYNC_MS : Number(settings.inboxSyncedAt) - OVERLAP_MS;
  const startedAt = Date.now();
  const pageId = account.platform === 'INSTAGRAM' ? settings.pageId : account.externalAccountId;
  const business = new Set([pageId, account.externalAccountId].filter(Boolean).map(String));
  const authed = { ...account, token: decryptToken(account.accessToken) };
  let saved = 0, after = '';
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({ platform: account.platform === 'INSTAGRAM' ? 'instagram' : 'messenger', fields, limit: '25', ...(after ? { after } : {}) });
      const response = await metaRequest(authed, `${pageId}/conversations?${query}`);
      let reachedOld = false;
      for (const thread of response?.data || []) {
        if (new Date(thread.updated_time).getTime() < since) { reachedOld = true; break; }
        const customer = (thread.participants?.data || []).find((p: any) => !business.has(String(p.id)));
        if (!customer?.id) continue;
        // Oldest first, so conversation times and previews end on the newest message.
        for (const m of [...(thread.messages?.data || [])].reverse()) {
          const timestamp = new Date(m.created_time);
          if (!m.id || Number.isNaN(timestamp.getTime()) || timestamp.getTime() < since) continue;
          const row = await recordDirectMessage(account, {
            mid: m.id, customerId: String(customer.id), customerName: customer.name || customer.username, text: m.message || '',
            attachments: attachmentsOf(m), timestamp, fromBusiness: business.has(String(m.from?.id)),
          }, firstSync);
          if (row) saved++;
        }
      }
      after = response?.paging?.next ? response.paging.cursors?.after || '' : '';
      if (reachedOld || !after) break;
    }
    await saveSyncState(account.id, { inboxSyncedAt: startedAt, inboxError: null });
  } catch (error: any) {
    const meta = error?.metaError;
    // Only Meta's own message is kept (never a token) so the owner can see why the inbox is not updating.
    const message = meta ? `Meta: ${meta.message || 'request rejected'}${meta.code ? ` (code ${meta.code})` : ''}` : 'Could not reach Meta. Will retry.';
    await saveSyncState(account.id, { inboxError: message });
    throw error;
  }
  return saved;
}

// Re-reads settings first so a reconnect that happened during the sync is not overwritten.
async function saveSyncState(accountId: string, patch: Record<string, any>) {
  const fresh = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (!fresh) return;
  await prisma.socialAccount.update({ where: { id: accountId }, data: { settings: { ...((fresh.settings || {}) as any), ...patch } } });
}

/** Syncs every DM-capable account (optionally one workspace). One sync per account at a time. */
export async function syncInboxes(workspaceId?: string) {
  const accounts = (await prisma.socialAccount.findMany({ where: { platform: { in: ['FACEBOOK', 'INSTAGRAM'] }, ...(workspaceId ? { workspaceId } : {}) } })).filter(canSyncInbox);
  let saved = 0;
  for (const account of accounts) {
    const lock = `inbox-sync:${account.id}`;
    if (!await redis.set(lock, '1', 'EX', 120, 'NX')) continue;
    try { saved += await syncAccountInbox(account); }
    catch { /* recorded on the account; the next pass retries */ }
    finally { await redis.del(lock); }
  }
  return saved;
}
