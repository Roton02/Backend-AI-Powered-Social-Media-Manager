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
exports.uploadServices = void 0;
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const uploadService_1 = require("../../../helpers/uploadService");
const uploadSingleFile = (file, folder) => __awaiter(void 0, void 0, void 0, function* () {
    if (!file) {
        throw new ApiErrors_1.default(400, "No file provided");
    }
    return (0, uploadService_1.uploadOne)(file, { folder });
});
const uploadMultipleFiles = (files, folder) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(files === null || files === void 0 ? void 0 : files.length)) {
        throw new ApiErrors_1.default(400, "No files provided");
    }
    const uploaded = yield (0, uploadService_1.uploadMany)(files, { folder });
    return { count: uploaded.length, files: uploaded };
});
exports.uploadServices = {
    uploadSingleFile,
    uploadMultipleFiles,
};
