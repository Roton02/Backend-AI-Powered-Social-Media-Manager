import express from "express";
import { socialController } from "../controllers/social.controller";
import { oauthController } from "../controllers/oauth/oauth.controller";
import { socialWebhookController } from "../controllers/social.webhook.controller";
import auth from "../../../middlewares/auth";
import tenantGuard from "../../../middlewares/tenantGuard";
import { UserRole } from "@prisma/client";

const router = express.Router();

// Admin: all connected social accounts across workspaces
router.get("/accounts/admin/all", auth(UserRole.Admin), socialController.adminListAccounts);

// OAuth Flow
router.get("/auth/:platform", auth(), tenantGuard, oauthController.getAuthUrl);
router.get("/callback/:platform", oauthController.handleCallback);

router.get("/selection", auth(), tenantGuard, oauthController.getSelection);
router.post("/selection", auth(), tenantGuard, oauthController.confirmSelection);

router.get("/conversations", auth(), tenantGuard, socialController.getConversations);
router.patch("/conversations/:id/takeover", auth(), tenantGuard, socialController.setTakeover);
router.get("/conversations/:id/messages", auth(), tenantGuard, socialController.getConversationMessages);
router.patch("/conversations/:id/read", auth(), tenantGuard, socialController.markConversationRead);
router.post("/conversations/:id/reply", auth(), tenantGuard, socialController.replyInConversation);

// Unified inbox
router.get("/inbox", auth(), tenantGuard, socialController.getInboxMessages);
router.get("/inbox/accounts", auth(), tenantGuard, socialController.getInboxAccounts);
router.post("/inbox/sync", auth(), tenantGuard, socialController.syncInbox);
router.patch("/inbox/:id/read", auth(), tenantGuard, socialController.markMessageAsRead);
router.post("/inbox/:id/reply", auth(), tenantGuard, socialController.replyToMessage);

// Unified comments
router.get("/comments", auth(), tenantGuard, socialController.getComments);
router.post("/comments/:id/reply", auth(), tenantGuard, socialController.replyToComment);

// Social accounts (real connections happen via /auth/:platform OAuth)
router.get("/accounts", auth(), tenantGuard, socialController.getAccounts);
router.delete("/accounts/:id", auth(), tenantGuard, socialController.disconnectAccount);

// Inbound webhooks from platforms (no auth)
router.get("/webhooks/:platform", socialWebhookController.verify);
router.post("/webhooks/:platform", socialWebhookController.handleWebhook);

export default router;
