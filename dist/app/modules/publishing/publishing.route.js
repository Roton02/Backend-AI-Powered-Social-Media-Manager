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
exports.PublishingRoutes = void 0;
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const publishing_service_1 = require("./publishing.service");
const express_1 = __importDefault(require("express"));
const publishing_controller_1 = require("./publishing.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const tenantGuard_1 = __importDefault(require("../../middlewares/tenantGuard"));
const client_1 = require("@prisma/client");
const router = express_1.default.Router();
// Admin: all queued/published jobs across workspaces
router.get("/admin/all", (0, auth_1.default)(client_1.UserRole.Admin), publishing_controller_1.publishingController.adminListPosts);
router.get("/", (0, auth_1.default)(), tenantGuard_1.default, publishing_controller_1.publishingController.listPosts);
router.post("/", (0, auth_1.default)(), tenantGuard_1.default, publishing_controller_1.publishingController.createPost);
router.post("/:jobId/cancel", (0, auth_1.default)(), tenantGuard_1.default, (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Post cancelled", data: yield publishing_service_1.publishingService.cancelPost(req.headers['x-workspace-id'], req.params.jobId) });
})));
router.post("/:jobId/publish", (0, auth_1.default)(), tenantGuard_1.default, (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: "Draft queued", data: yield publishing_service_1.publishingService.publishDraft(req.headers['x-workspace-id'], req.params.jobId) });
})));
router.get("/:jobId", (0, auth_1.default)(), tenantGuard_1.default, publishing_controller_1.publishingController.getPostStatus);
router.get("/:jobId/platform/:platform", (0, auth_1.default)(), tenantGuard_1.default, publishing_controller_1.publishingController.getPostByPlatform);
router.post("/:jobId/platform/:platform/retry", (0, auth_1.default)(), tenantGuard_1.default, publishing_controller_1.publishingController.retryFailedPost);
exports.PublishingRoutes = router;
