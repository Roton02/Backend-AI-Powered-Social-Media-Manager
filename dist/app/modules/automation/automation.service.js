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
exports.automationService = exports.AutomationService = void 0;
const prisma_1 = __importDefault(require("../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const http_status_1 = __importDefault(require("http-status"));
const publishing_service_1 = require("../publishing/publishing.service");
const social_adapter_factory_1 = require("../social/adapters/social-adapter.factory");
class AutomationService {
    /**
     * Triggers an outbound webhook to the workspace's configured n8n URL.
     * This is designed to be fire-and-forget to avoid blocking business logic.
     */
    triggerEvent(workspaceId, eventType, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const workspace = yield prisma_1.default.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { settings: true },
                });
                if (!workspace || !workspace.settings)
                    return;
                const settings = workspace.settings;
                const webhookUrl = settings.n8n_webhook_url;
                if (!webhookUrl)
                    return;
                const payload = {
                    event: eventType,
                    workspaceId: workspaceId,
                    timestamp: new Date().toISOString(),
                    data: data,
                };
                // Use native fetch for outbound requests (Node 18+)
                fetch(webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }).catch((err) => {
                    console.error(`[AutomationService] Webhook delivery failed for ${workspaceId}:`, err.message);
                });
            }
            catch (error) {
                console.error(`[AutomationService] Error triggering event ${eventType}:`, error);
            }
        });
    }
    /**
     * Handles inbound automation requests from n8n.
     */
    executeAction(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const { workspaceId, action, params, signature } = payload;
            const workspace = yield prisma_1.default.workspace.findUnique({
                where: { id: workspaceId },
                select: { settings: true },
            });
            if (!workspace || !workspace.settings) {
                throw new ApiErrors_1.default(http_status_1.default.UNAUTHORIZED, "Workspace not found or misconfigured");
            }
            const settings = workspace.settings;
            const secret = settings.automation_secret;
            if (!secret) {
                throw new ApiErrors_1.default(http_status_1.default.UNAUTHORIZED, "Automation secret not configured for this workspace");
            }
            // In a real production scenario, we would verify the HMAC signature here.
            // For this implementation, we'll compare the secret if passed as a simple token,
            // or implement a basic signature check.
            if (signature !== secret) {
                throw new ApiErrors_1.default(http_status_1.default.UNAUTHORIZED, "Invalid automation signature");
            }
            // Action Dispatcher
            switch (action) {
                case "PUBLISH_POST": {
                    const ws = yield prisma_1.default.workspace.findUnique({
                        where: { id: workspaceId },
                        select: { ownerId: true },
                    });
                    const result = yield publishing_service_1.publishingService.createPost(workspaceId, (ws === null || ws === void 0 ? void 0 : ws.ownerId) || "", params);
                    return { success: true, message: "Post publishing triggered", data: result };
                }
                case "SEND_MESSAGE": {
                    const { platform, externalId, text } = params || {};
                    if (!platform || !externalId || !text) {
                        throw new ApiErrors_1.default(http_status_1.default.BAD_REQUEST, "SEND_MESSAGE requires platform, externalId, and text");
                    }
                    const adapter = social_adapter_factory_1.SocialAdapterFactory.getAdapter(platform);
                    const result = yield adapter.sendMessage(workspaceId, externalId, text);
                    return {
                        success: result.success,
                        message: result.success ? "Message sent" : result.error || "Message failed",
                    };
                }
                default:
                    throw new ApiErrors_1.default(http_status_1.default.BAD_REQUEST, `Unsupported action: ${action}`);
            }
        });
    }
}
exports.AutomationService = AutomationService;
exports.automationService = new AutomationService();
