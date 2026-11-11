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
exports.uploadController = void 0;
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const upload_service_1 = require("./upload.service");
const uploadSingle = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const folder = req.query.folder || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.folder);
    const result = yield upload_service_1.uploadServices.uploadSingleFile(req.file, folder);
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: "File uploaded successfully",
        data: result,
    });
}));
const uploadMultiple = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const folder = req.query.folder || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.folder);
    const result = yield upload_service_1.uploadServices.uploadMultipleFiles(req.files, folder);
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: "Files uploaded successfully",
        data: result,
    });
}));
exports.uploadController = {
    uploadSingle,
    uploadMultiple,
};
