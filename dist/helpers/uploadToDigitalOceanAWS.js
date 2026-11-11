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
exports.deleteFromDigitalOceanAWS = exports.uploadToDigitalOceanAWS = exports.uploadVideoToDigitalOcean = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffprobe_static_1 = __importDefault(require("ffprobe-static"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const uploadService_1 = require("./uploadService");
fluent_ffmpeg_1.default.setFfprobePath(ffprobe_static_1.default.path);
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
const uploadVideoToDigitalOcean = (file) => __awaiter(void 0, void 0, void 0, function* () {
    const fileName = file.originalname.replace(/\s+/g, "-");
    const tempPath = path_1.default.join("/tmp", fileName);
    yield fs_1.default.promises.writeFile(tempPath, new Uint8Array(file.buffer));
    try {
        const duration = yield new Promise((resolve, reject) => {
            fluent_ffmpeg_1.default.ffprobe(tempPath, (err, metadata) => {
                if (err)
                    return reject(err);
                resolve(metadata.format.duration || 0);
            });
        });
        const uploaded = yield (0, uploadService_1.uploadOne)(file, { folder: "videos" });
        return { Location: uploaded.url, duration };
    }
    finally {
        yield fs_1.default.promises.unlink(tempPath).catch(() => undefined);
    }
});
exports.uploadVideoToDigitalOcean = uploadVideoToDigitalOcean;
const uploadToDigitalOceanAWS = (file, folder) => __awaiter(void 0, void 0, void 0, function* () {
    const uploaded = yield (0, uploadService_1.uploadOne)(file, { folder });
    return { Location: uploaded.url };
});
exports.uploadToDigitalOceanAWS = uploadToDigitalOceanAWS;
const deleteFromDigitalOceanAWS = (fileUrl) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, uploadService_1.deleteUploadedFile)(fileUrl);
});
exports.deleteFromDigitalOceanAWS = deleteFromDigitalOceanAWS;
