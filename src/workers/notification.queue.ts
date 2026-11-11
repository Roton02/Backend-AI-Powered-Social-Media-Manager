import { Worker, Job } from "bullmq";
import { queueService, redisConnection } from "../shared/queue.service";
import { getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export interface NotificationJobData {
  workspaceId: string;
  userId?: string;
  title: string;
  message: string;
  redirectEndpoint?: string;
  fcmTokens?: string[];
}

class NotificationQueueService {
  async addNotificationJob(data: NotificationJobData) {
    return queueService.addJob("notification-queue", "send-notification", data);
  }
}

export const notificationQueueService = new NotificationQueueService();

export function startNotificationWorker() {
  const worker = new Worker(
    "notification-queue",
    async (job: Job<NotificationJobData>) => {
      const { title, message, fcmTokens, workspaceId } = job.data;

      console.log(
        `[NotificationWorker] Processing notification for workspace ${workspaceId}`
      );

      if (!fcmTokens || fcmTokens.length === 0) {
        return { success: false, reason: "no_tokens" };
      }

      if (getApps().length === 0) {
        return { success: false, reason: "firebase_not_initialized" };
      }

      try {
        const response = await getMessaging().sendEachForMulticast({
          tokens: fcmTokens,
          notification: { title, body: message },
          data: {
            workspaceId,
            redirectEndpoint: job.data.redirectEndpoint ?? "",
          },
        });

        return {
          success: true,
          successCount: response.successCount,
          failureCount: response.failureCount,
        };
      } catch (error: any) {
        console.error("[NotificationWorker] FCM send error:", error.message);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 10,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[NotificationWorker] Job ${job.id} completed`);
  });

  return worker;
}
