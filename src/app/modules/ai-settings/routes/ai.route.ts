import express from "express";
import { aiSettingsController } from "../controllers/ai.controller";
import auth from "../../../middlewares/auth";
import tenantGuard from "../../../middlewares/tenantGuard";

const router = express.Router();

router.get("/settings", auth(), tenantGuard, aiSettingsController.getAiSettings);
router.get("/knowledge-base", auth(), tenantGuard, aiSettingsController.getKnowledgeBase);
router.post("/knowledge-base", auth(), tenantGuard, aiSettingsController.updateKnowledgeBase);
router.patch("/knowledge-base/:id", auth(), tenantGuard, aiSettingsController.editKnowledgeItem);
router.delete("/knowledge-base/:id", auth(), tenantGuard, aiSettingsController.deleteKnowledgeItem);

export const aiSettingsRoutes = router;
