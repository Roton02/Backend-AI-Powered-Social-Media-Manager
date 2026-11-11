import { SocialPlatform } from "@prisma/client";

export { SocialPlatform };

export interface PostContent {
  text: string;
  mediaUrls: string[];
  scheduledAt?: Date;
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  error?: string;
}

export interface MessageFilters {
  limit?: number;
  offset?: number;
  since?: Date;
}

export interface NormalizedMessage {
  externalId: string;
  platform: SocialPlatform;
  senderId: string;
  text: string;
  mediaUrls: string[];
  timestamp: Date;
}

export interface SocialPlatformAdapter {
  publishPost(workspaceId: string, content: PostContent): Promise<PublishResult>;
  fetchMessages(workspaceId: string, filters: MessageFilters): Promise<NormalizedMessage[]>;
  sendMessage(workspaceId: string, externalId: string, text: string): Promise<{ success: boolean; error?: string }>;
  getPlatformId(): SocialPlatform;
}
