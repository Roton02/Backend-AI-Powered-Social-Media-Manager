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
exports.enqueueCloudinaryUpload = enqueueCloudinaryUpload;
exports.applyPromotedUpload = applyPromotedUpload;
exports.startUploadQueueWorker = startUploadQueueWorker;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = __importDefault(require("../shared/prisma"));
const radis_1 = __importDefault(require("./radis"));
const uploadService_1 = require("./uploadService");
const QUEUE_KEY = "upload:cloudinary";
function enqueueCloudinaryUpload(job) {
    return __awaiter(this, void 0, void 0, function* () {
        yield radis_1.default.lPush(QUEUE_KEY, JSON.stringify(job));
    });
}
function rewriteCachedFileUrls(fromUrl, toUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const keys = yield radis_1.default.keys("room:*:messages");
        yield Promise.all(keys.map((key) => __awaiter(this, void 0, void 0, function* () {
            const items = yield radis_1.default.lRange(key, 0, -1);
            let changed = false;
            const next = items.map((raw) => {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.fileUrl !== fromUrl)
                        return raw;
                    changed = true;
                    return JSON.stringify(Object.assign(Object.assign({}, parsed), { fileUrl: toUrl }));
                }
                catch (_a) {
                    return raw;
                }
            });
            if (!changed)
                return;
            yield radis_1.default.del(key);
            if (next.length)
                yield radis_1.default.rPush(key, next);
        })));
    });
}
function applyPromotedUpload(job, cloudUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        yield prisma_1.default.message.updateMany({
            where: { fileUrl: job.localUrl },
            data: { fileUrl: cloudUrl },
        });
        yield rewriteCachedFileUrls(job.localUrl, cloudUrl);
        yield radis_1.default.set(`upload:map:${job.localUrl}`, cloudUrl);
    });
}
function startUploadQueueWorker() {
    const tick = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!radis_1.default.isOpen) {
                setTimeout(tick, 300);
                return;
            }
            const raw = yield radis_1.default.rPop(QUEUE_KEY);
            if (raw) {
                try {
                    const job = JSON.parse(raw);
                    const diskPath = path_1.default.join(process.cwd(), "uploads", job.localKey);
                    try {
                        yield fs_1.default.promises.access(diskPath);
                    }
                    catch (_a) {
                        setImmediate(tick);
                        return;
                    }
                    const cloudUrl = yield (0, uploadService_1.promoteLocalUploadToCloudinary)(job);
                    yield applyPromotedUpload(job, cloudUrl);
                }
                catch (error) {
                    console.error("Upload queue worker:", error);
                    yield radis_1.default.lPush(QUEUE_KEY, raw);
                    setTimeout(tick, 800);
                    return;
                }
                setImmediate(tick);
                return;
            }
        }
        catch (error) {
            console.error("Upload queue worker:", error);
        }
        setTimeout(tick, 200);
    });
    void tick();
}
