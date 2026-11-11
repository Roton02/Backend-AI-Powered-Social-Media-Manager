import { Server } from "socket.io";
import { Request } from "express";
import prisma from "../../../shared/prisma";
import { socketService } from "../../../shared/socket.service";
import { parse } from "url";
import redisClient from "../../../helpers/radis";
import { cacheAndQueueMessage, newMessageId } from "../../../helpers/chatCache";

export function setupWebSocketServer(server: any) {
  const io = socketService.init(server);

  io.on("connection", async (socket) => {
    const userId = socket.data.userId;

    if (!userId) {
      console.log("No userId provided - disconnecting");
      socket.disconnect();
      return;
    }

    socket.join(`user:${userId}`);
    console.log(`User connected: ${userId}`);

    socket.on("member-subscribe", async (data: { roomId: string }) => {
      const { roomId } = data;
      if (!roomId || !/^[a-f0-9]{24}$/i.test(roomId)) return;
      const room=await prisma.room.findFirst({where:{id:roomId,OR:[{user1Id:userId},{user2Id:userId}]}});
      if(!room) return;

      // Join room for real-time updates
      socket.join(`room:${roomId}`);

      const redisKey = `room:${roomId}:messages`;
      const redisRaw = await redisClient.lRange(redisKey, -30, -1);
      const messages = redisRaw.reverse().map((msg) => JSON.parse(msg));

      socket.emit("past-messages", {
        roomId,
        messages: messages,
      });
    });

    socket.on("member-send-message", async (payload: {
      receiverId: string;
      content: string;
      fileUrl?: string;
      roomId: string;
    }) => {
      const { receiverId, content, fileUrl, roomId } = payload;

      if(!/^[a-f0-9]{24}$/i.test(roomId)) return;
      const room=await prisma.room.findFirst({where:{id:roomId,OR:[{user1Id:userId,user2Id:receiverId},{user2Id:userId,user1Id:receiverId}]}});
      if(!room) return;
      const messagePayload = {
        id: newMessageId(),
        content: content,
        senderId: userId,
        receiverId,
        roomId,
        fileUrl: fileUrl || null,
        createdAt: new Date().toISOString(),
      };

      await cacheAndQueueMessage(messagePayload);

      // Emit to both sender and receiver
      socketService.emitToUser(userId, "member-new-message", {
        message: messagePayload,
        roomId,
      });
      socketService.emitToUser(receiverId, "member-new-message", {
        message: messagePayload,
        roomId,
      });
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${userId}`);
    });
  });
}

export const broadcastToUsers = (
  userIds: string[],
  payload: Record<string, unknown>
) => {
  userIds.forEach((id) => {
    socketService.emitToUser(id, "notification", payload);
  });
};
