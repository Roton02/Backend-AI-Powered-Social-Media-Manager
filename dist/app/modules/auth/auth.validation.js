"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authValidation = void 0;
const zod_1 = require("zod");
const authLoginSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email address"),
});
exports.authValidation = {
    authLoginSchema,
};
