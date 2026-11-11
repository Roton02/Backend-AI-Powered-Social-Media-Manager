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
exports.chatServices = void 0;
const prisma_1 = __importDefault(require("../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const pagination_1 = require("../../../shared/pagination");
const chatCache_1 = require("../../../helpers/chatCache");
const chatRoom_1 = require("../../../helpers/chatRoom");
const socket_controller_1 = require("../socket/socket.controller");
const uploadToDigitalOceanAWS_1 = require("../../../helpers/uploadToDigitalOceanAWS");
const userSelect = {
    id: true,
    userName: true,
    email: true,
    phone: true,
    profileImage: true,
    role: true,
};
const getAllRooms = (query, user) => __awaiter(void 0, void 0, void 0, function* () {
    const { page, limit, skip } = (0, pagination_1.paginationHelper)(query);
    const search = typeof query.search === "string" ? query.search.trim() : "";
    const accessWhere = user.role === "Admin"
        ? {}
        : { OR: [{ user1Id: user.id }, { user2Id: user.id }] };
    const where = Object.assign(Object.assign({}, accessWhere), (search
        ? {
            OR: [
                {
                    user1: {
                        is: { userName: { contains: search, mode: "insensitive" } },
                    },
                },
                {
                    user2: {
                        is: { userName: { contains: search, mode: "insensitive" } },
                    },
                },
            ],
        }
        : {}));
    const rooms = yield prisma_1.default.room.findMany({
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
    const roomsWithRedisPreview = yield Promise.all(rooms.map((room) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const latestRedis = yield (0, chatCache_1.readLatestCachedMessage)(room.id);
        const dbLatest = (_a = room.message[0]) !== null && _a !== void 0 ? _a : null;
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
    })));
    const totalCount = yield prisma_1.default.room.count({ where });
    return {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        rooms: roomsWithRedisPreview,
    };
});
const getRoomById = (roomId, user) => __awaiter(void 0, void 0, void 0, function* () {
    const room = yield prisma_1.default.room.findUnique({
        where: { id: roomId },
        include: {
            user1: { select: userSelect },
            user2: { select: userSelect },
            _count: { select: { message: true } },
        },
    });
    if (!room) {
        throw new ApiErrors_1.default(404, "Room not found");
    }
    if (!(0, chatRoom_1.assertRoomParticipant)(room, user.id, user.role)) {
        throw new ApiErrors_1.default(403, "You are not a participant of this room");
    }
    return room;
});
const getRoomMessages = (roomId, query, user) => __awaiter(void 0, void 0, void 0, function* () {
    const room = yield prisma_1.default.room.findUnique({ where: { id: roomId } });
    if (!room) {
        throw new ApiErrors_1.default(404, "Room not found");
    }
    if (!(0, chatRoom_1.assertRoomParticipant)(room, user.id, user.role)) {
        throw new ApiErrors_1.default(403, "You are not a participant of this room");
    }
    const { page, limit, skip } = (0, pagination_1.paginationHelper)(query);
    const [dbMessages, redisMessages] = yield Promise.all([
        prisma_1.default.message.findMany({
            where: { roomId },
            include: {
                sender: { select: userSelect },
                receiver: { select: userSelect },
            },
            orderBy: { createdAt: "asc" },
        }),
        (0, chatCache_1.readCachedMessages)(roomId),
    ]);
    const merged = (0, chatCache_1.mergeRoomMessages)(dbMessages.map((message) => (Object.assign(Object.assign({}, message), { source: "database" }))), redisMessages);
    const missingSenderIds = [
        ...new Set(merged
            .filter((message) => !("sender" in message && message.sender) && message.senderId)
            .map((message) => String(message.senderId))),
    ];
    const senders = missingSenderIds.length
        ? yield prisma_1.default.user.findMany({
            where: { id: { in: missingSenderIds } },
            select: userSelect,
        })
        : [];
    const senderMap = new Map(senders.map((user) => [user.id, user]));
    const enriched = merged.map((message) => {
        var _a;
        if ("sender" in message && message.sender)
            return message;
        return Object.assign(Object.assign({}, message), { sender: (_a = senderMap.get(String(message.senderId))) !== null && _a !== void 0 ? _a : null });
    });
    const totalCount = enriched.length;
    const paginated = enriched.slice(skip, skip + limit);
    return {
        room: yield getRoomById(roomId, user),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        messages: paginated,
    };
});
const openRoom = (user, receiverId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!receiverId || receiverId === user.id) {
        throw new ApiErrors_1.default(400, "A valid receiverId is required");
    }
    const receiver = yield prisma_1.default.user.findUnique({
        where: { id: receiverId },
        select: userSelect,
    });
    if (!receiver) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    const room = yield (0, chatRoom_1.getOrCreateDirectRoom)(user.id, receiverId);
    return getRoomById(room.id, user);
});
const sendMessage = (roomId, user, content, file, fileUrlFromClient) => __awaiter(void 0, void 0, void 0, function* () {
    const room = yield prisma_1.default.room.findUnique({ where: { id: roomId } });
    if (!room) {
        throw new ApiErrors_1.default(404, "Room not found");
    }
    if (!(0, chatRoom_1.assertRoomParticipant)(room, user.id, user.role)) {
        throw new ApiErrors_1.default(403, "You are not a participant of this room");
    }
    if (!(content === null || content === void 0 ? void 0 : content.trim()) && !file && !fileUrlFromClient) {
        throw new ApiErrors_1.default(400, "Message content or file is required");
    }
    let fileUrl = fileUrlFromClient || undefined;
    if (file) {
        const uploaded = yield (0, uploadToDigitalOceanAWS_1.uploadToDigitalOceanAWS)(file);
        if (!(uploaded === null || uploaded === void 0 ? void 0 : uploaded.Location)) {
            throw new ApiErrors_1.default(400, "Failed to upload attachment");
        }
        fileUrl = uploaded.Location;
    }
    const receiverId = room.user1Id === user.id ? room.user2Id : room.user1Id;
    if (!receiverId) {
        throw new ApiErrors_1.default(400, "Room is missing a participant");
    }
    const sender = {
        id: user.id,
        userName: typeof user.userName === "string" ? user.userName : "User",
        role: user.role,
    };
    const message = {
        id: (0, chatCache_1.newMessageId)(),
        content: (content === null || content === void 0 ? void 0 : content.trim()) || null,
        senderId: user.id,
        receiverId,
        roomId,
        fileUrl: fileUrl !== null && fileUrl !== void 0 ? fileUrl : null,
        createdAt: new Date().toISOString(),
        sender,
    };
    yield (0, chatCache_1.cacheAndQueueMessage)(message);
    (0, socket_controller_1.broadcastToUsers)([user.id, receiverId], {
        type: "member-new-message",
        roomId,
        message,
    });
    return message;
});
const getDirectory = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const { page, limit, skip } = (0, pagination_1.paginationHelper)(query);
    const search = typeof query.search === "string" ? query.search.trim() : "";
    const where = Object.assign({ role: { in: ["Client"] }, status: "Active" }, (search
        ? {
            OR: [
                { userName: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
            ],
        }
        : {}));
    const [users, totalCount] = yield Promise.all([
        prisma_1.default.user.findMany({
            where,
            select: userSelect,
            take: limit,
            skip,
            orderBy: { userName: "asc" },
        }),
        prisma_1.default.user.count({ where }),
    ]);
    return {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        users,
    };
});
exports.chatServices = {
    getAllRooms,
    getRoomById,
    getRoomMessages,
    openRoom,
    sendMessage,
    getDirectory,
};
