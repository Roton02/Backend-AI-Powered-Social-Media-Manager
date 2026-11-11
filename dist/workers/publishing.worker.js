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
exports.processPublishPost = processPublishPost;
exports.reconcilePublishing = reconcilePublishing;
exports.startPublishingWorker = startPublishingWorker;
const bullmq_1 = require("bullmq");
const queue_service_1 = require("../shared/queue.service");
const prisma_1 = __importDefault(require("../shared/prisma"));
const meta_service_1 = require("../app/modules/social/services/meta.service");
const linkedin_service_1 = require("../app/modules/social/services/linkedin.service");
const youtube_service_1 = require("../app/modules/social/services/youtube.service");
const x_service_1 = require("../app/modules/social/services/x.service");
const tiktok_service_1 = require("../app/modules/social/services/tiktok.service");
const publishing_service_1 = require("../app/modules/publishing/publishing.service");
const socket_service_1 = require("../shared/socket.service");
function processPublishPost(job) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const row = yield prisma_1.default.postStatus.findUnique({ where: { id: job.data.postId } });
        if (!row || row.status !== 'PENDING')
            return;
        if (row.scheduledAt.getTime() > Date.now())
            return;
        const claimed = yield prisma_1.default.postStatus.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'PROCESSING' } });
        if (!claimed.count)
            return;
        try {
            if (!row.accountId)
                throw new Error('Reconnect and create a new post.');
            const account = yield (0, meta_service_1.connectedAccount)(row.workspaceId, row.accountId, 'publishing');
            let result;
            if (account.platform === 'FACEBOOK') {
                result = yield (0, meta_service_1.metaRequest)(account, `${account.externalAccountId}/${((_a = row.mediaUrls) === null || _a === void 0 ? void 0 : _a.length) ? 'photos' : 'feed'}`, ((_b = row.mediaUrls) === null || _b === void 0 ? void 0 : _b.length) ? { url: row.mediaUrls[0], caption: row.content } : { message: row.content });
            }
            else if (account.platform === 'INSTAGRAM') {
                const container = yield (0, meta_service_1.metaRequest)(account, `${account.externalAccountId}/media`, { image_url: row.mediaUrls[0], caption: row.content });
                if (!container.id)
                    throw new Error('Media could not be prepared.');
                result = yield (0, meta_service_1.metaRequest)(account, `${account.externalAccountId}/media_publish`, { creation_id: container.id });
            }
            else if (account.platform === 'LINKEDIN') {
                result = yield (0, linkedin_service_1.publishLinkedin)(account, row.content, (_c = row.mediaUrls) === null || _c === void 0 ? void 0 : _c[0]);
            }
            else if (account.platform === 'YOUTUBE') {
                result = yield (0, youtube_service_1.publishYoutube)(account, row.content, row.mediaUrls[0]);
            }
            else if (account.platform === 'X') {
                result = yield (0, x_service_1.publishX)(account, row.content, (_d = row.mediaUrls) === null || _d === void 0 ? void 0 : _d[0]);
            }
            else if (account.platform === 'TIKTOK') {
                result = yield (0, tiktok_service_1.publishTiktok)(account, row.content, row.mediaUrls[0]);
            }
            else
                throw new Error('Unsupported platform.');
            if (!result.id)
                throw new Error('Publishing result could not be confirmed.');
            yield prisma_1.default.postStatus.update({ where: { id: row.id }, data: { status: 'PUBLISHED', platformPostId: result.post_id || result.id, publishedAt: new Date(), errorLog: null } });
        }
        catch (error) {
            // No automatic retry after a platform send: a timeout may mean the post was accepted.
            // A 4xx reply from Meta is a definite rejection (nothing was posted), so report Meta's reason instead.
            const meta = error === null || error === void 0 ? void 0 : error.metaError;
            const rejected = meta && meta.status >= 400 && meta.status < 500;
            const errorLog = rejected
                ? `The platform rejected this post (code ${(_e = meta.code) !== null && _e !== void 0 ? _e : '?'}${meta.subcode ? '/' + meta.subcode : ''}): ${String(meta.message || 'no reason given').replace(/\.+$/, '')}. Nothing was published.`
                : 'Could not confirm publishing. Check the platform before creating another post.';
            yield prisma_1.default.postStatus.update({ where: { id: row.id }, data: { status: 'FAILED', errorLog } });
        }
        socket_service_1.socketService.emitToWorkspace(row.workspaceId, 'post-status-update', { jobId: row.jobId });
    });
}
function reconcilePublishing(workspaceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const pending = yield prisma_1.default.postStatus.findMany({ where: Object.assign({ status: 'PENDING' }, (workspaceId ? { workspaceId } : {})), take: 100, orderBy: { scheduledAt: 'asc' } });
        for (const row of pending)
            yield (0, publishing_service_1.enqueuePost)(row);
        // A crashed in-flight request is ambiguous, so never republish it automatically.
        yield prisma_1.default.postStatus.updateMany({ where: Object.assign(Object.assign({}, (workspaceId ? { workspaceId } : {})), { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } }), data: { status: 'FAILED', errorLog: 'Publishing was interrupted. Check the platform before creating another post.' } });
    });
}
function startPublishingWorker() {
    const worker = new bullmq_1.Worker('publishing-queue', processPublishPost, { connection: queue_service_1.redisConnection, concurrency: 3 });
    const reconcile = () => reconcilePublishing().catch(() => console.error('Publishing recovery unavailable; will retry.'));
    void reconcile();
    const timer = setInterval(reconcile, 30000);
    timer.unref();
    worker.on('closed', () => clearInterval(timer));
    worker.on('error', () => console.error('Publishing worker unavailable.'));
    return worker;
}
