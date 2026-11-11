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
exports.notificationServices = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const pagination_1 = require("../../../shared/pagination");
const socket_service_1 = require("../../../shared/socket.service");
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Initialize Firebase Admin SDK
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}";
let serviceAccount = null;
try {
    serviceAccount = JSON.parse(serviceAccountRaw);
}
catch (_a) {
    console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON — push notifications disabled");
}
if ((serviceAccount === null || serviceAccount === void 0 ? void 0 : serviceAccount.project_id) && (0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)({
        credential: (0, app_1.cert)(serviceAccount),
    });
}
const resolveUserIds = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if ((_a = payload.userIds) === null || _a === void 0 ? void 0 : _a.length)
        return [...new Set(payload.userIds)];
    const roleFilter = payload.audience === "clients"
        ? { role: client_1.UserRole.Client }
        : payload.audience === "technicians"
            ? { role: client_1.UserRole.Client }
            : { role: { in: [client_1.UserRole.Client, client_1.UserRole.Admin] } };
    const users = yield prisma_1.default.user.findMany({
        where: Object.assign({ status: "Active" }, roleFilter),
        select: { id: true },
    });
    return users.map((user) => user.id);
});
const sendPushNotification = (token, title, body, data) => __awaiter(void 0, void 0, void 0, function* () {
    if ((0, app_1.getApps)().length === 0)
        return;
    try {
        yield (0, messaging_1.getMessaging)().send({
            notification: { title, body },
            token,
            data: data || {},
        });
    }
    catch (error) {
        console.error("FCM Push Error:", error);
    }
});
const createNotification = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const userIds = yield resolveUserIds({
        userIds: payload.userIds,
        audience: (_a = payload.audience) !== null && _a !== void 0 ? _a : (((_b = payload.userIds) === null || _b === void 0 ? void 0 : _b.length) ? undefined : "all"),
    });
    if (!userIds.length) {
        throw new ApiErrors_1.default(400, "No recipients found for this notification.");
    }
    const notification = yield prisma_1.default.notification.create({
        data: {
            title: payload.title,
            message: payload.message,
            redirectEndpoint: payload.redirectEndpoint,
        },
    });
    yield prisma_1.default.notificationRecipient.createMany({
        data: userIds.map((userId) => ({
            notificationId: notification.id,
            userId,
        })),
    });
    const recipients = yield prisma_1.default.notificationRecipient.findMany({
        where: { notificationId: notification.id },
        select: { id: true, userId: true },
    });
    for (const recipient of recipients) {
        // 1. Real-time Socket update
        socket_service_1.socketService.emitToUser(recipient.userId, "notification", {
            id: recipient.id,
            title: payload.title,
            message: payload.message,
            redirectEndpoint: payload.redirectEndpoint,
        });
        // 2. Push Notification (FCM token stored on User model)
        const user = (yield prisma_1.default.user.findUnique({
            where: { id: recipient.userId },
            select: { fcmToken: true },
        }));
        if (user === null || user === void 0 ? void 0 : user.fcmToken) {
            yield sendPushNotification(user.fcmToken, payload.title, payload.message, {
                notificationId: recipient.id,
                endpoint: (_c = payload.redirectEndpoint) !== null && _c !== void 0 ? _c : "",
            });
        }
    }
    return Object.assign(Object.assign({}, notification), { recipientCount: userIds.length });
});
const getMyNotifications = (userId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const { page, limit, skip } = (0, pagination_1.paginationHelper)(query);
    const notifications = yield prisma_1.default.notificationRecipient.findMany({
        where: { userId },
        include: { notification: true },
        take: limit,
        skip,
        orderBy: { receivedAt: "desc" },
    });
    const totalCount = yield prisma_1.default.notificationRecipient.count({
        where: { userId },
    });
    return {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        notifications,
    };
});
const markAsRead = (id, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const recipient = yield prisma_1.default.notificationRecipient.findFirst({
        where: { id, userId },
    });
    if (!recipient) {
        throw new ApiErrors_1.default(404, "Notification not found");
    }
    return prisma_1.default.notificationRecipient.update({
        where: { id },
        data: { isRead: true },
    });
});
const markAllAsRead = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    return prisma_1.default.notificationRecipient.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
    });
});
exports.notificationServices = {
    createNotification,
    getMyNotifications,
    markAsRead,
    markAllAsRead,
};
