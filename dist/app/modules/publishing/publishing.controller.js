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
exports.publishingController = void 0;
const publishing_service_1 = require("./publishing.service");
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const createPost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // tenantGuard middleware ensures workspaceId is present
    const workspaceId = req.headers["x-workspace-id"];
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    const result = yield publishing_service_1.publishingService.createPost(workspaceId, userId, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: result.message,
        data: { jobId: result.jobId, status: result.status, platforms: result.platforms },
    });
}));
const listPosts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const result = yield publishing_service_1.publishingService.listPosts(workspaceId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Posts retrieved",
        data: result,
    });
}));
const getPostStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { jobId } = req.params;
    const result = yield publishing_service_1.publishingService.getPostStatus(workspaceId, jobId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Post status retrieved",
        data: result,
    });
}));
const getPostByPlatform = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { jobId, platform } = req.params;
    const result = yield publishing_service_1.publishingService.getPostByPlatform(workspaceId, jobId, platform);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Post status retrieved",
        data: result,
    });
}));
const retryFailedPost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { jobId, platform } = req.params;
    const result = yield publishing_service_1.publishingService.retryFailedPost(workspaceId, jobId, platform);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: result.message,
    });
}));
const adminListPosts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield publishing_service_1.publishingService.adminListPosts();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "All posts retrieved (admin)",
        data: result,
    });
}));
exports.publishingController = {
    createPost,
    listPosts,
    adminListPosts,
    getPostStatus,
    getPostByPlatform,
    retryFailedPost,
};
