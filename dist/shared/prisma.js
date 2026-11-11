"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../loadEnv");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient({
    log: [
        {
            emit: "event",
            level: "error",
        },
    ],
});
// Query errors may contain credentials or customer data; never log their raw payload.
prisma.$on("error", () => {
    if (process.env.NODE_ENV !== "test")
        console.error("Database operation failed.");
});
exports.default = prisma;
