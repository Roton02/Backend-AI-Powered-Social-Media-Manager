"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileUploader = void 0;
const multer_1 = __importDefault(require("multer"));
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage: storage,
    limits: { fileSize: 3000 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/avif",
            "video/mp4",
            "video/x-matroska",
            "application/pdf",
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return cb(new Error("File type not allowed"), false);
        }
        cb(null, true);
    },
});
// upload single image
const videoUrl = upload.single("videoUrl");
const profileImage = upload.single("profileImage");
const coverPhoto = upload.single("coverPhoto");
const experienceFile = upload.single("experienceFile");
const uploadSingle = upload.single("file");
const uploadFile = upload.single("file");
const uploadFiles = upload.array("files", 20);
// upload multiple image
const uploadMultiple = upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "mediaUrl", maxCount: 1 },
    { name: "documentUrls", maxCount: 5 },
]);
exports.fileUploader = {
    upload,
    videoUrl,
    uploadMultiple,
    profileImage,
    coverPhoto,
    uploadSingle,
    uploadFile,
    uploadFiles,
    experienceFile,
};
