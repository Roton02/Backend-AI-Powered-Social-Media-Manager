import { SocialPlatformAdapter, SocialPlatform, PostContent, PublishResult, MessageFilters, NormalizedMessage } from "./social-adapter.interface";
import prisma from "../../../../shared/prisma";
import axios from "axios";

export class InstagramAdapter implements SocialPlatformAdapter {
  getPlatformId(): SocialPlatform {
    return SocialPlatform.INSTAGRAM;
  }

  private async getAccessToken(workspaceId: string): Promise<string> {
    const account = await prisma.socialAccount.findFirst({
      where: {
        workspaceId,
        platform: "INSTAGRAM",
      },
    });

    if (!account || !account.accessToken) {
      throw new Error("Instagram account not connected for this workspace");
    }

    return account.accessToken;
  }

  async publishPost(workspaceId: string, content: PostContent): Promise<PublishResult> {
    try {
      const token = await this.getAccessToken(workspaceId);

      // Instagram requires a two-step process: Create a media container, then publish it.
      // For the MVP, we target the Instagram Graph API
      const account = await prisma.socialAccount.findFirst({
        where: { workspaceId, platform: "INSTAGRAM" },
      });

      if (!account) throw new Error("Instagram account not found");

      // Step 1: Create Media Container
      const containerResponse = await axios.post(`https://graph.facebook.com/v18.0/${account.accessToken}/media`, {
        image: content.mediaUrls[0], // IG requires media
        caption: content.text,
        access_token: token,
      });

      const creationId = containerResponse.data.id;

      // Step 2: Publish the container
      const publishResponse = await axios.post(`https://graph.facebook.com/v18.0/me/media_publish`, {
        creation_id: creationId,
        access_token: token,
      });

      return {
        success: true,
        platformPostId: publishResponse.data.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async fetchMessages(workspaceId: string, filters: MessageFilters): Promise<NormalizedMessage[]> {
    try {
      const token = await this.getAccessToken(workspaceId);

      // Instagram DM API via Messenger Platform
      const response = await axios.get(`https://graph.facebook.com/v18.0/me/conversations`, {
        params: {
          fields: "messages{message,from,created_time}",
          access_token: token,
        },
      });

      return (response.data.data || []).flatMap((conv: any) =>
        (conv.messages?.data || []).map((msg: any) => ({
          externalId: conv.id,
          platform: SocialPlatform.INSTAGRAM,
          senderId: msg.from?.id || "unknown",
          text: msg.message,
          mediaUrls: [],
          timestamp: new Date(msg.created_time),
        }))
      );
    } catch (error: any) {
      console.error("Instagram fetchMessages error:", error);
      return [];
    }
  }

  async sendMessage(workspaceId: string, externalId: string, text: string): Promise<{ success: boolean; error?: string }> {
    try {
      const token = await this.getAccessToken(workspaceId);

      await axios.post(`https://graph.facebook.com/v18.0/me/messages`, {
        recipient: { id: externalId },
        message: { text: text },
        access_token: token,
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }
}
