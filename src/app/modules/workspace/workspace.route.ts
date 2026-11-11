import express from "express";
import { workspaceController } from "./workspace.controller";
import auth from "../../middlewares/auth";
import tenantGuard from "../../middlewares/tenantGuard";
import { UserRole } from "@prisma/client";

const router = express.Router();

// Admin: full workspace directory
router.get("/admin/all", auth(UserRole.Admin), workspaceController.adminListWorkspaces);

router.post("/", auth(), workspaceController.createWorkspace);
router.get("/my", auth(), workspaceController.getMyWorkspace);
router.get("/stats", auth(), tenantGuard, workspaceController.getStats);
router.get("/analytics", auth(), tenantGuard, workspaceController.getAnalytics);
router.get("/", auth(), tenantGuard, workspaceController.getWorkspace);
router.patch("/", auth(), tenantGuard, workspaceController.updateWorkspace);

export default router;
