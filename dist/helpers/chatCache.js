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
exports.messageCacheKey = messageCacheKey;
exports.newMessageId = newMessageId;
exports.isObjectId = isObjectId;
exports.messageFingerprint = messageFingerprint;
exports.cacheAndQueueMessage = cacheAndQueueMessage;
exports.readCachedMessages = readCachedMessages;
exports.readLatestCachedMessage = readLatestCachedMessage;
exports.mergeRoomMessages = mergeRoomMessages;
exports.startChatPersistWorker = startChatPersistWorker;
const mongodb_1 = require("mongodb");
const prisma_1 = __importDefault(require("../shared/prisma"));
const radis_1 = __importDefault(require("./radis"));
const PERSIST_QUEUE = "chat:persist";
const CACHE_KEEP = 200;
function messageCacheKey(roomId) {
    return `room:${roomId}:messages`;
}
function newMessageId() {
    return new mongodb_1.ObjectId().toHexString();
}
function isObjectId(value) {
    return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
}
function messageFingerprint(message) {
    const time = Math.round(new Date(message.createdAt || 0).getTime() / 1000);
    return `${message.senderId || ""}|${message.content || ""}|${message.fileUrl || ""}|${time}`;
}
function normalizeCached(parsed, roomId, index) {
    var _a, _b, _c, _d, _e, _f, _g;
    const sender = parsed.sender && typeof parsed.sender === "object"
        ? parsed.sender
        : null;
    const id = isObjectId(parsed.id) ? String(parsed.id) : `redis-${roomId}-${index}`;
    return {
        id,
        content: typeof parsed.content === "string" ? parsed.content : null,
        senderId: String((_c = (_b = (_a = parsed.senderId) !== null && _a !== void 0 ? _a : parsed.user1Id) !== null && _b !== void 0 ? _b : sender === null || sender === void 0 ? void 0 : sender.id) !== null && _c !== void 0 ? _c : ""),
        receiverId: String((_e = (_d = parsed.receiverId) !== null && _d !== void 0 ? _d : parsed.user2Id) !== null && _e !== void 0 ? _e : ""),
        roomId: String((_f = parsed.roomId) !== null && _f !== void 0 ? _f : roomId),
        fileUrl: typeof parsed.fileUrl === "string" ? parsed.fileUrl : null,
        createdAt: typeof parsed.createdAt === "string"
            ? parsed.createdAt
            : new Date(String((_g = parsed.createdAt) !== null && _g !== void 0 ? _g : Date.now())).toISOString(),
        sender,
    };
}
function cacheAndQueueMessage(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = messageCacheKey(message.roomId);
        const payload = JSON.stringify(message);
        yield radis_1.default.rPush(key, payload);
        yield radis_1.default.lTrim(key, -CACHE_KEEP, -1);
        yield radis_1.default.lPush(PERSIST_QUEUE, payload);
        if (message.receiverId) {
            yield radis_1.default.incr(`room:${message.roomId}:unread:${message.receiverId}`);
        }
    });
}
function readCachedMessages(roomId) {
    return __awaiter(this, void 0, void 0, function* () {
        const raw = yield radis_1.default.lRange(messageCacheKey(roomId), 0, -1);
        return raw.map((item, index) => normalizeCached(JSON.parse(item), roomId, index));
    });
}
function readLatestCachedMessage(roomId) {
    return __awaiter(this, void 0, void 0, function* () {
        const raw = yield radis_1.default.lRange(messageCacheKey(roomId), -1, -1);
        if (!raw.length)
            return null;
        return normalizeCached(JSON.parse(raw[0]), roomId, 0);
    });
}
function mergeRoomMessages(databaseMessages, cachedMessages) {
    const byId = new Set();
    const byFingerprint = new Set();
    const merged = [];
    const add = (message) => {
        var _a, _b;
        const id = isObjectId(message.id) ? String(message.id) : "";
        const fingerprint = messageFingerprint({
            senderId: String((_a = message.senderId) !== null && _a !== void 0 ? _a : ""),
            content: typeof message.content === "string" ? message.content : null,
            fileUrl: typeof message.fileUrl === "string" ? message.fileUrl : null,
            createdAt: (_b = message.createdAt) !== null && _b !== void 0 ? _b : null,
        });
        if (id && byId.has(id))
            return;
        if (fingerprint && byFingerprint.has(fingerprint))
            return;
        if (id)
            byId.add(id);
        if (fingerprint)
            byFingerprint.add(fingerprint);
        merged.push(message);
    };
    databaseMessages.forEach((message) => add(message));
    cachedMessages.forEach((message) => add(Object.assign(Object.assign({}, message), { source: "redis" })));
    return merged.sort((left, right) => new Date(String(left.createdAt)).getTime() -
        new Date(String(right.createdAt)).getTime());
}
function persistOne(raw) {
    return __awaiter(this, void 0, void 0, function* () {
        const message = JSON.parse(raw);
        if (!isObjectId(message.id) || !message.roomId || !message.senderId || !message.receiverId) {
            return;
        }
        const existing = yield prisma_1.default.message.findUnique({
            where: { id: message.id },
            select: { id: true },
        });
        if (!existing) {
            yield prisma_1.default.message.create({
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
        yield prisma_1.default.room.update({
            where: { id: message.roomId },
            data: { updatedAt: new Date(message.createdAt) },
        });
    });
}
function startChatPersistWorker() {
    const tick = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!radis_1.default.isOpen) {
                setTimeout(tick, 300);
                return;
            }
            const raw = yield radis_1.default.rPop(PERSIST_QUEUE);
            if (raw) {
                try {
                    yield persistOne(raw);
                }
                catch (error) {
                    const code = error === null || error === void 0 ? void 0 : error.code;
                    if (code !== "P2002") {
                        console.error("Chat persist worker:", error);
                        yield radis_1.default.lPush(PERSIST_QUEUE, raw);
                        setTimeout(tick, 400);
                        return;
                    }
                }
                setImmediate(tick);
                return;
            }
        }
        catch (error) {
            console.error("Chat persist worker:", error);
        }
        setTimeout(tick, 150);
    });
    void tick();
}
