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
exports.workspaceController = void 0;
const workspace_service_1 = require("./workspace.service");
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const zod_1 = require("zod");
const http_status_1 = __importDefault(require("http-status"));
const createWorkspace = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(100), slug: zod_1.z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }).parse(req.body);
    const workspace = yield workspace_service_1.workspaceService.createWorkspace(data, req.user.id);
    (0, sendResponse_1.default)(res, { statusCode: 201, success: true, message: "Workspace created", data: workspace });
}));
const getMyWorkspace = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    const workspace = yield workspace_service_1.workspaceService.getMyWorkspace(userId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Workspace retrieved",
        data: workspace,
    });
}));
const getWorkspace = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const workspace = yield workspace_service_1.workspaceService.getWorkspace(workspaceId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Workspace retrieved",
        data: workspace,
    });
}));
const updateWorkspace = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { name, slug, settings } = req.body;
    const payload = {};
    if (name !== undefined)
        payload.name = name;
    if (slug !== undefined)
        payload.slug = slug;
    if (settings !== undefined)
        payload.settings = settings;
    const workspace = yield workspace_service_1.workspaceService.updateWorkspace(payload, workspaceId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Workspace updated",
        data: workspace,
    });
}));
const getStats = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const stats = yield workspace_service_1.workspaceService.getWorkspaceStats(workspaceId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Workspace stats retrieved",
        data: stats,
    });
}));
const getAnalytics = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const analytics = yield workspace_service_1.workspaceService.getWorkspaceAnalytics(workspaceId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Workspace analytics retrieved",
        data: analytics,
    });
}));
const adminListWorkspaces = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaces = yield workspace_service_1.workspaceService.adminListWorkspaces();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "All workspaces retrieved (admin)",
        data: workspaces,
    });
}));
exports.workspaceController = {
    createWorkspace,
    getMyWorkspace,
    getWorkspace,
    updateWorkspace,
    getStats,
    getAnalytics,
    adminListWorkspaces,
};
