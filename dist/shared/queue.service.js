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
exports.redisConnection = exports.queueService = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const redisConnection = new ioredis_1.default(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null,
});
exports.redisConnection = redisConnection;
class QueueService {
    constructor() {
        this.queues = new Map();
    }
    getQueue(queueName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.queues.has(queueName)) {
                return this.queues.get(queueName);
            }
            const queue = new bullmq_1.Queue(queueName, {
                connection: redisConnection,
            });
            this.queues.set(queueName, queue);
            return queue;
        });
    }
    addJob(queueName_1, jobName_1, data_1) {
        return __awaiter(this, arguments, void 0, function* (queueName, jobName, data, options = {}) {
            const queue = yield this.getQueue(queueName);
            let timer;
            try {
                return yield Promise.race([
                    queue.add(jobName, data, options),
                    new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Queue unavailable")), 5000); }),
                ]);
            }
            finally {
                if (timer)
                    clearTimeout(timer);
            }
        });
    }
    removeJob(queueName, jobId) {
        return __awaiter(this, void 0, void 0, function* () {
            const queue = yield this.getQueue(queueName);
            yield queue.remove(jobId);
        });
    }
}
exports.queueService = new QueueService();
