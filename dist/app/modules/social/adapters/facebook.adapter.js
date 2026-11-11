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
exports.FacebookAdapter = void 0;
const social_adapter_interface_1 = require("./social-adapter.interface");
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const axios_1 = __importDefault(require("axios"));
class FacebookAdapter {
    getPlatformId() {
        return social_adapter_interface_1.SocialPlatform.FACEBOOK;
    }
    getAccessToken(workspaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = yield prisma_1.default.socialAccount.findFirst({
                where: {
                    workspaceId,
                    platform: "FACEBOOK",
                },
            });
            if (!account || !account.accessToken) {
                throw new Error("Facebook account not connected for this workspace");
            }
            return account.accessToken;
        });
    }
    publishPost(workspaceId, content) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const token = yield this.getAccessToken(workspaceId);
                // Real Facebook Graph API Call
                const response = yield axios_1.default.post(`https://graph.facebook.com/me/feed`, {
                    message: content.text,
                    access_token: token,
                });
                return {
                    success: true,
                    platformPostId: response.data.id,
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: ((_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || error.message,
                };
            }
        });
    }
    fetchMessages(workspaceId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const token = yield this.getAccessToken(workspaceId);
                // Real Facebook Messenger / Page API call
                // Note: In a real scenario, we'd fetch the page ID first
                const account = yield prisma_1.default.socialAccount.findFirst({
                    where: { workspaceId, platform: "FACEBOOK" },
                });
                const response = yield axios_1.default.get(`https://graph.facebook.com/v18.0/me/conversations`, {
                    params: {
                        fields: "messages{message,from,created_time}",
                        access_token: token,
                    },
                });
                return (response.data.data || []).flatMap((conv) => {
                    var _a;
                    return (((_a = conv.messages) === null || _a === void 0 ? void 0 : _a.data) || []).map((msg) => {
                        var _a;
                        return ({
                            externalId: conv.id,
                            platform: social_adapter_interface_1.SocialPlatform.FACEBOOK,
                            senderId: ((_a = msg.from) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                            text: msg.message,
                            mediaUrls: [],
                            timestamp: new Date(msg.created_time),
                        });
                    });
                });
            }
            catch (error) {
                console.error("Facebook fetchMessages error:", error);
                return [];
            }
        });
    }
    sendMessage(workspaceId, externalId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const token = yield this.getAccessToken(workspaceId);
                // Real Facebook Messenger API Call
                yield axios_1.default.post(`https://graph.facebook.com/v18.0/me/messages`, {
                    recipient: { id: externalId },
                    message: { text: text },
                    access_token: token,
                });
                return { success: true };
            }
            catch (error) {
                return { success: false, error: ((_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || error.message };
            }
        });
    }
}
exports.FacebookAdapter = FacebookAdapter;
