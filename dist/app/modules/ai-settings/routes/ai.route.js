"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiSettingsRoutes = void 0;
const express_1 = __importDefault(require("express"));
const ai_controller_1 = require("../controllers/ai.controller");
const auth_1 = __importDefault(require("../../../middlewares/auth"));
const tenantGuard_1 = __importDefault(require("../../../middlewares/tenantGuard"));
const router = express_1.default.Router();
router.get("/settings", (0, auth_1.default)(), tenantGuard_1.default, ai_controller_1.aiSettingsController.getAiSettings);
router.get("/knowledge-base", (0, auth_1.default)(), tenantGuard_1.default, ai_controller_1.aiSettingsController.getKnowledgeBase);
router.post("/knowledge-base", (0, auth_1.default)(), tenantGuard_1.default, ai_controller_1.aiSettingsController.updateKnowledgeBase);
router.patch("/knowledge-base/:id", (0, auth_1.default)(), tenantGuard_1.default, ai_controller_1.aiSettingsController.editKnowledgeItem);
router.delete("/knowledge-base/:id", (0, auth_1.default)(), tenantGuard_1.default, ai_controller_1.aiSettingsController.deleteKnowledgeItem);
exports.aiSettingsRoutes = router;
