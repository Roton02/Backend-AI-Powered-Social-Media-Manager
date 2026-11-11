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
exports.TARGET_IMAGE_BYTES = exports.CLOUDINARY_FREE_IMAGE_MAX = void 0;
exports.compressImageForCloudinary = compressImageForCloudinary;
const sharp_1 = __importDefault(require("sharp"));
const ApiErrors_1 = __importDefault(require("../errors/ApiErrors"));
/** Cloudinary free plan rejects images over 10MB. Stay under that after compress. */
exports.CLOUDINARY_FREE_IMAGE_MAX = 10 * 1024 * 1024;
exports.TARGET_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 1920;
function compressImageForCloudinary(file) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!file.mimetype.startsWith("image/") || file.mimetype === "image/gif") {
            if (file.mimetype.startsWith("image/") && file.size > exports.CLOUDINARY_FREE_IMAGE_MAX) {
                throw new ApiErrors_1.default(400, "This image is too large for Cloudinary's free plan (10MB). Please choose a smaller file.");
            }
            return file;
        }
        let quality = 82;
        let output = yield (0, sharp_1.default)(file.buffer)
            .rotate()
            .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
        while (output.length > exports.TARGET_IMAGE_BYTES && quality > 45) {
            quality -= 12;
            output = yield (0, sharp_1.default)(file.buffer)
                .rotate()
                .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
                .jpeg({ quality, mozjpeg: true })
                .toBuffer();
        }
        if (output.length > exports.CLOUDINARY_FREE_IMAGE_MAX) {
            throw new ApiErrors_1.default(400, "This image is still too large after compression for Cloudinary's free 10MB limit.");
        }
        return Object.assign(Object.assign({}, file), { buffer: output, size: output.length, mimetype: "image/jpeg", originalname: file.originalname.replace(/\.[^.]+$/i, ".jpg") });
    });
}
