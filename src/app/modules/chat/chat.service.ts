import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import { paginationHelper } from "../../../shared/pagination";
import {
  cacheAndQueueMessage,
  mergeRoomMessages,
  newMessageId,
  readCachedMessages,
  readLatestCachedMessage,
  type CachedChatMessage,
} from "../../../helpers/chatCache";
import { getOrCreateDirectRoom, assertRoomParticipant } from "../../../helpers/chatRoom";
import { broadcastToUsers } from "../socket/socket.controller";
import { uploadToDigitalOceanAWS } from "../../../helpers/uploadToDigitalOceanAWS";

const userSelect = {
  id: true,
  userName: true,
  email: true,
  phone: true,
  profileImage: true,
  role: true,
};

const getAllRooms = async (
  query: Record<string, unknown>,
  user: { id: string; role: string }
) => {
  const { page, limit, skip } = paginationHelper(query);
  const search = typeof query.search === "string" ? query.search.trim() : "";

  const accessWhere =
    user.role === "Admin"
      ? {}
      : { OR: [{ user1Id: user.id }, { user2Id: user.id }] };

  const where = {
    ...accessWhere,
    ...(search
      ? {
          OR: [
            {
              user1: {
                is: { userName: { contains: search, mode: "insensitive" as const } },
              },
            },
            {
              user2: {
                is: { userName: { contains: search, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };

  const rooms = await prisma.room.findMany({
    where,
    include: {
      user1: { select: userSelect },
      user2: { select: userSelect },
      message: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          sender: { select: userSelect },
          receiver: { select: userSelect },
        },
      },
      _count: { select: { message: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    skip,
  });

  const roomsWithRedisPreview = await Promise.all(
    rooms.map(async (room) => {
      const latestRedis = await readLatestCachedMessage(room.id);
      const dbLatest = room.message[0] ?? null;

      return {
        id: room.id,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        user1: room.user1,
        user2: room.user2,
        messageCount: room._count.message,
        lastMessage: latestRedis
          ? {
              id: latestRedis.id,
              content: latestRedis.content,
              createdAt: latestRedis.createdAt,
              senderId: latestRedis.senderId,
              receiverId: latestRedis.receiverId,
              sender: latestRedis.sender,
              source: "redis",
            }
          : dbLatest
            ? {
                id: dbLatest.id,
                content: dbLatest.content,
                createdAt: dbLatest.createdAt,
                sender: dbLatest.sender,
                receiver: dbLatest.receiver,
                source: "database",
              }
            : null,
      };
    })
  );

  const totalCount = await prisma.room.count({ where });

  return {
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    rooms: roomsWithRedisPreview,
  };
};

const getRoomById = async (
  roomId: string,
  user: { id: string; role: string }
) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      user1: { select: userSelect },
      user2: { select: userSelect },
      _count: { select: { message: true } },
    },
  });

  if (!room) {
    throw new ApiError(404, "Room not found");
  }

  if (!assertRoomParticipant(room, user.id, user.role)) {
    throw new ApiError(403, "You are not a participant of this room");
  }

  return room;
};

const getRoomMessages = async (
  roomId: string,
  query: Record<string, unknown>,
  user: { id: string; role: string }
) => {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    throw new ApiError(404, "Room not found");
  }
  if (!assertRoomParticipant(room, user.id, user.role)) {
    throw new ApiError(403, "You are not a participant of this room");
  }

  const { page, limit, skip } = paginationHelper(query);

  const [dbMessages, redisMessages] = await Promise.all([
    prisma.message.findMany({
      where: { roomId },
      include: {
        sender: { select: userSelect },
        receiver: { select: userSelect },
      },
      orderBy: { createdAt: "asc" },
    }),
    readCachedMessages(roomId),
  ]);

  const merged = mergeRoomMessages(
    dbMessages.map((message) => ({ ...message, source: "database" as const })),
    redisMessages,
  );

  const missingSenderIds = [
    ...new Set(
      merged
        .filter((message) => !("sender" in message && message.sender) && message.senderId)
        .map((message) => String(message.senderId)),
    ),
  ];
  const senders = missingSenderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: missingSenderIds } },
        select: userSelect,
      })
    : [];
  const senderMap = new Map(senders.map((user) => [user.id, user]));

  const enriched = merged.map((message) => {
    if ("sender" in message && message.sender) return message;
    return {
      ...message,
      sender: senderMap.get(String(message.senderId)) ?? null,
    };
  });

  const totalCount = enriched.length;
  const paginated = enriched.slice(skip, skip + limit);

  return {
    room: await getRoomById(roomId, user),
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    messages: paginated,
  };
};

const openRoom = async (
  user: { id: string; role: string },
  receiverId: string
) => {
  if (!receiverId || receiverId === user.id) {
    throw new ApiError(400, "A valid receiverId is required");
  }
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: userSelect,
  });
  if (!receiver) {
    throw new ApiError(404, "User not found");
  }
  const room = await getOrCreateDirectRoom(user.id, receiverId);
  return getRoomById(room.id, user);
};

const sendMessage = async (
  roomId: string,
  user: { id: string; role: string; userName?: string },
  content?: string,
  file?: Express.Multer.File,
  fileUrlFromClient?: string
) => {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    throw new ApiError(404, "Room not found");
  }
  if (!assertRoomParticipant(room, user.id, user.role)) {
    throw new ApiError(403, "You are not a participant of this room");
  }
  if (!content?.trim() && !file && !fileUrlFromClient) {
    throw new ApiError(400, "Message content or file is required");
  }

  let fileUrl: string | undefined = fileUrlFromClient || undefined;
  if (file) {
    const uploaded = await uploadToDigitalOceanAWS(file);
    if (!uploaded?.Location) {
      throw new ApiError(400, "Failed to upload attachment");
    }
    fileUrl = uploaded.Location;
  }

  const receiverId =
    room.user1Id === user.id ? room.user2Id : room.user1Id;
  if (!receiverId) {
    throw new ApiError(400, "Room is missing a participant");
  }

  const sender: CachedChatMessage["sender"] = {
    id: user.id,
    userName: typeof user.userName === "string" ? user.userName : "User",
    role: user.role,
  };

  const message: CachedChatMessage = {
    id: newMessageId(),
    content: content?.trim() || null,
    senderId: user.id,
    receiverId,
    roomId,
    fileUrl: fileUrl ?? null,
    createdAt: new Date().toISOString(),
    sender,
  };

  await cacheAndQueueMessage(message);

  broadcastToUsers([user.id, receiverId], {
    type: "member-new-message",
    roomId,
    message,
  });

  return message;
};

const getDirectory = async (query: Record<string, unknown>) => {
  const { page, limit, skip } = paginationHelper(query);
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const where = {
    role: { in: ["Client"] as "Client"[] },
    status: "Active" as const,
    ...(search
      ? {
          OR: [
            { userName: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      take: limit,
      skip,
      orderBy: { userName: "asc" },
    }),
    prisma.user.count({ where }),
  ]);
  return {
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    users,
  };
};

export const chatServices = {
  getAllRooms,
  getRoomById,
  getRoomMessages,
  openRoom,
  sendMessage,
  getDirectory,
};
