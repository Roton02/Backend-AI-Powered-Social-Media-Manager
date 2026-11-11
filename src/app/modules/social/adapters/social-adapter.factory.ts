import { SocialPlatformAdapter, SocialPlatform } from "./social-adapter.interface";
import { FacebookAdapter } from "./facebook.adapter";
import { InstagramAdapter } from "./instagram.adapter";
import { TikTokAdapter } from "./tiktok.adapter";
import { YouTubeAdapter, LinkedInAdapter, XAdapter } from "./other-adapters";

export class SocialAdapterFactory {
  private static adapters: Map<SocialPlatform, SocialPlatformAdapter> = new Map();

  static getAdapter(platform: SocialPlatform): SocialPlatformAdapter {
    if (this.adapters.has(platform)) {
      return this.adapters.get(platform)!;
    }

    let adapter: SocialPlatformAdapter;

    switch (platform) {
      case SocialPlatform.FACEBOOK:
        adapter = new FacebookAdapter();
        break;
      case SocialPlatform.INSTAGRAM:
        adapter = new InstagramAdapter();
        break;
      case SocialPlatform.TIKTOK:
        adapter = new TikTokAdapter();
        break;
      case SocialPlatform.YOUTUBE:
        adapter = new YouTubeAdapter();
        break;
      case SocialPlatform.LINKEDIN:
        adapter = new LinkedInAdapter();
        break;
      case SocialPlatform.X:
        adapter = new XAdapter();
        break;
      default:
        throw new Error(`Unsupported social platform: ${platform}`);
    }

    this.adapters.set(platform, adapter);
    return adapter;
  }
}
