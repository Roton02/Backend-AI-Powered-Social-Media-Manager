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
router.post("/single", (0, auth_1.default)(), fileUploadHelper_1.fileUploader.uploadFile, upload_controller_1.uploadController.uploadSingle);
router.post("/multiple", (0, auth_1.default)(), fileUploadHelper_1.fileUploader.uploadFiles, upload_controller_1.uploadController.uploadMultiple);
exports.uploadRoutes = router;
