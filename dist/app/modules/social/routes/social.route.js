"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const social_controller_1 = require("../controllers/social.controller");
const oauth_controller_1 = require("../controllers/oauth/oauth.controller");
const social_webhook_controller_1 = require("../controllers/social.webhook.controller");
const auth_1 = __importDefault(require("../../../middlewares/auth"));
const tenantGuard_1 = __importDefault(require("../../../middlewares/tenantGuard"));
const client_1 = require("@prisma/client");
const router = express_1.default.Router();
// Admin: all connected social accounts across workspaces
router.get("/accounts/admin/all", (0, auth_1.default)(client_1.UserRole.Admin), social_controller_1.socialController.adminListAccounts);
// OAuth Flow
router.get("/auth/:platform", (0, auth_1.default)(), tenantGuard_1.default, oauth_controller_1.oauthController.getAuthUrl);
router.get("/callback/:platform", oauth_controller_1.oauthController.handleCallback);
router.get("/selection", (0, auth_1.default)(), tenantGuard_1.default, oauth_controller_1.oauthController.getSelection);
router.post("/selection", (0, auth_1.default)(), tenantGuard_1.default, oauth_controller_1.oauthController.confirmSelection);
router.get("/conversations", (0, auth_1.default)(), tenantGuard_1.default, social_controller_1.socialController.getConversations);
router.patch("/conversations/:id/takeover", (0, auth_1.default)(), tenantGuard_1.default, social_controller_1.socialController.setTakeover);
// Unified inbox
router.get("/inbox", (0, auth_1.default)(), tenantGuard_1.default, social_controller_1.socialController.getInboxMessages);
router.patch("/inbox/:id/read", (0, auth_1.default)(), tenantGuard_1.default, social_controller_1.socialController.markMessageAsRead);
router.post("/inbox/:id/reply", (0, auth_1.default)(), tenantGuard_1.default, social_controller_1.socialController.replyToMessage);
// Unified comments
router.get("/comments", (0, auth_1.default)(), tenantGuard_1.default, social_controller_1.socialController.getComments);
router.post("/comments/:id/reply", (0, auth_1.default)(), tenantGuard_1.default, social_controller_1.socialController.replyToComment);
// Social accounts (real connections happen via /auth/:platform OAuth)
router.get("/accounts", (0, auth_1.default)(), tenantGuard_1.default, social_controller_1.socialController.getAccounts);
router.delete("/accounts/:id", (0, auth_1.default)(), tenantGuard_1.default, social_controller_1.socialController.disconnectAccount);
// Inbound webhooks from platforms (no auth)
router.get("/webhooks/:platform", social_webhook_controller_1.socialWebhookController.verify);
router.post("/webhooks/:platform", social_webhook_controller_1.socialWebhookController.handleWebhook);
exports.default = router;
