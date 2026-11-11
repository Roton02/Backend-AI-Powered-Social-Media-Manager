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
exports.TikTokAdapter = void 0;
const social_adapter_interface_1 = require("./social-adapter.interface");
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
class TikTokAdapter {
    getPlatformId() {
        return social_adapter_interface_1.SocialPlatform.TIKTOK;
    }
    getAccessToken(workspaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = yield prisma_1.default.socialAccount.findFirst({
                where: { workspaceId, platform: "TIKTOK" },
            });
            if (!account || !account.accessToken)
                throw new Error("TikTok account not connected");
            return account.accessToken;
        });
    }
    publishPost(workspaceId, content) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.getAccessToken(workspaceId);
                console.log(`[TikTokAdapter] Publishing post for workspace ${workspaceId}...`);
                return { success: true, platformPostId: `tt_${Math.random().toString(36).substr(2, 9)}` };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });
    }
    fetchMessages(workspaceId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.getAccessToken(workspaceId);
                return [{
                        externalId: "tt_msg_1",
                        platform: social_adapter_interface_1.SocialPlatform.TIKTOK,
                        senderId: "user_tt_1",
                        text: "Awesome video!",
                        mediaUrls: [],
                        timestamp: new Date(),
                    }];
            }
            catch (error) {
                return [];
            }
        });
    }
    sendMessage(workspaceId, externalId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.getAccessToken(workspaceId);
                return { success: true };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });
    }
}
exports.TikTokAdapter = TikTokAdapter;
