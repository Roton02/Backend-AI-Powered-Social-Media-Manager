"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialAdapterFactory = void 0;
const social_adapter_interface_1 = require("./social-adapter.interface");
const facebook_adapter_1 = require("./facebook.adapter");
const instagram_adapter_1 = require("./instagram.adapter");
const tiktok_adapter_1 = require("./tiktok.adapter");
const other_adapters_1 = require("./other-adapters");
class SocialAdapterFactory {
    static getAdapter(platform) {
        if (this.adapters.has(platform)) {
            return this.adapters.get(platform);
        }
        let adapter;
        switch (platform) {
            case social_adapter_interface_1.SocialPlatform.FACEBOOK:
                adapter = new facebook_adapter_1.FacebookAdapter();
                break;
            case social_adapter_interface_1.SocialPlatform.INSTAGRAM:
                adapter = new instagram_adapter_1.InstagramAdapter();
                break;
            case social_adapter_interface_1.SocialPlatform.TIKTOK:
                adapter = new tiktok_adapter_1.TikTokAdapter();
                break;
            case social_adapter_interface_1.SocialPlatform.YOUTUBE:
                adapter = new other_adapters_1.YouTubeAdapter();
                break;
            case social_adapter_interface_1.SocialPlatform.LINKEDIN:
                adapter = new other_adapters_1.LinkedInAdapter();
                break;
            case social_adapter_interface_1.SocialPlatform.X:
                adapter = new other_adapters_1.XAdapter();
                break;
            default:
                throw new Error(`Unsupported social platform: ${platform}`);
        }
        this.adapters.set(platform, adapter);
        return adapter;
    }
}
exports.SocialAdapterFactory = SocialAdapterFactory;
SocialAdapterFactory.adapters = new Map();
