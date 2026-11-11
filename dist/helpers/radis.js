"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("redis");
const redisClient = (0, redis_1.createClient)({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});
redisClient.on("connect", () => {
    console.log("✅ Redis connected successfully");
});
redisClient.on("error", (err) => {
    console.error("Redis connection error ❌", err);
});
exports.default = redisClient;
