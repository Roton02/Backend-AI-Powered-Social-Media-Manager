"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../loadEnv");
const client_1 = require("@prisma/client");
const prismaEveryWhere = new client_1.PrismaClient({
    omit: {
        user: {
            password: true,
        },
    },
});
exports.default = prismaEveryWhere;
