"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileUploader = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
//----------------- If store the local --------------// 
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, path.join(process.cwd(), "uploads"));
//   },
//   filename: function (req, file, cb) {
//     // Add a timestamp to the original filename
//     const timestamp = Date.now();
//     const ext = path.extname(file.originalname);
//     const baseName = path.basename(file.originalname, ext);
//     const newFilename = `${timestamp}-${baseName}${ext}`;
//     cb(null, newFilename);
//   },
// });
// --------------  Store in local -------------------//
const storage = multer_1.default.memoryStorage();
exports.upload = (0, multer_1.default)({
    storage: storage,
    limits: {
        // 100 MB in bytes
        fileSize: 100 * 1024 * 1024,
    },
});
// Upload single images
const updateProfileImage = exports.upload.single("avatar");
const uploadQuizImage = exports.upload.single("quizImage");
const uploadServiceImage = exports.upload.single("serviceImage");
// Upload multiple images for portfolio
const sendFiles = exports.upload.fields([
    { name: "sendFiles", maxCount: 10 },
    { name: "messageFiles", maxCount: 10 },
]);
exports.fileUploader = {
    sendFiles,
    updateProfileImage,
    uploadQuizImage,
    uploadServiceImage
};
