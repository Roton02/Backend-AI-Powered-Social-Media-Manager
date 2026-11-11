"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationValidation = void 0;
const zod_1 = require("zod");
const createNotificationSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, "Title is required."),
    message: zod_1.z.string().min(1, "Message is required."),
    redirectEndpoint: zod_1.z.string().optional(),
    userIds: zod_1.z.array(zod_1.z.string()).optional(),
    audience: zod_1.z.enum(["all", "clients", "technicians"]).optional(),
});
exports.notificationValidation = {
    createNotificationSchema,
};
