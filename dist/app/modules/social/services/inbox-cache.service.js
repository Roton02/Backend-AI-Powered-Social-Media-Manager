"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAGE_SIZE = void 0;
exports.conversationChanged = conversationChanged;
exports.conversationList = conversationList;
exports.conversationMessages = conversationMessages;
exports.previewText = previewText;
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../../errors/ApiErrors"));
const queue_service_1 = require("../../../../shared/queue.service");
const socket_service_1 = require("../../../../shared/socket.service");
// Read cache for the inbox. Every message is still written to MongoDB first (nothing is lost if Redis
// restarts); Redis only serves the reads the inbox repeats all the time: the conversation list and the
// latest 30 messages of each conversation. Any change deletes the affected keys, and the next read
// rebuilds them from the database, so the cache can never show stale or half-written data for long.
exports.PAGE_SIZE = 30;
const TTL_SECONDS = 6 * 60 * 60;
const recentKey = (conversationId) => `inbox:recent:${conversationId}`;
const listKey = (workspaceId) => `inbox:list:${workspaceId}`;
const publicMessage = (m) => ({
    id: m.id, conversationId: m.conversationId, text: m.text || '', direction: m.direction, status: m.status, timestamp: m.timestamp,
    attachments: Array.isArray(m.attachments) && m.attachments.length ? m.attachments : (m.mediaUrls || []).map((url) => ({ type: 'file', url })),
});
function readCache(key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const raw = yield queue_service_1.redisConnection.get(key);
            return raw ? JSON.parse(raw) : null;
        }
        catch (_a) {
            return null;
        }
    });
}
function writeCache(key, value) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield queue_service_1.redisConnection.set(key, JSON.stringify(value), 'EX', TTL_SECONDS);
        }
        catch ( /* cache is optional */_a) { /* cache is optional */ }
    });
}
/** Call after any change to a conversation's messages: clears its cache and tells open inboxes to refresh. */
function conversationChanged(workspaceId, conversationId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield queue_service_1.redisConnection.del(recentKey(conversationId), listKey(workspaceId));
        }
        catch ( /* keys expire anyway */_a) { /* keys expire anyway */ }
        socket_service_1.socketService.emitToWorkspace(workspaceId, 'inbox-updated', { conversationId });
    });
}
/** Conversation list with last-message preview and unread count (no message bodies). */
function conversationList(workspaceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const cached = yield readCache(listKey(workspaceId));
        if (cached)
            return cached;
        const conversations = yield prisma_1.default.conversation.findMany({ where: { workspaceId }, orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }], take: 100 });
        const ids = conversations.map(c => c.id);
        const [accounts, unread] = yield Promise.all([
            prisma_1.default.socialAccount.findMany({ where: { workspaceId, id: { in: [...new Set(conversations.map(c => c.accountId))] } }, select: { id: true, accountName: true } }),
            prisma_1.default.unifiedMessage.groupBy({ by: ['conversationId'], where: { workspaceId, conversationId: { in: ids }, kind: 'message', direction: 'incoming', status: 'unread' }, _count: { _all: true } }),
        ]);
        const names = new Map(accounts.map(a => [a.id, a.accountName]));
        const counts = new Map(unread.map((u) => [u.conversationId, u._count._all]));
        const rows = conversations.filter(c => c.lastMessageAt).map(c => ({
            id: c.id, platform: c.platform, senderId: c.senderId, customerName: c.customerName, accountName: names.get(c.accountId) || null,
            lastMessageAt: c.lastMessageAt, lastIncomingAt: c.lastIncomingAt, lastMessageText: c.lastMessageText, lastMessageDirection: c.lastMessageDirection,
            unread: counts.get(c.id) || 0,
        }));
        yield writeCache(listKey(workspaceId), rows);
        return rows;
    });
}
/**
 * Newest 30 messages (oldest first), from Redis when cached. With `before`, the 30 messages before that
 * time come from the database (scrolling up). Every path is scoped to the workspace.
 */
function conversationMessages(workspaceId, conversationId, before) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!before) {
            const cached = yield readCache(recentKey(conversationId));
            if ((cached === null || cached === void 0 ? void 0 : cached.workspaceId) === workspaceId)
                return { messages: cached.messages, hasMore: cached.hasMore };
        }
        const conversation = yield prisma_1.default.conversation.findFirst({ where: { id: conversationId, workspaceId }, select: { id: true } });
        if (!conversation)
            throw new ApiErrors_1.default(404, 'Conversation not found.');
        const beforeDate = before ? new Date(before) : null;
        if (beforeDate && Number.isNaN(beforeDate.getTime()))
            throw new ApiErrors_1.default(400, 'Invalid date.');
        const rows = yield prisma_1.default.unifiedMessage.findMany({
            where: Object.assign({ workspaceId, conversationId, kind: 'message' }, (beforeDate ? { timestamp: { lt: beforeDate } } : {})),
            orderBy: { timestamp: 'desc' }, take: exports.PAGE_SIZE + 1,
        });
        const result = { messages: rows.slice(0, exports.PAGE_SIZE).reverse().map(publicMessage), hasMore: rows.length > exports.PAGE_SIZE };
        if (!before)
            yield writeCache(recentKey(conversationId), Object.assign({ workspaceId }, result));
        return result;
    });
}
/** Text shown in the conversation list for a message. */
function previewText(text, attachments = []) {
    var _a;
    if (text)
        return text.slice(0, 200);
    const first = (_a = attachments[0]) === null || _a === void 0 ? void 0 : _a.type;
    return first === 'sticker' ? 'Sticker' : first === 'image' ? 'Photo' : first === 'video' ? 'Video' : first === 'audio' ? 'Voice message' : first ? 'Attachment' : '';
}
