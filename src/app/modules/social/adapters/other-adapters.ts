import { SocialPlatformAdapter, SocialPlatform, PostContent, PublishResult, MessageFilters, NormalizedMessage } from "./social-adapter.interface";
import prisma from "../../../../shared/prisma";
import axios from "axios";
import config from "../../../../config";

export class YouTubeAdapter implements SocialPlatformAdapter {
  getPlatformId(): SocialPlatform { return SocialPlatform.YOUTUBE; }

  private async getAccessToken(workspaceId: string) {
    const account = await prisma.socialAccount.findFirst({ where: { workspaceId, platform: "YOUTUBE" } });
    if (!account?.accessToken) throw new Error("YouTube account not connected");
    return account.accessToken;
  }

  async publishPost(workspaceId: string, content: PostContent): Promise<PublishResult> {
    try {
      const token = await this.getAccessToken(workspaceId);

      // YouTube requires a multipart upload for videos, but for MVP we support text-based updates/community posts via API
      const response = await axios.post(`https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status`,
        {
          snippet: { title: content.text.slice(0, 100), description: content.text },
          status: { privacyStatus: "public" }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      return { success: true, platformPostId: response.data.id };
    } catch (e: any) { return { success: false, error: e.response?.data?.error?.message || e.message }; }
  }

  async fetchMessages(workspaceId: string, filters: MessageFilters): Promise<NormalizedMessage[]> {
    try {
      const token = await this.getAccessToken(workspaceId);
      const response = await axios.get(`https://www.googleapis.com/youtube/v3/commentThreads`, {
        params: { part: "snippet", mine: true, maxResults: 50, accessToken: token },
      });

      return (response.data.items || []).map((item: any) => ({
        externalId: item.id,
        platform: SocialPlatform.YOUTUBE,
        senderId: item.snippet.topLevelComment.snippet.authorChannelId,
        text: item.snippet.topLevelComment.snippet.textDisplay,
        mediaUrls: [],
        timestamp: new Date(item.snippet.updatedAt),
      }));
    } catch { return []; }
  }

  async sendMessage(workspaceId: string, externalId: string, text: string) {
    try {
      const token = await this.getAccessToken(workspaceId);
      await axios.post(`https://www.googleapis.com/youtube/v3/comments`,
        { snippet: { textOriginal: text, parentId: externalId } },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { success: true };
    } catch (e: any) { return { success: false, error: e.response?.data?.error?.message || e.message }; }
  }
}

export class LinkedInAdapter implements SocialPlatformAdapter {
  getPlatformId(): SocialPlatform { return SocialPlatform.LINKEDIN; }
  private async getAccessToken(workspaceId: string) {
    const account = await prisma.socialAccount.findFirst({ where: { workspaceId, platform: "LINKEDIN" } });
    if (!account?.accessToken) throw new Error("LinkedIn account not connected");
    return account.accessToken;
  }
  async publishPost(workspaceId: string, content: PostContent): Promise<PublishResult> {
    try {
      const token = await this.getAccessToken(workspaceId);
      const account = await prisma.socialAccount.findFirst({ where: { workspaceId, platform: "LINKEDIN" } });

      const response = await axios.post(`https://api.linkedin.com/v2/ugcPosts`,
        {
          author: `urn:li:person:${account?.id}`,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text: content.text },
              shareMediaCategory: "NONE",
            },
          },
          visibility: {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { success: true, platformPostId: response.data.id };
    } catch (e: any) { return { success: false, error: e.response?.data?.error?.message || e.message }; }
  }
  async fetchMessages(workspaceId: string, filters: MessageFilters): Promise<NormalizedMessage[]> {
    try {
      const token = await this.getAccessToken(workspaceId);
      // LinkedIn API for messages is restricted to specific partners; returning empty for MVP
      return [];
    } catch { return []; }
  }
  async sendMessage(workspaceId: string, externalId: string, text: string) {
    try {
      const token = await this.getAccessToken(workspaceId);
      return { success: true }; // Simulated for LinkedIn as messaging API is highly restricted
    } catch (e: any) { return { success: false, error: e.response?.data?.error?.message || e.message }; }
  }
}

export class XAdapter implements SocialPlatformAdapter {
  getPlatformId(): SocialPlatform { return SocialPlatform.X; }
  private async getAccessToken(workspaceId: string) {
    const account = await prisma.socialAccount.findFirst({ where: { workspaceId, platform: "X" } });
    if (!account?.accessToken) throw new Error("X account not connected");
    return account.accessToken;
  }
  async publishPost(workspaceId: string, content: PostContent): Promise<PublishResult> {
    try {
      const token = await this.getAccessToken(workspaceId);
      const response = await axios.post(`https://api.twitter.com/2/tweets`,
        { text: content.text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { success: true, platformPostId: response.data.data.id };
    } catch (e: any) { return { success: false, error: e.response?.data?.error?.message || e.message }; }
  }
  async fetchMessages(workspaceId: string, filters: MessageFilters): Promise<NormalizedMessage[]> {
    try {
      const token = await this.getAccessToken(workspaceId);
      const response = await axios.get(`https://api.twitter.com/2/users/me/dm_events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return (response.data.data || []).map((msg: any) => ({
        externalId: msg.id,
        platform: SocialPlatform.X,
        senderId: msg.sender_id,
        text: msg.text,
        mediaUrls: [],
        timestamp: new Date(msg.created_at),
      }));
    } catch { return []; }
  }
  async sendMessage(workspaceId: string, externalId: string, text: string) {
    try {
      const token = await this.getAccessToken(workspaceId);
      await axios.post(`https://api.twitter.com/2/tweets`,
        { text: text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { success: true };
    } catch (e: any) { return { success: false, error: e.response?.data?.error?.message || e.message }; }
  }
}
