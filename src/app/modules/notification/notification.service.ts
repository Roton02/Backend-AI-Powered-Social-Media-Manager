import { UserRole } from "@prisma/client";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import { paginationHelper } from "../../../shared/pagination";
import { socketService } from "../../../shared/socket.service";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import dotenv from "dotenv";

dotenv.config();

// Initialize Firebase Admin SDK
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}";
let serviceAccount: any = null;
try {
  serviceAccount = JSON.parse(serviceAccountRaw);
} catch {
  console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON — push notifications disabled");
}

if (serviceAccount?.project_id && getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const resolveUserIds = async (payload: {
  userIds?: string[];
  audience?: "all" | "clients" | "technicians";
}) => {
  if (payload.userIds?.length) return [...new Set(payload.userIds)];

  const roleFilter =
    payload.audience === "clients"
      ? { role: UserRole.Client }
      : payload.audience === "technicians"
        ? { role: UserRole.Client }
        : { role: { in: [UserRole.Client, UserRole.Admin] } };

  const users = await prisma.user.findMany({
    where: { status: "Active", ...roleFilter },
    select: { id: true },
  });
  return users.map((user) => user.id);
};

const sendPushNotification = async (token: string, title: string, body: string, data?: Record<string, string>) => {
  if (getApps().length === 0) return;
  try {
    await getMessaging().send({
      notification: { title, body },
      token,
      data: data || {},
    });
  } catch (error) {
    console.error("FCM Push Error:", error);
  }
};

const createNotification = async (payload: {
  title: string;
  message: string;
  redirectEndpoint?: string;
  userIds?: string[];
  audience?: "all" | "clients" | "technicians";
}) => {
  const userIds = await resolveUserIds({
    userIds: payload.userIds,
    audience: payload.audience ?? (payload.userIds?.length ? undefined : "all"),
  });
  if (!userIds.length) {
    throw new ApiError(400, "No recipients found for this notification.");
  }

  const notification = await prisma.notification.create({
    data: {
      title: payload.title,
      message: payload.message,
      redirectEndpoint: payload.redirectEndpoint,
    },
  });

  await prisma.notificationRecipient.createMany({
    data: userIds.map((userId) => ({
      notificationId: notification.id,
      userId,
    })),
  });

  const recipients = await prisma.notificationRecipient.findMany({
    where: { notificationId: notification.id },
    select: { id: true, userId: true },
  });

  for (const recipient of recipients) {
    // 1. Real-time Socket update
    socketService.emitToUser(recipient.userId, "notification", {
      id: recipient.id,
      title: payload.title,
      message: payload.message,
      redirectEndpoint: payload.redirectEndpoint,
    });

    // 2. Push Notification (FCM token stored on User model)
    const user = (await prisma.user.findUnique({
      where: { id: recipient.userId },
      select: { fcmToken: true },
    })) as { fcmToken?: string | null } | null;

    if (user?.fcmToken) {
      await sendPushNotification(user.fcmToken, payload.title, payload.message, {
        notificationId: recipient.id,
        endpoint: payload.redirectEndpoint ?? "",
      });
    }
  }

  return { ...notification, recipientCount: userIds.length };
};

const getMyNotifications = async (
  userId: string,
  query: Record<string, unknown>
) => {
  const { page, limit, skip } = paginationHelper(query);
  const notifications = await prisma.notificationRecipient.findMany({
    where: { userId },
    include: { notification: true },
    take: limit,
    skip,
    orderBy: { receivedAt: "desc" },
  });

  const totalCount = await prisma.notificationRecipient.count({
    where: { userId },
  });

  return {
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    notifications,
  };
};

const markAsRead = async (id: string, userId: string) => {
  const recipient = await prisma.notificationRecipient.findFirst({
    where: { id, userId },
  });
  if (!recipient) {
    throw new ApiError(404, "Notification not found");
  }

  return prisma.notificationRecipient.update({
    where: { id },
    data: { isRead: true },
  });
};

const markAllAsRead = async (userId: string) => {
  return prisma.notificationRecipient.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
};

export const notificationServices = {
  createNotification,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
};
