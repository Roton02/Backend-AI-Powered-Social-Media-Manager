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
exports.assertRoomParticipant = exports.getOrCreateDirectRoom = void 0;
const prisma_1 = __importDefault(require("../shared/prisma"));
const getOrCreateDirectRoom = (userAId, userBId) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield prisma_1.default.room.findFirst({
        where: {
            OR: [
                { user1Id: userAId, user2Id: userBId },
                { user1Id: userBId, user2Id: userAId },
            ],
        },
    });
    if (existing)
        return existing;
    return prisma_1.default.room.create({
        data: { user1Id: userAId, user2Id: userBId },
    });
});
exports.getOrCreateDirectRoom = getOrCreateDirectRoom;
const assertRoomParticipant = (room, userId, role) => {
    if (role === "Admin")
        return true;
    return room.user1Id === userId || room.user2Id === userId;
};
exports.assertRoomParticipant = assertRoomParticipant;
