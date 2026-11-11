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
exports.startInboxWorker = startInboxWorker;
const features_1 = require("../config/features");
const bullmq_1 = require("bullmq");
const queue_service_1 = require("../shared/queue.service");
const prisma_1 = __importDefault(require("../shared/prisma"));
const ai_agent_service_1 = require("../app/modules/ai/services/ai.agent.service");
function startInboxWorker() {
    if (!features_1.featureFlags.aiAutomation)
        return;
    const worker = new bullmq_1.Worker('inbox-sync-queue', job => ai_agent_service_1.aiAgentService.processMessage(job.data.messageId, job.data.workspaceId), { connection: queue_service_1.redisConnection, concurrency: 2 });
    worker.on('failed', (job) => __awaiter(this, void 0, void 0, function* () {
        if (job && job.attemptsMade >= 3) {
            try {
                yield prisma_1.default.unifiedMessage.update({ where: { id: job.data.messageId }, data: { aiProcessed: true, aiSuggestion: 'Automatic reply unavailable. Please reply manually.' } });
            }
            catch ( /* next recovery pass retries */_a) { /* next recovery pass retries */ }
        }
    }));
    worker.on('error', () => console.error('Inbox worker unavailable.'));
    const recover = () => __awaiter(this, void 0, void 0, function* () {
        try {
            const messages = yield prisma_1.default.unifiedMessage.findMany({ where: { aiProcessed: false, direction: 'incoming', kind: 'message', conversationId: { not: null } }, take: 100, orderBy: { createdAt: 'asc' } });
            for (const m of messages)
                yield queue_service_1.queueService.addJob('inbox-sync-queue', 'process-new-message', { messageId: m.id, workspaceId: m.workspaceId }, { jobId: m.id, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: true });
        }
        catch (_a) {
            console.error('Inbox recovery unavailable; will retry.');
        }
    });
    void recover();
    const timer = setInterval(recover, 30000);
    timer.unref();
    worker.on('closed', () => clearInterval(timer));
    return worker;
}
