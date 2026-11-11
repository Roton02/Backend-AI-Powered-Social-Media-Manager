import { Router } from "express";
import { automationController } from "./automation.controller";
import tenantGuard from "../../middlewares/tenantGuard";

const router = Router();

router.post("/execute", tenantGuard, automationController.executeAction);

export default router;
