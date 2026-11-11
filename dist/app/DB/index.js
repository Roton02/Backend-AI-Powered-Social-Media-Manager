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
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const config_1 = __importDefault(require("../../config"));
const prisma_1 = __importDefault(require("../../shared/prisma"));
const seedSuperAdmin = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const email = "admin@gmail.com";
        const phone = "01569140345";
        const existing = yield prisma_1.default.user.findFirst({
            where: {
                OR: [{ role: client_1.UserRole.Admin }, { email }, { phone }],
            },
        });
        if (existing)
            return;
        const password = yield bcryptjs_1.default.hash(config_1.default.super_admin_password, Number(config_1.default.bcrypt_salt_rounds) || 12);
        yield prisma_1.default.user.create({
            data: {
                userName: "Super Admin",
                email,
                phone,
                password,
                role: client_1.UserRole.Admin,
            },
        });
        console.log("🦸 Super Admin created successfully.");
    }
    catch (error) {
        console.error("Error seeding Super Admin:", error);
    }
});
exports.default = seedSuperAdmin;
