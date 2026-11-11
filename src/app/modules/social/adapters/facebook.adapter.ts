import { SocialPlatformAdapter, SocialPlatform, PostContent, PublishResult, MessageFilters, NormalizedMessage } from "./social-adapter.interface";
import prisma from "../../../../shared/prisma";
import axios from "axios";

export class FacebookAdapter implements SocialPlatformAdapter {
  getPlatformId(): SocialPlatform {
    return SocialPlatform.FACEBOOK;
  }

  private async getAccessToken(workspaceId: string): Promise<string> {
    const account = await prisma.socialAccount.findFirst({
      where: {
        workspaceId,
        platform: "FACEBOOK",
      },
    });

    if (!account || !account.accessToken) {
      throw new Error("Facebook account not connected for this workspace");
    }

    return account.accessToken;
  }

  async publishPost(workspaceId: string, content: PostContent): Promise<PublishResult> {
    try {
      const token = await this.getAccessToken(workspaceId);

      // Real Facebook Graph API Call
      const response = await axios.post(`https://graph.facebook.com/me/feed`, {
        message: content.text,
        access_token: token,
      });

      return {
        success: true,
        platformPostId: response.data.id,
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

      // Real Facebook Messenger / Page API call
      // Note: In a real scenario, we'd fetch the page ID first
      const account = await prisma.socialAccount.findFirst({
        where: { workspaceId, platform: "FACEBOOK" },
      });

      const response = await axios.get(`https://graph.facebook.com/v18.0/me/conversations`, {
        params: {
          fields: "messages{message,from,created_time}",
          access_token: token,
        },
      });

      return (response.data.data || []).flatMap((conv: any) =>
        (conv.messages?.data || []).map((msg: any) => ({
          externalId: conv.id,
          platform: SocialPlatform.FACEBOOK,
          senderId: msg.from?.id || "unknown",
          text: msg.message,
          mediaUrls: [],
          timestamp: new Date(msg.created_time),
        }))
      );
    } catch (error: any) {
      console.error("Facebook fetchMessages error:", error);
      return [];
    }
  }

  async sendMessage(workspaceId: string, externalId: string, text: string): Promise<{ success: boolean; error?: string }> {
    try {
      const token = await this.getAccessToken(workspaceId);

      // Real Facebook Messenger API Call
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
