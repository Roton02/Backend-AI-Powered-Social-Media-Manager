"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageErrorToApiError = exports.isStorageSdkError = exports.isStorageAuthError = exports.storageErrorCode = void 0;
const ApiErrors_1 = __importDefault(require("./ApiErrors"));
const storageErrorCode = (error) => {
    const err = (error !== null && error !== void 0 ? error : {});
    return String(err.Code || err.code || err.http_code || err.name || "");
};
exports.storageErrorCode = storageErrorCode;
const isStorageAuthError = (error) => {
    var _a;
    const err = (error !== null && error !== void 0 ? error : {});
    const code = (0, exports.storageErrorCode)(error);
    const status = Number(err.http_code || ((_a = err.$metadata) === null || _a === void 0 ? void 0 : _a.httpStatusCode) || 0);
    return (status === 401 ||
        status === 403 ||
        code === "401" ||
        code === "403" ||
        /invalid.*(api.?key|cloud.?name|signature|credentials)/i.test(err.message || ""));
};
exports.isStorageAuthError = isStorageAuthError;
const isStorageSdkError = (error) => {
    var _a;
    const err = (error !== null && error !== void 0 ? error : {});
    return (Boolean(err.$metadata || err.$fault || err.http_code || ((_a = err.error) === null || _a === void 0 ? void 0 : _a.http_code)) ||
        (0, exports.isStorageAuthError)(error));
};
exports.isStorageSdkError = isStorageSdkError;
const storageErrorToApiError = (error) => {
    var _a;
    const err = (error !== null && error !== void 0 ? error : {});
    const status = Number(err.http_code || ((_a = err.$metadata) === null || _a === void 0 ? void 0 : _a.httpStatusCode) || 0);
    const message = err.message || "";
    if (status === 401 || /invalid.*(api.?key|cloud.?name|signature)/i.test(message)) {
        return new ApiErrors_1.default(503, "Cloudinary credentials are invalid. Update CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env.");
    }
    if (status === 400 || /file size too large/i.test(message)) {
        return new ApiErrors_1.default(400, "This file is too large for Cloudinary's free plan (images max 10MB). Try a smaller photo.");
    }
    if (message) {
        return new ApiErrors_1.default(503, `Could not upload the file. ${message}`);
    }
    return new ApiErrors_1.default(503, "Could not upload the file right now. Please try again.");
};
exports.storageErrorToApiError = storageErrorToApiError;
