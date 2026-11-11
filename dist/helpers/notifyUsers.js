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
exports.notifyUsers = void 0;
const prisma_1 = __importDefault(require("../shared/prisma"));
const socket_controller_1 = require("../app/modules/socket/socket.controller");
const notifyUsers = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const uniqueUserIds = [...new Set(payload.userIds.filter(Boolean))];
    if (!uniqueUserIds.length)
        return null;
    const notification = yield prisma_1.default.notification.create({
        data: {
            title: payload.title,
            message: payload.message,
            redirectEndpoint: payload.redirectEndpoint,
        },
    });
    yield prisma_1.default.notificationRecipient.createMany({
        data: uniqueUserIds.map((userId) => ({
            notificationId: notification.id,
            userId,
        })),
    });
    const recipients = yield prisma_1.default.notificationRecipient.findMany({
        where: { notificationId: notification.id },
        select: { id: true, userId: true },
    });
    for (const recipient of recipients) {
        (0, socket_controller_1.broadcastToUsers)([recipient.userId], {
            type: (_a = payload.eventType) !== null && _a !== void 0 ? _a : "notification",
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
});
exports.notifyUsers = notifyUsers;
