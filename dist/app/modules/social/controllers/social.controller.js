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
exports.socialController = void 0;
const zod_1 = require("zod");
const meta_service_1 = require("../services/meta.service");
const inbox_service_1 = require("../services/inbox.service");
const inbox_sync_service_1 = require("../services/inbox-sync.service");
const inbox_cache_service_1 = require("../services/inbox-cache.service");
const catchAsync_1 = __importDefault(require("../../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../../shared/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../../errors/ApiErrors"));
const getInboxMessages = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const messages = yield inbox_service_1.inboxService.getMessages(workspaceId, { limit, offset });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Messages retrieved",
        data: messages,
    });
}));
const markMessageAsRead = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { id } = req.params;
    const message = yield inbox_service_1.inboxService.markAsRead(id, workspaceId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Message marked as read",
        data: message,
    });
}));
const replyToMessage = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = zod_1.z.object({ text: zod_1.z.string().trim().min(1).max(2000), requestId: zod_1.z.string().uuid() }).parse(req.body);
    const result = yield inbox_service_1.inboxService.sendReply(req.headers['x-workspace-id'], req.params.id, data.text, data.requestId);
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Reply sent", data: result });
}));
const getAccounts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const accounts = yield prisma_1.default.socialAccount.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Accounts retrieved",
        data: accounts.map(meta_service_1.publicAccount),
    });
}));
const getComments = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const comments = yield inbox_service_1.inboxService.getComments(workspaceId, { limit, offset });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Comments retrieved",
        data: comments,
    });
}));
const replyToComment = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = zod_1.z.object({ text: zod_1.z.string().trim().min(1).max(2000), requestId: zod_1.z.string().uuid() }).parse(req.body);
    const result = yield inbox_service_1.inboxService.sendReply(req.headers['x-workspace-id'], req.params.id, data.text, data.requestId);
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Reply sent", data: result });
}));
const disconnectAccount = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { id } = req.params;
    const account = yield prisma_1.default.socialAccount.findFirst({
        where: { id, workspaceId },
    });
    if (!account) {
        throw new ApiErrors_1.default(404, "Account not found");
    }
    yield prisma_1.default.socialAccount.update({ where: { id }, data: { accessToken: "", refreshToken: null, connectionStatus: "DISCONNECTED" } });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Account disconnected",
        data: { success: true },
    });
}));
const adminListAccounts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const accounts = yield prisma_1.default.socialAccount.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            workspace: { select: { name: true, slug: true } },
        },
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "All social accounts retrieved (admin)",
        data: accounts.map(meta_service_1.publicAccount),
    });
}));
const getConversations = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Conversations retrieved", data: yield (0, inbox_cache_service_1.conversationList)(req.headers['x-workspace-id']) });
}));
const getConversationMessages = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Messages retrieved", data: yield (0, inbox_cache_service_1.conversationMessages)(req.headers['x-workspace-id'], req.params.id, before) });
}));
const markConversationRead = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Conversation read", data: yield inbox_service_1.inboxService.markConversationRead(req.headers['x-workspace-id'], req.params.id) });
}));
// Only files uploaded through our own upload endpoint can be sent.
const attachmentSchema = zod_1.z.object({ type: zod_1.z.enum(['image', 'video', 'audio', 'file']), url: zod_1.z.string().url().refine(u => u.startsWith('https://res.cloudinary.com/'), 'Upload the file first.'), name: zod_1.z.string().max(200).optional() });
const replyInConversation = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = zod_1.z.object({ text: zod_1.z.string().trim().max(2000).default(''), attachment: attachmentSchema.optional(), requestId: zod_1.z.string().uuid() }).refine(d => Boolean(d.text) !== Boolean(d.attachment), 'Send either text or one attachment.').parse(req.body);
    const result = yield inbox_service_1.inboxService.replyInConversation(req.headers['x-workspace-id'], req.params.id, data.text, data.requestId, data.attachment);
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Reply sent", data: result });
}));
// Which accounts feed the inbox, and why one is not updating. Never returns tokens.
const getInboxAccounts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers['x-workspace-id'];
    const accounts = yield prisma_1.default.socialAccount.findMany({ where: { workspaceId, platform: { in: ['FACEBOOK', 'INSTAGRAM'] } }, orderBy: { createdAt: 'asc' } });
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Inbox accounts", data: accounts.map(a => { const s = (a.settings || {}); return { id: a.id, platform: a.platform, accountName: a.accountName, messaging: (0, inbox_sync_service_1.canSyncInbox)(a), syncedAt: s.inboxSyncedAt || null, error: (0, inbox_sync_service_1.canSyncInbox)(a) ? s.inboxError || null : null }; }) });
}));
const syncInbox = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const saved = yield (0, inbox_sync_service_1.syncInboxes)(req.headers['x-workspace-id']);
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Inbox synced", data: { saved } });
}));
const setTakeover = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { enabled } = zod_1.z.object({ enabled: zod_1.z.boolean() }).parse(req.body);
    const result = yield inbox_service_1.inboxService.setTakeover(req.headers['x-workspace-id'], req.params.id, enabled);
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Conversation updated", data: result });
}));
exports.socialController = {
    getConversations,
    getConversationMessages,
    markConversationRead,
    replyInConversation,
    getInboxAccounts,
    syncInbox,
    setTakeover,
    getInboxMessages,
    markMessageAsRead,
    replyToMessage,
    getAccounts,
    getComments,
    replyToComment,
    disconnectAccount,
    adminListAccounts,
};
