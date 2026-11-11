"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userValidation = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const userRegisterValidationSchema = zod_1.z.object({
    userName: zod_1.z.string().min(1, "User name is required"),
    email: zod_1.z.string().email("Valid email is required"),
    phone: zod_1.z.string().min(10, "Phone is required"),
    password: zod_1.z.string().min(8, "Use at least 8 characters"),
    role: zod_1.z.literal(client_1.UserRole.Client).default(client_1.UserRole.Client),
    address: zod_1.z.string().min(1, "Address is required"),
});
const updateUserStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(["Active", "Blocked"]),
});
exports.userValidation = {
    userRegisterValidationSchema,
    updateUserStatusSchema,
};
