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
exports.inboxService = exports.InboxService = void 0;
exports.conversationLock = conversationLock;
const features_1 = require("../../../../config/features");
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../../errors/ApiErrors"));
const queue_service_1 = require("../../../../shared/queue.service");
const socket_service_1 = require("../../../../shared/socket.service");
const meta_service_1 = require("./meta.service");
function conversationLock(id, fn) {
    return __awaiter(this, void 0, void 0, function* () {
        const value = (0, crypto_1.randomUUID)(), key = `conversation-lock:${id}`;
        if (!(yield queue_service_1.redisConnection.set(key, value, 'PX', 60000, 'NX')))
            throw new ApiErrors_1.default(409, 'A reply is in progress. Please try again in a moment.');
        try {
            return yield fn();
        }
        finally {
            yield queue_service_1.redisConnection.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, value);
        }
    });
}
class InboxService {
    normalizeAndSave(platform, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const saved = [];
            for (const entry of payload.entry || []) {
                const accounts = yield prisma_1.default.socialAccount.findMany({ where: { platform, externalAccountId: String(entry.id), connectionStatus: { in: ['CONNECTED', 'LIMITED_ACCESS'] } } });
                for (const account of accounts) {
                    const events = [];
                    for (const event of entry.messaging || []) {
                        if (!((_a = event.message) === null || _a === void 0 ? void 0 : _a.mid) || event.message.is_echo || ((_b = event.sender) === null || _b === void 0 ? void 0 : _b.id) === entry.id || ((_c = event.recipient) === null || _c === void 0 ? void 0 : _c.id) !== entry.id)
                            continue;
                        events.push({ id: event.message.mid, sender: (_d = event.sender) === null || _d === void 0 ? void 0 : _d.id, text: event.message.text || '', mediaUrls: (event.message.attachments || []).map((a) => { var _a; return (_a = a.payload) === null || _a === void 0 ? void 0 : _a.url; }).filter((u) => typeof u === 'string'), kind: 'message', timestamp: new Date(event.timestamp || Date.now()) });
                    }
                    for (const change of entry.changes || []) {
                        const v = change.value;
                        if (change.field === 'feed' && (v === null || v === void 0 ? void 0 : v.item) === 'comment' && v.verb === 'add')
                            events.push({ id: v.comment_id, sender: (_e = v.from) === null || _e === void 0 ? void 0 : _e.id, text: v.message || '', kind: 'comment', timestamp: new Date((v.created_time || entry.time) * 1000) });
                        if (change.field === 'comments' && (v === null || v === void 0 ? void 0 : v.id))
                            events.push({ id: v.id, sender: (_f = v.from) === null || _f === void 0 ? void 0 : _f.id, text: v.text || '', kind: 'comment', timestamp: new Date(entry.time * 1000) });
                    }
                    for (const event of events) {
                        if (!event.id || !event.sender || event.sender === account.externalAccountId)
                            continue;
                        const externalId = `${account.id}:${event.kind}:${event.id}`;
                        let message = yield prisma_1.default.unifiedMessage.findUnique({ where: { externalId } });
                        if (!message) {
                            let conversation = yield prisma_1.default.conversation.findUnique({ where: { accountId_senderId: { accountId: account.id, senderId: event.sender } } });
                            if (!conversation) {
                                try {
                                    conversation = yield prisma_1.default.conversation.create({ data: { workspaceId: account.workspaceId, accountId: account.id, senderId: event.sender, platform } });
                                }
                                catch (e) {
                                    if (e.code !== 'P2002')
                                        throw e;
                                    conversation = yield prisma_1.default.conversation.findUniqueOrThrow({ where: { accountId_senderId: { accountId: account.id, senderId: event.sender } } });
                                }
                            }
                            try {
                                message = yield prisma_1.default.unifiedMessage.create({ data: { workspaceId: account.workspaceId, accountId: account.id, conversationId: conversation.id, platform, externalId, senderId: event.sender, text: event.text, mediaUrls: event.mediaUrls || [], kind: event.kind, timestamp: Number.isNaN(event.timestamp.getTime()) ? new Date() : event.timestamp, direction: 'incoming' } });
                            }
                            catch (e) {
                                if (e.code !== 'P2002')
                                    throw e;
                                message = yield prisma_1.default.unifiedMessage.findUniqueOrThrow({ where: { externalId } });
                            }
                        }
                        if (features_1.featureFlags.aiAutomation && event.kind === 'message' && !message.aiProcessed)
                            yield queue_service_1.queueService.addJob('inbox-sync-queue', 'process-new-message', { messageId: message.id, workspaceId: account.workspaceId }, { jobId: message.id, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: true });
                        socket_service_1.socketService.emitToWorkspace(account.workspaceId, 'new-message', { message });
                        saved.push(message);
                    }
                }
            }
            return saved;
        });
    }
    getMessages(workspaceId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.default.unifiedMessage.findMany({ where: { workspaceId, kind: 'message' }, orderBy: { timestamp: 'desc' }, take: Math.min(500, Math.max(1, Number(filters.limit) || 200)), skip: Math.max(0, Number(filters.offset) || 0) });
        });
    }
    getComments(workspaceId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.default.unifiedMessage.findMany({ where: { workspaceId, kind: 'comment', direction: 'incoming' }, orderBy: { timestamp: 'desc' }, take: Math.min(200, Math.max(1, Number(filters.limit) || 50)), skip: Math.max(0, Number(filters.offset) || 0) });
        });
    }
    markAsRead(id, workspaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const message = yield prisma_1.default.unifiedMessage.findFirst({ where: { id, workspaceId } });
            if (!message)
                throw new ApiErrors_1.default(404, 'Message not found.');
            return prisma_1.default.unifiedMessage.updateMany({ where: Object.assign({ workspaceId, direction: 'incoming', status: 'unread' }, (message.conversationId ? { conversationId: message.conversationId } : { id })), data: { status: 'read' } });
        });
    }
    sendReply(workspaceId_1, messageId_1, text_1, requestId_1) {
        return __awaiter(this, arguments, void 0, function* (workspaceId, messageId, text, requestId, automatic = false) {
            if (automatic && !features_1.featureFlags.aiAutomation)
                return { suppressed: true };
            const message = yield prisma_1.default.unifiedMessage.findFirst({ where: { id: messageId, workspaceId, direction: 'incoming' } });
            if (!(message === null || message === void 0 ? void 0 : message.accountId) || !message.conversationId)
                throw new ApiErrors_1.default(409, 'This message needs a connected account.');
            return conversationLock(message.conversationId, () => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const conversation = yield prisma_1.default.conversation.findFirst({ where: { id: message.conversationId, workspaceId } });
                const workspace = yield prisma_1.default.workspace.findUnique({ where: { id: workspaceId } });
                if (automatic && (!(conversation === null || conversation === void 0 ? void 0 : conversation.aiEnabled) || conversation.humanTakeover || ((_a = workspace === null || workspace === void 0 ? void 0 : workspace.settings) === null || _a === void 0 ? void 0 : _a.ai_auto_reply) !== true))
                    return { suppressed: true };
                const externalId = `out:${message.accountId}:${requestId}`;
                const previous = yield prisma_1.default.unifiedMessage.findUnique({ where: { externalId } });
                if (previous) {
                    if (previous.status !== 'sent')
                        throw new ApiErrors_1.default(409, 'The previous reply result is uncertain. Check the platform before sending again.');
                    return previous;
                }
                const account = yield (0, meta_service_1.connectedAccount)(workspaceId, message.accountId, message.kind === 'comment' ? 'comments' : 'messaging');
                const outgoing = yield prisma_1.default.unifiedMessage.create({ data: { workspaceId, accountId: account.id, conversationId: message.conversationId, platform: message.platform, externalId, senderId: message.senderId, text, kind: message.kind, mediaUrls: [], timestamp: new Date(), direction: automatic ? 'ai' : 'outgoing', status: 'sending', aiProcessed: true } });
                // Reserving before the API request prevents duplicate sends after a timeout/crash.
                try {
                    const sourceId = message.externalId.split(':').slice(2).join(':');
                    const path = message.kind === 'comment' ? `${sourceId}/${message.platform === 'INSTAGRAM' ? 'replies' : 'comments'}` : `${account.externalAccountId}/messages`;
                    const payload = message.kind === 'comment' ? { message: text } : Object.assign({ recipient: { id: message.senderId }, message: { text } }, (message.platform === 'FACEBOOK' ? { messaging_type: 'RESPONSE' } : {}));
                    const response = yield (0, meta_service_1.metaRequest)(account, path, payload);
                    if (!response.id && !response.message_id)
                        throw new Error('No message ID');
                    const result = yield prisma_1.default.unifiedMessage.update({ where: { id: outgoing.id }, data: { status: 'sent' } });
                    socket_service_1.socketService.emitToWorkspace(workspaceId, 'new-message', { message: result });
                    return result;
                }
                catch (_b) {
                    yield prisma_1.default.unifiedMessage.update({ where: { id: outgoing.id }, data: { status: 'uncertain' } });
                    throw new ApiErrors_1.default(502, 'Could not confirm delivery. Check the platform before sending again.');
                }
            }));
        });
    }
    setTakeover(workspaceId, id, enabled) {
        return __awaiter(this, void 0, void 0, function* () {
            return conversationLock(id, () => __awaiter(this, void 0, void 0, function* () {
                const result = yield prisma_1.default.conversation.updateMany({ where: { id, workspaceId }, data: { humanTakeover: enabled, aiEnabled: !enabled } });
                if (!result.count)
                    throw new ApiErrors_1.default(404, 'Conversation not found.');
                return { humanTakeover: enabled, aiEnabled: !enabled };
            }));
        });
    }
}
exports.InboxService = InboxService;
exports.inboxService = new InboxService();
