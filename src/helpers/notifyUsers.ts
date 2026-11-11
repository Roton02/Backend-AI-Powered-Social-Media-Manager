import prisma from "../shared/prisma";
import { broadcastToUsers } from "../app/modules/socket/socket.controller";

export const notifyUsers = async (payload: {
  title: string;
  message: string;
  redirectEndpoint?: string;
  userIds: string[];
  eventType?: string;
  eventData?: Record<string, unknown>;
}) => {
  const uniqueUserIds = [...new Set(payload.userIds.filter(Boolean))];
  if (!uniqueUserIds.length) return null;

  const notification = await prisma.notification.create({
    data: {
      title: payload.title,
      message: payload.message,
      redirectEndpoint: payload.redirectEndpoint,
    },
  });

  await prisma.notificationRecipient.createMany({
    data: uniqueUserIds.map((userId) => ({
      notificationId: notification.id,
      userId,
    })),
  });

  const recipients = await prisma.notificationRecipient.findMany({
    where: { notificationId: notification.id },
    select: { id: true, userId: true },
  });

  for (const recipient of recipients) {
    broadcastToUsers([recipient.userId], {
      type: payload.eventType ?? "notification",
      notification: {
        id: recipient.id,
        title: payload.title,
        message: payload.message,
        redirectEndpoint: payload.redirectEndpoint,
      },
      data: payload.eventData,
    });
  }

  return notification;
};
