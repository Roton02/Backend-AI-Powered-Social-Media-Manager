import prisma from '../../../../shared/prisma';
import ApiError from '../../../../errors/ApiErrors';
import { redisConnection as redis } from '../../../../shared/queue.service';
import { socketService } from '../../../../shared/socket.service';

// Read cache for the inbox. Every message is still written to MongoDB first (nothing is lost if Redis
// restarts); Redis only serves the reads the inbox repeats all the time: the conversation list and the
// latest 30 messages of each conversation. Any change deletes the affected keys, and the next read
// rebuilds them from the database, so the cache can never show stale or half-written data for long.
export const PAGE_SIZE = 30;
const TTL_SECONDS = 6 * 60 * 60;
const recentKey = (conversationId: string) => `inbox:recent:${conversationId}`;
const listKey = (workspaceId: string) => `inbox:list:${workspaceId}`;

export type Attachment = { type: 'image' | 'video' | 'audio' | 'file' | 'sticker'; url: string; name?: string };
const publicMessage = (m: any) => ({
  id: m.id, conversationId: m.conversationId, text: m.text || '', direction: m.direction, status: m.status, timestamp: m.timestamp,
  attachments: Array.isArray(m.attachments) && m.attachments.length ? m.attachments : (m.mediaUrls || []).map((url: string) => ({ type: 'file', url })),
});

async function readCache<T>(key: string): Promise<T | null> {
  try { const raw = await redis.get(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
async function writeCache(key: string, value: unknown) {
  try { await redis.set(key, JSON.stringify(value), 'EX', TTL_SECONDS); } catch { /* cache is optional */ }
}

/** Call after any change to a conversation's messages: clears its cache and tells open inboxes to refresh. */
export async function conversationChanged(workspaceId: string, conversationId: string) {
  try { await redis.del(recentKey(conversationId), listKey(workspaceId)); } catch { /* keys expire anyway */ }
  socketService.emitToWorkspace(workspaceId, 'inbox-updated', { conversationId });
}

/** Conversation list with last-message preview and unread count (no message bodies). */
export async function conversationList(workspaceId: string) {
  const cached = await readCache<any[]>(listKey(workspaceId));
  if (cached) return cached;
  const conversations = await prisma.conversation.findMany({ where: { workspaceId }, orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }], take: 100 });
  const ids = conversations.map(c => c.id);
  const [accounts, unread] = await Promise.all([
    prisma.socialAccount.findMany({ where: { workspaceId, id: { in: [...new Set(conversations.map(c => c.accountId))] } }, select: { id: true, accountName: true } }),
    prisma.unifiedMessage.groupBy({ by: ['conversationId'], where: { workspaceId, conversationId: { in: ids }, kind: 'message', direction: 'incoming', status: 'unread' }, _count: { _all: true } }),
  ]);
  const names = new Map(accounts.map(a => [a.id, a.accountName]));
  const counts = new Map(unread.map((u: any) => [u.conversationId, u._count._all]));
  const rows = conversations.filter(c => c.lastMessageAt).map(c => ({
    id: c.id, platform: c.platform, senderId: c.senderId, customerName: c.customerName, accountName: names.get(c.accountId) || null,
    lastMessageAt: c.lastMessageAt, lastIncomingAt: c.lastIncomingAt, lastMessageText: c.lastMessageText, lastMessageDirection: c.lastMessageDirection,
    unread: counts.get(c.id) || 0,
  }));
  await writeCache(listKey(workspaceId), rows);
  return rows;
}

/**
 * Newest 30 messages (oldest first), from Redis when cached. With `before`, the 30 messages before that
 * time come from the database (scrolling up). Every path is scoped to the workspace.
 */
export async function conversationMessages(workspaceId: string, conversationId: string, before?: string) {
  if (!before) {
    const cached = await readCache<{ workspaceId: string; messages: any[]; hasMore: boolean }>(recentKey(conversationId));
    if (cached?.workspaceId === workspaceId) return { messages: cached.messages, hasMore: cached.hasMore };
  }
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId }, select: { id: true } });
  if (!conversation) throw new ApiError(404, 'Conversation not found.');
  const beforeDate = before ? new Date(before) : null;
  if (beforeDate && Number.isNaN(beforeDate.getTime())) throw new ApiError(400, 'Invalid date.');
  const rows = await prisma.unifiedMessage.findMany({
    where: { workspaceId, conversationId, kind: 'message', ...(beforeDate ? { timestamp: { lt: beforeDate } } : {}) },
    orderBy: { timestamp: 'desc' }, take: PAGE_SIZE + 1,
  });
  const result = { messages: rows.slice(0, PAGE_SIZE).reverse().map(publicMessage), hasMore: rows.length > PAGE_SIZE };
  if (!before) await writeCache(recentKey(conversationId), { workspaceId, ...result });
  return result;
}

/** Text shown in the conversation list for a message. */
export function previewText(text: string, attachments: Attachment[] = []) {
  if (text) return text.slice(0, 200);
  const first = attachments[0]?.type;
  return first === 'sticker' ? 'Sticker' : first === 'image' ? 'Photo' : first === 'video' ? 'Video' : first === 'audio' ? 'Voice message' : first ? 'Attachment' : '';
}
