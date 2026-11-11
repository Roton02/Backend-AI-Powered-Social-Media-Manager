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
exports.deleteUploadedFile = exports.uploadMany = exports.uploadOne = exports.promoteLocalUploadToCloudinary = exports.ALLOWED_UPLOAD_MIME_TYPES = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cloudinary_1 = require("cloudinary");
const ApiErrors_1 = __importDefault(require("../errors/ApiErrors"));
const handleStorageError_1 = require("../errors/handleStorageError");
const config_1 = __importDefault(require("../config"));
const radis_1 = __importDefault(require("./radis"));
const compressImage_1 = require("./compressImage");
exports.ALLOWED_UPLOAD_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
    "video/mp4",
    "video/x-matroska",
    "video/mpeg",
    "audio/mpeg",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
];
const CLOUDINARY_QUEUE = "upload:cloudinary";
const cloudName = (config_1.default.cloudinary.cloud_name || "").trim();
const apiKey = (config_1.default.cloudinary.api_key || "").trim();
const apiSecret = (config_1.default.cloudinary.api_secret || "").trim();
const isProduction = process.env.NODE_ENV === "production";
const hasCloudinary = Boolean(cloudName && apiKey && apiSecret);
if (hasCloudinary) {
    cloudinary_1.v2.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
    });
}
const sanitizeFolder = (folder) => {
    if (!folder)
        return "uploads";
    const cleaned = folder
        .trim()
        .replace(/[^a-zA-Z0-9-_/]/g, "")
        .replace(/^\/+|\/+$/g, "");
    return cleaned || "uploads";
};
const buildFileId = (originalName) => {
    const ext = path_1.default.extname(originalName);
    const baseName = path_1.default
        .basename(originalName, ext)
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-_]/g, "")
        .slice(0, 80);
    const safeBase = baseName || "file";
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeBase}`;
};
const resourceTypeFor = (mimeType) => {
    if (mimeType.startsWith("image/"))
        return "image";
    if (mimeType.startsWith("video/") || mimeType.startsWith("audio/"))
        return "video";
    return "raw";
};
const validateFile = (file) => {
    if (!file) {
        throw new ApiErrors_1.default(400, "No file provided");
    }
    if (!exports.ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
        throw new ApiErrors_1.default(400, "File type not allowed");
    }
};
const saveLocal = (file, key) => __awaiter(void 0, void 0, void 0, function* () {
    const diskPath = path_1.default.join(process.cwd(), "uploads", key);
    yield fs_1.default.promises.mkdir(path_1.default.dirname(diskPath), { recursive: true });
    yield fs_1.default.promises.writeFile(diskPath, file.buffer);
    const base = (config_1.default.backend_base_url || "http://localhost:5003").replace(/\/$/, "");
    return {
        url: `${base}/uploads/${key}`,
        key,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
    };
});
const uploadToCloudinary = (file, folder, fileId) => new Promise((resolve, reject) => {
    const stream = cloudinary_1.v2.uploader.upload_stream({
        folder: `nirapod-sheba/${folder}`,
        public_id: fileId,
        resource_type: resourceTypeFor(file.mimetype),
        overwrite: false,
    }, (error, result) => {
        if (error || !result) {
            reject(error || new Error("Cloudinary upload returned no result."));
            return;
        }
        resolve(result);
    });
    stream.end(file.buffer);
});
const uploadBuffer = (file, options) => __awaiter(void 0, void 0, void 0, function* () {
    validateFile(file);
    const prepared = yield (0, compressImage_1.compressImageForCloudinary)(file);
    const folder = sanitizeFolder(options === null || options === void 0 ? void 0 : options.folder);
    const fileId = buildFileId(prepared.originalname);
    const ext = prepared.mimetype === "image/jpeg" ? ".jpg" : path_1.default.extname(prepared.originalname);
    const localKey = `${folder}/${fileId}${ext}`;
    const saved = yield saveLocal(prepared, localKey);
    if (!hasCloudinary) {
        if (isProduction) {
            throw new ApiErrors_1.default(503, "File storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env.");
        }
        // eslint-disable-next-line no-console
        console.warn("Cloudinary is not configured. Saving the file locally instead.");
        return saved;
    }
    const job = {
        localKey,
        localUrl: saved.url,
        folder,
        fileId,
        mimeType: prepared.mimetype,
        originalName: prepared.originalname,
    };
    try {
        if (!(options === null || options === void 0 ? void 0 : options.direct) && radis_1.default.isOpen) {
            yield radis_1.default.lPush(CLOUDINARY_QUEUE, JSON.stringify(job));
            return saved;
        }
    }
    catch (_a) {
        /* fall through and upload inline */
    }
    try {
        const result = yield uploadToCloudinary(prepared, folder, fileId);
        return {
            url: result.secure_url || result.url,
            key: result.public_id,
            originalName: prepared.originalname,
            mimeType: prepared.mimetype,
            size: prepared.size,
        };
    }
    catch (error) {
        if (!isProduction && (0, handleStorageError_1.isStorageAuthError)(error)) {
            // eslint-disable-next-line no-console
            console.warn("Cloudinary rejected the credentials. Saving the file locally instead.");
            return saved;
        }
        throw (0, handleStorageError_1.storageErrorToApiError)(error);
    }
});
const promoteLocalUploadToCloudinary = (job) => __awaiter(void 0, void 0, void 0, function* () {
    const diskPath = path_1.default.join(process.cwd(), "uploads", job.localKey);
    const buffer = yield fs_1.default.promises.readFile(diskPath);
    const file = {
        buffer,
        mimetype: job.mimeType,
        originalname: job.originalName,
        size: buffer.length,
    };
    const result = yield uploadToCloudinary(file, job.folder, job.fileId);
    return result.secure_url || result.url;
});
exports.promoteLocalUploadToCloudinary = promoteLocalUploadToCloudinary;
const uploadOne = (file, options) => __awaiter(void 0, void 0, void 0, function* () {
    return uploadBuffer(file, options);
});
exports.uploadOne = uploadOne;
const uploadMany = (files, options) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(files === null || files === void 0 ? void 0 : files.length)) {
        throw new ApiErrors_1.default(400, "No files provided");
    }
    return Promise.all(files.map((file) => (0, exports.uploadOne)(file, options)));
});
exports.uploadMany = uploadMany;
const publicIdFromUrl = (fileUrl) => {
    var _a, _b, _c;
    try {
        const parsed = new URL(fileUrl);
        if (!parsed.hostname.includes("cloudinary.com"))
            return null;
        const parts = parsed.pathname.split("/").filter(Boolean);
        const uploadIndex = parts.findIndex((part) => part === "upload");
        if (uploadIndex < 0)
            return (_b = (_a = parts.at(-1)) === null || _a === void 0 ? void 0 : _a.replace(/\.[^.]+$/, "")) !== null && _b !== void 0 ? _b : null;
        const afterUpload = parts.slice(uploadIndex + 1);
        const withoutVersion = ((_c = afterUpload[0]) === null || _c === void 0 ? void 0 : _c.startsWith("v"))
            ? afterUpload.slice(1)
            : afterUpload;
        const joined = withoutVersion.join("/");
        return joined.replace(/\.[^.]+$/, "");
    }
    catch (_d) {
        return null;
    }
};
const deleteUploadedFile = (fileUrl) => __awaiter(void 0, void 0, void 0, function* () {
    if (!fileUrl)
        return;
    if (!hasCloudinary) {
        const localPrefix = `${(config_1.default.backend_base_url || "").replace(/\/$/, "")}/uploads/`;
        if (fileUrl.startsWith(localPrefix)) {
            const relative = fileUrl.slice(localPrefix.length);
            const diskPath = path_1.default.join(process.cwd(), "uploads", relative);
            yield fs_1.default.promises.unlink(diskPath).catch(() => undefined);
        }
        return;
    }
    const publicId = publicIdFromUrl(fileUrl) || fileUrl;
    const types = ["image", "video", "raw"];
    for (const resource_type of types) {
        try {
            const result = yield cloudinary_1.v2.uploader.destroy(publicId, { resource_type });
            if (result.result === "ok" || result.result === "not found")
                return;
        }
        catch (_a) {
            /* try next resource type */
        }
    }
});
exports.deleteUploadedFile = deleteUploadedFile;
