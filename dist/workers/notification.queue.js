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
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationQueueService = void 0;
exports.startNotificationWorker = startNotificationWorker;
const bullmq_1 = require("bullmq");
const queue_service_1 = require("../shared/queue.service");
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
class NotificationQueueService {
    addNotificationJob(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return queue_service_1.queueService.addJob("notification-queue", "send-notification", data);
        });
    }
}
exports.notificationQueueService = new NotificationQueueService();
function startNotificationWorker() {
    const worker = new bullmq_1.Worker("notification-queue", (job) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const { title, message, fcmTokens, workspaceId } = job.data;
        console.log(`[NotificationWorker] Processing notification for workspace ${workspaceId}`);
        if (!fcmTokens || fcmTokens.length === 0) {
            return { success: false, reason: "no_tokens" };
        }
        if ((0, app_1.getApps)().length === 0) {
            return { success: false, reason: "firebase_not_initialized" };
        }
        try {
            const response = yield (0, messaging_1.getMessaging)().sendEachForMulticast({
                tokens: fcmTokens,
                notification: { title, body: message },
                data: {
                    workspaceId,
                    redirectEndpoint: (_a = job.data.redirectEndpoint) !== null && _a !== void 0 ? _a : "",
                },
            });
            return {
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount,
            };
        }
        catch (error) {
            console.error("[NotificationWorker] FCM send error:", error.message);
            throw error;
        }
    }), {
        connection: queue_service_1.redisConnection,
        concurrency: 10,
    });
    worker.on("completed", (job) => {
        console.log(`[NotificationWorker] Job ${job.id} completed`);
    });
    return worker;
}
