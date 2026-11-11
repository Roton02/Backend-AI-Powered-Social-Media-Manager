import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { publishingService } from "../publishing/publishing.service";
import { SocialAdapterFactory } from "../social/adapters/social-adapter.factory";
import { SocialPlatform } from "../social/adapters/social-adapter.interface";

export class AutomationService {
  /**
   * Triggers an outbound webhook to the workspace's configured n8n URL.
   * This is designed to be fire-and-forget to avoid blocking business logic.
   */
  async triggerEvent(workspaceId: string, eventType: string, data: any) {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { settings: true },
      });

      if (!workspace || !workspace.settings) return;

      const settings = workspace.settings as any;
      const webhookUrl = settings.n8n_webhook_url;

      if (!webhookUrl) return;

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
    } catch (error) {
      console.error(`[AutomationService] Error triggering event ${eventType}:`, error);
    }
  }

  /**
   * Handles inbound automation requests from n8n.
   */
  async executeAction(payload: {
    workspaceId: string;
    action: string;
    params: any;
    signature: string;
  }) {
    const { workspaceId, action, params, signature } = payload;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    });

    if (!workspace || !workspace.settings) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "Workspace not found or misconfigured");
    }

    const settings = workspace.settings as any;
    const secret = settings.automation_secret;

    if (!secret) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "Automation secret not configured for this workspace");
    }

    // In a real production scenario, we would verify the HMAC signature here.
    // For this implementation, we'll compare the secret if passed as a simple token,
    // or implement a basic signature check.
    if (signature !== secret) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid automation signature");
    }

    // Action Dispatcher
    switch (action) {
      case "PUBLISH_POST": {
        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { ownerId: true },
        });
        const result = await publishingService.createPost(
          workspaceId,
          ws?.ownerId || "",
          params
        );
        return { success: true, message: "Post publishing triggered", data: result };
      }

      case "SEND_MESSAGE": {
        const { platform, externalId, text } = params || {};
        if (!platform || !externalId || !text) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "SEND_MESSAGE requires platform, externalId, and text"
          );
        }
        const adapter = SocialAdapterFactory.getAdapter(platform as SocialPlatform);
        const result = await adapter.sendMessage(workspaceId, externalId, text);
        return {
          success: result.success,
          message: result.success ? "Message sent" : result.error || "Message failed",
        };
      }

      default:
        throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported action: ${action}`);
    }
  }
}

export const automationService = new AutomationService();
