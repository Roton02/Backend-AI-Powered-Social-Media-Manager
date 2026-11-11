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
exports.broadcastToUsers = void 0;
exports.setupWebSocketServer = setupWebSocketServer;
const prisma_1 = __importDefault(require("../../../shared/prisma"));
const socket_service_1 = require("../../../shared/socket.service");
const radis_1 = __importDefault(require("../../../helpers/radis"));
const chatCache_1 = require("../../../helpers/chatCache");
function setupWebSocketServer(server) {
    const io = socket_service_1.socketService.init(server);
    io.on("connection", (socket) => __awaiter(this, void 0, void 0, function* () {
        const userId = socket.data.userId;
        if (!userId) {
            console.log("No userId provided - disconnecting");
            socket.disconnect();
            return;
        }
        socket.join(`user:${userId}`);
        console.log(`User connected: ${userId}`);
        socket.on("member-subscribe", (data) => __awaiter(this, void 0, void 0, function* () {
            const { roomId } = data;
            if (!roomId || !/^[a-f0-9]{24}$/i.test(roomId))
                return;
            const room = yield prisma_1.default.room.findFirst({ where: { id: roomId, OR: [{ user1Id: userId }, { user2Id: userId }] } });
            if (!room)
                return;
            // Join room for real-time updates
            socket.join(`room:${roomId}`);
            const redisKey = `room:${roomId}:messages`;
            const redisRaw = yield radis_1.default.lRange(redisKey, -30, -1);
            const messages = redisRaw.reverse().map((msg) => JSON.parse(msg));
            socket.emit("past-messages", {
                roomId,
                messages: messages,
            });
        }));
        socket.on("member-send-message", (payload) => __awaiter(this, void 0, void 0, function* () {
            const { receiverId, content, fileUrl, roomId } = payload;
            if (!/^[a-f0-9]{24}$/i.test(roomId))
                return;
            const room = yield prisma_1.default.room.findFirst({ where: { id: roomId, OR: [{ user1Id: userId, user2Id: receiverId }, { user2Id: userId, user1Id: receiverId }] } });
            if (!room)
                return;
            const messagePayload = {
                id: (0, chatCache_1.newMessageId)(),
                content: content,
                senderId: userId,
                receiverId,
                roomId,
                fileUrl: fileUrl || null,
                createdAt: new Date().toISOString(),
            };
            yield (0, chatCache_1.cacheAndQueueMessage)(messagePayload);
            // Emit to both sender and receiver
            socket_service_1.socketService.emitToUser(userId, "member-new-message", {
                message: messagePayload,
                roomId,
            });
            socket_service_1.socketService.emitToUser(receiverId, "member-new-message", {
                message: messagePayload,
                roomId,
            });
        }));
        socket.on("disconnect", () => {
            console.log(`User disconnected: ${userId}`);
        });
    }));
}
const broadcastToUsers = (userIds, payload) => {
    userIds.forEach((id) => {
        socket_service_1.socketService.emitToUser(id, "notification", payload);
    });
};
exports.broadcastToUsers = broadcastToUsers;
