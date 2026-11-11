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
exports.uploadRoutes = void 0;
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const multer_1 = __importDefault(require("multer"));
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const fileUploadHelper_1 = require("../../../helpers/fileUploadHelper");
const upload_controller_1 = require("./upload.controller");
const uploadService_1 = require("../../../helpers/uploadService");
const router = express_1.default.Router();
const postImage = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { if (file.mimetype !== "image/jpeg")
        return cb(new ApiErrors_1.default(400, "Choose a JPEG image.")); cb(null, true); } });
router.post("/post-image", (0, auth_1.default)(), postImage.single("file"), (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.file)
        throw new ApiErrors_1.default(400, "No file provided");
    const result = yield (0, uploadService_1.uploadOne)(req.file, { folder: "social-posts", direct: true });
    if (!result.url.startsWith("https://"))
        throw new ApiErrors_1.default(503, "Image sharing is unavailable. Please contact support to enable uploads.");
    (0, sendResponse_1.default)(res, { statusCode: 201, success: true, message: "Image uploaded", data: result });
})));
// YouTube videos: MP4 up to 100 MB (Cloudinary free-plan video limit), stored on Cloudinary before responding.
const postVideo = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { if (file.mimetype !== "video/mp4")
        return cb(new ApiErrors_1.default(400, "Choose an MP4 video.")); cb(null, true); } });
router.post("/post-video", (0, auth_1.default)(), postVideo.single("file"), (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.file)
        throw new ApiErrors_1.default(400, "No file provided");
    const result = yield (0, uploadService_1.uploadOne)(req.file, { folder: "social-videos", direct: true });
    if (!result.url.startsWith("https://"))
        throw new ApiErrors_1.default(503, "Video sharing is unavailable. Please contact support to enable uploads.");
    (0, sendResponse_1.default)(res, { statusCode: 201, success: true, message: "Video uploaded", data: result });
})));
// Inbox attachments: photos/GIFs up to 8 MB, MP4 video, MP3 audio and PDF up to 25 MB (Meta's limits).
const inboxTypes = { "image/jpeg": { type: "image", max: 8 }, "image/png": { type: "image", max: 8 }, "image/gif": { type: "image", max: 8 }, "video/mp4": { type: "video", max: 25 }, "audio/mpeg": { type: "audio", max: 25 }, "application/pdf": { type: "file", max: 25 } };
const inboxFile = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { if (!inboxTypes[file.mimetype])
        return cb(new ApiErrors_1.default(400, "Choose a photo (JPEG, PNG, GIF), MP4 video, MP3 audio or PDF.")); cb(null, true); } });
router.post("/inbox-attachment", (0, auth_1.default)(), inboxFile.single("file"), (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.file)
        throw new ApiErrors_1.default(400, "No file provided");
    const kind = inboxTypes[req.file.mimetype];
    if (req.file.size > kind.max * 1024 * 1024)
        throw new ApiErrors_1.default(400, `This file is too large. The limit is ${kind.max} MB.`);
    const result = yield (0, uploadService_1.uploadOne)(req.file, { folder: "inbox-attachments", direct: true });
    if (!result.url.startsWith("https://res.cloudinary.com/"))
        throw new ApiErrors_1.default(503, "File sharing is unavailable. Please contact support to enable uploads.");
    (0, sendResponse_1.default)(res, { statusCode: 201, success: true, message: "File uploaded", data: { type: kind.type, url: result.url, name: req.file.originalname.slice(0, 200) } });
})));
router.post("/single", (0, auth_1.default)(), fileUploadHelper_1.fileUploader.uploadFile, upload_controller_1.uploadController.uploadSingle);
router.post("/multiple", (0, auth_1.default)(), fileUploadHelper_1.fileUploader.uploadFiles, upload_controller_1.uploadController.uploadMultiple);
exports.uploadRoutes = router;
