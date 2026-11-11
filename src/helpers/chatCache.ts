import { ObjectId } from "mongodb";

import prisma from "../shared/prisma";
import redisClient from "./radis";

export type CachedChatSender = {
  id: string;
  userName?: string | null;
  role?: string;
  profileImage?: string | null;
};

export type CachedChatMessage = {
  id: string;
  content: string | null;
  senderId: string;
  receiverId: string;
  roomId: string;
  fileUrl: string | null;
  createdAt: string;
  sender?: CachedChatSender | null;
};

const PERSIST_QUEUE = "chat:persist";
const CACHE_KEEP = 200;

export function messageCacheKey(roomId: string) {
  return `room:${roomId}:messages`;
}

export function newMessageId() {
  return new ObjectId().toHexString();
}

export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
}

export function messageFingerprint(message: {
  senderId?: string | null;
  content?: string | null;
  fileUrl?: string | null;
  createdAt?: string | Date | null;
}) {
  const time = Math.round(new Date(message.createdAt || 0).getTime() / 1000);
  return `${message.senderId || ""}|${message.content || ""}|${message.fileUrl || ""}|${time}`;
}

function normalizeCached(
  parsed: Record<string, unknown>,
  roomId: string,
  index: number,
): CachedChatMessage {
  const sender =
    parsed.sender && typeof parsed.sender === "object"
      ? (parsed.sender as CachedChatSender)
      : null;
  const id = isObjectId(parsed.id) ? String(parsed.id) : `redis-${roomId}-${index}`;
  return {
    id,
    content: typeof parsed.content === "string" ? parsed.content : null,
    senderId: String(parsed.senderId ?? parsed.user1Id ?? sender?.id ?? ""),
    receiverId: String(parsed.receiverId ?? parsed.user2Id ?? ""),
    roomId: String(parsed.roomId ?? roomId),
    fileUrl: typeof parsed.fileUrl === "string" ? parsed.fileUrl : null,
    createdAt:
      typeof parsed.createdAt === "string"
        ? parsed.createdAt
        : new Date(String(parsed.createdAt ?? Date.now())).toISOString(),
    sender,
  };
}

export async function cacheAndQueueMessage(message: CachedChatMessage) {
  const key = messageCacheKey(message.roomId);
  const payload = JSON.stringify(message);
  await redisClient.rPush(key, payload);
  await redisClient.lTrim(key, -CACHE_KEEP, -1);
  await redisClient.lPush(PERSIST_QUEUE, payload);
  if (message.receiverId) {
    await redisClient.incr(`room:${message.roomId}:unread:${message.receiverId}`);
  }
}

export async function readCachedMessages(roomId: string) {
  const raw = await redisClient.lRange(messageCacheKey(roomId), 0, -1);
  return raw.map((item, index) =>
    normalizeCached(JSON.parse(item) as Record<string, unknown>, roomId, index),
  );
}

export async function readLatestCachedMessage(roomId: string) {
  const raw = await redisClient.lRange(messageCacheKey(roomId), -1, -1);
  if (!raw.length) return null;
  return normalizeCached(JSON.parse(raw[0]) as Record<string, unknown>, roomId, 0);
}

export function mergeRoomMessages<T extends Record<string, unknown>>(
  databaseMessages: T[],
  cachedMessages: CachedChatMessage[],
) {
  const byId = new Set<string>();
  const byFingerprint = new Set<string>();
  const merged: Array<T | (CachedChatMessage & { source: "redis" })> = [];

  const add = (message: T | (CachedChatMessage & { source: "redis" })) => {
    const id = isObjectId(message.id) ? String(message.id) : "";
    const fingerprint = messageFingerprint({
      senderId: String(message.senderId ?? ""),
      content: typeof message.content === "string" ? message.content : null,
      fileUrl: typeof message.fileUrl === "string" ? message.fileUrl : null,
      createdAt: (message.createdAt as string | Date | undefined) ?? null,
    });
    if (id && byId.has(id)) return;
    if (fingerprint && byFingerprint.has(fingerprint)) return;
    if (id) byId.add(id);
    if (fingerprint) byFingerprint.add(fingerprint);
    merged.push(message);
  };

  databaseMessages.forEach((message) => add(message));
  cachedMessages.forEach((message) => add({ ...message, source: "redis" }));

  return merged.sort(
    (left, right) =>
      new Date(String(left.createdAt)).getTime() -
      new Date(String(right.createdAt)).getTime(),
  );
}

async function persistOne(raw: string) {
  const message = JSON.parse(raw) as CachedChatMessage;
  if (!isObjectId(message.id) || !message.roomId || !message.senderId || !message.receiverId) {
    return;
  }

  const existing = await prisma.message.findUnique({
    where: { id: message.id },
    select: { id: true },
  });
  if (!existing) {
    await prisma.message.create({
      data: {
        id: message.id,
        senderId: message.senderId,
        receiverId: message.receiverId,
        roomId: message.roomId,
        content: message.content,
        fileUrl: message.fileUrl,
        createdAt: new Date(message.createdAt),
      },
    });
  }

  await prisma.room.update({
    where: { id: message.roomId },
    data: { updatedAt: new Date(message.createdAt) },
  });
}

export function startChatPersistWorker() {
  const tick = async () => {
    try {
      if (!redisClient.isOpen) {
        setTimeout(tick, 300);
        return;
      }
      const raw = await redisClient.rPop(PERSIST_QUEUE);
      if (raw) {
        try {
          await persistOne(raw);
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (code !== "P2002") {
            console.error("Chat persist worker:", error);
            await redisClient.lPush(PERSIST_QUEUE, raw);
            setTimeout(tick, 400);
            return;
          }
        }
        setImmediate(tick);
        return;
      }
    } catch (error) {
      console.error("Chat persist worker:", error);
    }
    setTimeout(tick, 150);
  };
  void tick();
}
