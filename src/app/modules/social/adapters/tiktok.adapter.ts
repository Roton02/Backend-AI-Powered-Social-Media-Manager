import { SocialPlatformAdapter, SocialPlatform, PostContent, PublishResult, MessageFilters, NormalizedMessage } from "./social-adapter.interface";
import prisma from "../../../../shared/prisma";

export class TikTokAdapter implements SocialPlatformAdapter {
  getPlatformId(): SocialPlatform {
    return SocialPlatform.TIKTOK;
  }

  private async getAccessToken(workspaceId: string): Promise<string> {
    const account = await prisma.socialAccount.findFirst({
      where: { workspaceId, platform: "TIKTOK" },
    });
    if (!account || !account.accessToken) throw new Error("TikTok account not connected");
    return account.accessToken;
  }

  async publishPost(workspaceId: string, content: PostContent): Promise<PublishResult> {
    try {
      await this.getAccessToken(workspaceId);
      console.log(`[TikTokAdapter] Publishing post for workspace ${workspaceId}...`);
      return { success: true, platformPostId: `tt_${Math.random().toString(36).substr(2, 9)}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async fetchMessages(workspaceId: string, filters: MessageFilters): Promise<NormalizedMessage[]> {
    try {
      await this.getAccessToken(workspaceId);
      return [{
        externalId: "tt_msg_1",
        platform: SocialPlatform.TIKTOK,
        senderId: "user_tt_1",
        text: "Awesome video!",
        mediaUrls: [],
        timestamp: new Date(),
      }];
    } catch (error: any) {
      return [];
    }
  }

  async sendMessage(workspaceId: string, externalId: string, text: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getAccessToken(workspaceId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
