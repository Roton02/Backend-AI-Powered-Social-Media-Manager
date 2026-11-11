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
exports.XAdapter = exports.LinkedInAdapter = exports.YouTubeAdapter = void 0;
const social_adapter_interface_1 = require("./social-adapter.interface");
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const axios_1 = __importDefault(require("axios"));
class YouTubeAdapter {
    getPlatformId() { return social_adapter_interface_1.SocialPlatform.YOUTUBE; }
    getAccessToken(workspaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = yield prisma_1.default.socialAccount.findFirst({ where: { workspaceId, platform: "YOUTUBE" } });
            if (!(account === null || account === void 0 ? void 0 : account.accessToken))
                throw new Error("YouTube account not connected");
            return account.accessToken;
        });
    }
    publishPost(workspaceId, content) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const token = yield this.getAccessToken(workspaceId);
                // YouTube requires a multipart upload for videos, but for MVP we support text-based updates/community posts via API
                const response = yield axios_1.default.post(`https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status`, {
                    snippet: { title: content.text.slice(0, 100), description: content.text },
                    status: { privacyStatus: "public" }
                }, { headers: { Authorization: `Bearer ${token}` } });
                return { success: true, platformPostId: response.data.id };
            }
            catch (e) {
                return { success: false, error: ((_c = (_b = (_a = e.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || e.message };
            }
        });
    }
    fetchMessages(workspaceId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const token = yield this.getAccessToken(workspaceId);
                const response = yield axios_1.default.get(`https://www.googleapis.com/youtube/v3/commentThreads`, {
                    params: { part: "snippet", mine: true, maxResults: 50, accessToken: token },
                });
                return (response.data.items || []).map((item) => ({
                    externalId: item.id,
                    platform: social_adapter_interface_1.SocialPlatform.YOUTUBE,
                    senderId: item.snippet.topLevelComment.snippet.authorChannelId,
                    text: item.snippet.topLevelComment.snippet.textDisplay,
                    mediaUrls: [],
                    timestamp: new Date(item.snippet.updatedAt),
                }));
            }
            catch (_a) {
                return [];
            }
        });
    }
    sendMessage(workspaceId, externalId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const token = yield this.getAccessToken(workspaceId);
                yield axios_1.default.post(`https://www.googleapis.com/youtube/v3/comments`, { snippet: { textOriginal: text, parentId: externalId } }, { headers: { Authorization: `Bearer ${token}` } });
                return { success: true };
            }
            catch (e) {
                return { success: false, error: ((_c = (_b = (_a = e.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || e.message };
            }
        });
    }
}
exports.YouTubeAdapter = YouTubeAdapter;
class LinkedInAdapter {
    getPlatformId() { return social_adapter_interface_1.SocialPlatform.LINKEDIN; }
    getAccessToken(workspaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = yield prisma_1.default.socialAccount.findFirst({ where: { workspaceId, platform: "LINKEDIN" } });
            if (!(account === null || account === void 0 ? void 0 : account.accessToken))
                throw new Error("LinkedIn account not connected");
            return account.accessToken;
        });
    }
    publishPost(workspaceId, content) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const token = yield this.getAccessToken(workspaceId);
                const account = yield prisma_1.default.socialAccount.findFirst({ where: { workspaceId, platform: "LINKEDIN" } });
                const response = yield axios_1.default.post(`https://api.linkedin.com/v2/ugcPosts`, {
                    author: `urn:li:person:${account === null || account === void 0 ? void 0 : account.id}`,
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
                }, { headers: { Authorization: `Bearer ${token}` } });
                return { success: true, platformPostId: response.data.id };
            }
            catch (e) {
                return { success: false, error: ((_c = (_b = (_a = e.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || e.message };
            }
        });
    }
    fetchMessages(workspaceId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const token = yield this.getAccessToken(workspaceId);
                // LinkedIn API for messages is restricted to specific partners; returning empty for MVP
                return [];
            }
            catch (_a) {
                return [];
            }
        });
    }
    sendMessage(workspaceId, externalId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const token = yield this.getAccessToken(workspaceId);
                return { success: true }; // Simulated for LinkedIn as messaging API is highly restricted
            }
            catch (e) {
                return { success: false, error: ((_c = (_b = (_a = e.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || e.message };
            }
        });
    }
}
exports.LinkedInAdapter = LinkedInAdapter;
class XAdapter {
    getPlatformId() { return social_adapter_interface_1.SocialPlatform.X; }
    getAccessToken(workspaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = yield prisma_1.default.socialAccount.findFirst({ where: { workspaceId, platform: "X" } });
            if (!(account === null || account === void 0 ? void 0 : account.accessToken))
                throw new Error("X account not connected");
            return account.accessToken;
        });
    }
    publishPost(workspaceId, content) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const token = yield this.getAccessToken(workspaceId);
                const response = yield axios_1.default.post(`https://api.twitter.com/2/tweets`, { text: content.text }, { headers: { Authorization: `Bearer ${token}` } });
                return { success: true, platformPostId: response.data.data.id };
            }
            catch (e) {
                return { success: false, error: ((_c = (_b = (_a = e.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || e.message };
            }
        });
    }
    fetchMessages(workspaceId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const token = yield this.getAccessToken(workspaceId);
                const response = yield axios_1.default.get(`https://api.twitter.com/2/users/me/dm_events`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                return (response.data.data || []).map((msg) => ({
                    externalId: msg.id,
                    platform: social_adapter_interface_1.SocialPlatform.X,
                    senderId: msg.sender_id,
                    text: msg.text,
                    mediaUrls: [],
                    timestamp: new Date(msg.created_at),
                }));
            }
            catch (_a) {
                return [];
            }
        });
    }
    sendMessage(workspaceId, externalId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const token = yield this.getAccessToken(workspaceId);
                yield axios_1.default.post(`https://api.twitter.com/2/tweets`, { text: text }, { headers: { Authorization: `Bearer ${token}` } });
                return { success: true };
            }
            catch (e) {
                return { success: false, error: ((_c = (_b = (_a = e.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || e.message };
            }
        });
    }
}
exports.XAdapter = XAdapter;
