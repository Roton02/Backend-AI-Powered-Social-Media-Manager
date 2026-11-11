"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const workspace_controller_1 = require("./workspace.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const tenantGuard_1 = __importDefault(require("../../middlewares/tenantGuard"));
const client_1 = require("@prisma/client");
const router = express_1.default.Router();
// Admin: full workspace directory
router.get("/admin/all", (0, auth_1.default)(client_1.UserRole.Admin), workspace_controller_1.workspaceController.adminListWorkspaces);
router.post("/", (0, auth_1.default)(), workspace_controller_1.workspaceController.createWorkspace);
router.get("/my", (0, auth_1.default)(), workspace_controller_1.workspaceController.getMyWorkspace);
router.get("/stats", (0, auth_1.default)(), tenantGuard_1.default, workspace_controller_1.workspaceController.getStats);
router.get("/analytics", (0, auth_1.default)(), tenantGuard_1.default, workspace_controller_1.workspaceController.getAnalytics);
router.get("/", (0, auth_1.default)(), tenantGuard_1.default, workspace_controller_1.workspaceController.getWorkspace);
router.patch("/", (0, auth_1.default)(), tenantGuard_1.default, workspace_controller_1.workspaceController.updateWorkspace);
exports.default = router;
