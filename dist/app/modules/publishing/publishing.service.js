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
exports.publishingService = exports.retryFailedPost = exports.getPostByPlatform = exports.getPostStatus = exports.adminListPosts = exports.listPosts = exports.createPost = exports.postInput = void 0;
exports.enqueuePost = enqueuePost;
exports.cancelPost = cancelPost;
exports.publishDraft = publishDraft;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const queue_service_1 = require("../../../shared/queue.service");
const meta_service_1 = require("../social/services/meta.service");
const youtube_service_1 = require("../social/services/youtube.service");
const x_service_1 = require("../social/services/x.service");
const tiktok_service_1 = require("../social/services/tiktok.service");
exports.postInput = zod_1.z.object({
    content: zod_1.z.string().trim().max(63206), accountId: zod_1.z.string().regex(/^[a-f0-9]{24}$/i),
    mediaUrls: zod_1.z.array(zod_1.z.string().url().refine(v => v.startsWith('https://'), 'Use a public HTTPS image URL.')).max(1).default([]),
    scheduledAt: zod_1.z.string().datetime({ offset: true }).optional(), draft: zod_1.z.boolean().default(false),
});
function enqueuePost(row) {
    return __awaiter(this, void 0, void 0, function* () {
        yield queue_service_1.queueService.addJob('publishing-queue', 'publish-post', { postId: row.id }, { jobId: row.jobId, delay: Math.max(0, new Date(row.scheduledAt).getTime() - Date.now()), attempts: 1, removeOnComplete: true, removeOnFail: true });
    });
}
const createPost = (workspaceId, _userId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const data = exports.postInput.parse(payload);
    if (!data.content && !data.mediaUrls.length)
        throw new ApiErrors_1.default(400, 'Add text or an image.');
    if (data.scheduledAt && new Date(data.scheduledAt).getTime() <= Date.now())
        throw new ApiErrors_1.default(400, 'Choose a future date and time.');
    const account = yield (0, meta_service_1.connectedAccount)(workspaceId, data.accountId, 'publishing');
    if (!['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'YOUTUBE', 'TIKTOK', 'X'].includes(account.platform))
        throw new ApiErrors_1.default(400, 'This platform is not supported yet.');
    const hasVideo = data.mediaUrls.some(youtube_service_1.isVideoUrl);
    if (account.platform === 'YOUTUBE' && (data.mediaUrls.length !== 1 || !hasVideo || data.content.length > 5000))
        throw new ApiErrors_1.default(400, 'YouTube requires one MP4 video and text of at most 5,000 characters.');
    if (account.platform === 'TIKTOK' && (data.mediaUrls.length !== 1 || !hasVideo || data.content.length > tiktok_service_1.TIKTOK_TEXT_LIMIT))
        throw new ApiErrors_1.default(400, 'TikTok requires one MP4 video and a caption of at most 2,200 characters.');
    if (!['YOUTUBE', 'TIKTOK'].includes(account.platform) && hasVideo)
        throw new ApiErrors_1.default(400, 'Videos can only be posted to YouTube and TikTok for now.');
    if (account.platform === 'X' && data.content.length > x_service_1.X_TEXT_LIMIT)
        throw new ApiErrors_1.default(400, 'X posts can be at most 280 characters.');
    if (account.platform === 'LINKEDIN' && data.content.length > 3000)
        throw new ApiErrors_1.default(400, 'LinkedIn posts can be at most 3,000 characters.');
    if (account.platform === 'INSTAGRAM' && (data.mediaUrls.length !== 1 || data.content.length > 2200))
        throw new ApiErrors_1.default(400, 'Instagram requires one image and a caption of at most 2,200 characters.');
    const row = yield prisma_1.default.postStatus.create({ data: { workspaceId, jobId: (0, crypto_1.randomUUID)(), accountId: account.id, platform: account.platform, content: data.content, mediaUrls: data.mediaUrls, scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : new Date(), status: data.draft ? 'DRAFT' : 'PENDING' } });
    // MongoDB is the durable source. Reconciler recovers an enqueue failure.
    if (!data.draft) {
        try {
            yield enqueuePost(row);
        }
        catch ( /* pending row will be recovered */_a) { /* pending row will be recovered */ }
    }
    return { jobId: row.jobId, platforms: [row.platform], status: row.status, message: data.draft ? 'Draft saved' : 'Post queued' };
});
exports.createPost = createPost;
const group = (rows) => rows.map(row => (Object.assign(Object.assign({}, row), { platforms: [{ platform: row.platform, status: row.status, publishedAt: row.publishedAt, errorLog: row.errorLog }] })));
const listPosts = (workspaceId) => __awaiter(void 0, void 0, void 0, function* () {
    const [rows, accounts] = yield Promise.all([prisma_1.default.postStatus.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } }), prisma_1.default.socialAccount.findMany({ where: { workspaceId }, select: { id: true, accountName: true } })]);
    // Name each post's account so users can tell which Page/profile succeeded or failed.
    const names = new Map(accounts.map(a => [a.id, a.accountName]));
    return group(rows.map(row => (Object.assign(Object.assign({}, row), { accountName: (row.accountId && names.get(row.accountId)) || null }))));
});
exports.listPosts = listPosts;
const adminListPosts = () => __awaiter(void 0, void 0, void 0, function* () { return group(yield prisma_1.default.postStatus.findMany({ orderBy: { createdAt: 'desc' } })); });
exports.adminListPosts = adminListPosts;
const getPostStatus = (workspaceId, jobId) => prisma_1.default.postStatus.findMany({ where: { workspaceId, jobId } });
exports.getPostStatus = getPostStatus;
const getPostByPlatform = (workspaceId, jobId, platform) => prisma_1.default.postStatus.findFirst({ where: { workspaceId, jobId, platform } });
exports.getPostByPlatform = getPostByPlatform;
function cancelPost(workspaceId, jobId) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield prisma_1.default.postStatus.updateMany({ where: { workspaceId, jobId, status: { in: ['PENDING', 'DRAFT'] } }, data: { status: 'CANCELLED' } });
        if (!result.count)
            throw new ApiErrors_1.default(409, 'This post has already started or cannot be cancelled.');
        return { success: true };
    });
}
function publishDraft(workspaceId, jobId) {
    return __awaiter(this, void 0, void 0, function* () {
        const row = yield prisma_1.default.postStatus.findFirst({ where: { workspaceId, jobId, status: 'DRAFT' } });
        if (!(row === null || row === void 0 ? void 0 : row.accountId))
            throw new ApiErrors_1.default(404, 'Draft not found.');
        yield (0, meta_service_1.connectedAccount)(workspaceId, row.accountId, 'publishing');
        const updated = yield prisma_1.default.postStatus.updateMany({ where: { id: row.id, status: 'DRAFT' }, data: { status: 'PENDING', scheduledAt: new Date() } });
        if (!updated.count)
            throw new ApiErrors_1.default(409, 'This draft has already been queued.');
        try {
            yield enqueuePost(Object.assign(Object.assign({}, row), { scheduledAt: new Date() }));
        }
        catch ( /* recovered by reconciler */_a) { /* recovered by reconciler */ }
        return { success: true };
    });
}
const retryFailedPost = (_workspaceId, _jobId, _platform) => __awaiter(void 0, void 0, void 0, function* () {
    throw new ApiErrors_1.default(409, 'Check the platform before creating another post. The previous result may be uncertain.');
});
exports.retryFailedPost = retryFailedPost;
exports.publishingService = { createPost: exports.createPost, listPosts: exports.listPosts, adminListPosts: exports.adminListPosts, getPostStatus: exports.getPostStatus, getPostByPlatform: exports.getPostByPlatform, retryFailedPost: exports.retryFailedPost, cancelPost, publishDraft };
