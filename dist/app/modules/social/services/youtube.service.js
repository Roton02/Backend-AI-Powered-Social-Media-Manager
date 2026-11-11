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
exports.isVideoUrl = exports.youtubeCallback = exports.youtubeScopes = void 0;
exports.youtubeAuthUrl = youtubeAuthUrl;
exports.connectYoutube = connectYoutube;
exports.freshAccessToken = freshAccessToken;
exports.videoDetails = videoDetails;
exports.publishYoutube = publishYoutube;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../../errors/ApiErrors"));
const config_1 = __importDefault(require("../../../../config"));
const meta_service_1 = require("./meta.service");
// YouTube channel publishing via Google OAuth (YouTube Data API v3). Video uploads only.
exports.youtubeScopes = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
const youtubeCallback = () => `${config_1.default.app.backendUrl}/api/v1/social/callback/youtube`;
exports.youtubeCallback = youtubeCallback;
const tokenUrl = 'https://oauth2.googleapis.com/token';
const isVideoUrl = (url) => /\/video\/upload\//.test(url) || /\.mp4(\?|$)/i.test(url);
exports.isVideoUrl = isVideoUrl;
function youtubeAuthUrl(state) {
    // offline + consent so Google returns a refresh token (access tokens last about an hour).
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config_1.default.social.youtube_client_id, redirect_uri: (0, exports.youtubeCallback)(), response_type: 'code', scope: exports.youtubeScopes.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })}`;
}
/** Exchanges the code, finds the chosen channel and saves it with encrypted tokens. Throws 'NO_CHANNEL' if the Google account has no channel. */
function connectYoutube(code, workspaceId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const token = (yield axios_1.default.post(tokenUrl, new URLSearchParams({ code, client_id: config_1.default.social.youtube_client_id, client_secret: config_1.default.social.youtube_client_secret, redirect_uri: (0, exports.youtubeCallback)(), grant_type: 'authorization_code' }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data;
        const channel = (_a = (yield axios_1.default.get('https://www.googleapis.com/youtube/v3/channels', { params: { part: 'snippet', mine: true }, headers: { Authorization: `Bearer ${token.access_token}` }, timeout: 15000 })).data.items) === null || _a === void 0 ? void 0 : _a[0];
        if (!(channel === null || channel === void 0 ? void 0 : channel.id))
            throw new Error('NO_CHANNEL');
        const existing = yield prisma_1.default.socialAccount.findFirst({ where: { workspaceId, platform: 'YOUTUBE', externalAccountId: channel.id } });
        // Google only returns a refresh token on consent; keep the previous one if this reconnect did not include it.
        const refreshToken = token.refresh_token ? (0, meta_service_1.encryptToken)(token.refresh_token) : (existing === null || existing === void 0 ? void 0 : existing.refreshToken) || null;
        const capabilities = { publishing: String(token.scope || '').split(' ').includes(exports.youtubeScopes[0]) && Boolean(refreshToken), messaging: false, comments: false };
        const data = {
            workspaceId, platform: 'YOUTUBE', externalAccountId: channel.id, accountName: ((_b = channel.snippet) === null || _b === void 0 ? void 0 : _b.title) || 'YouTube channel',
            // tokenExpiry stays empty: the short-lived access token is refreshed before every upload.
            accessToken: (0, meta_service_1.encryptToken)(token.access_token), refreshToken, tokenExpiry: null,
            settings: { capabilities }, connectionStatus: capabilities.publishing ? 'CONNECTED' : 'LIMITED_ACCESS',
        };
        if (existing)
            yield prisma_1.default.socialAccount.update({ where: { id: existing.id }, data });
        else
            yield prisma_1.default.socialAccount.create({ data });
    });
}
function platformError(error, fallback) {
    var _a, _b, _c, _d, _e;
    const apiError = new ApiErrors_1.default(502, 'The platform could not complete this request. Check your connection and try again.');
    const body = (_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error;
    // Same shape as Meta errors so the worker can tell a definite rejection from an ambiguous failure. Never includes tokens.
    if (error === null || error === void 0 ? void 0 : error.response)
        apiError.metaError = { status: error.response.status, code: ((_d = (_c = body === null || body === void 0 ? void 0 : body.errors) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.reason) || (body === null || body === void 0 ? void 0 : body.status) || (typeof body === 'string' ? body : fallback.code), message: (body === null || body === void 0 ? void 0 : body.message) || ((_e = error.response.data) === null || _e === void 0 ? void 0 : _e.error_description) || fallback.message };
    console.error('YouTube request failed:', JSON.stringify(apiError.metaError || { network: (error === null || error === void 0 ? void 0 : error.code) || 'no response' }));
    return apiError;
}
function freshAccessToken(account) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!account.refreshToken)
            throw Object.assign(new ApiErrors_1.default(409, 'Reconnect this YouTube channel.'), { metaError: { status: 401, code: 'no_refresh_token', message: 'YouTube access expired. Reconnect the channel' } });
        try {
            return (yield axios_1.default.post(tokenUrl, new URLSearchParams({ client_id: config_1.default.social.youtube_client_id, client_secret: config_1.default.social.youtube_client_secret, refresh_token: (0, meta_service_1.decryptToken)(account.refreshToken), grant_type: 'refresh_token' }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data.access_token;
        }
        catch (error) {
            if (((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === 'invalid_grant') {
                yield prisma_1.default.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
                throw Object.assign(new ApiErrors_1.default(409, 'Reconnect this YouTube channel.'), { metaError: { status: 401, code: 'invalid_grant', message: 'YouTube access expired or was removed. Reconnect the channel' } });
            }
            throw platformError(error, { status: 502, code: 'token_refresh', message: 'Could not refresh YouTube access' });
        }
    });
}
// YouTube rejects < and > in titles/descriptions; titles are limited to 100 characters.
const clean = (text) => text.replace(/[<>]/g, '');
function videoDetails(content) {
    const firstLine = clean(content).split('\n').map(l => l.trim()).find(Boolean) || 'New video';
    return { title: firstLine.slice(0, 100), description: clean(content).slice(0, 5000) };
}
/** Uploads the video with a resumable upload and returns the YouTube video ID. */
function publishYoutube(account, content, videoUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const accessToken = yield freshAccessToken(account);
        const video = yield axios_1.default.get(videoUrl, { responseType: 'stream', timeout: 60000 });
        const length = Number(video.headers['content-length']);
        let uploadUrl;
        try {
            const init = yield axios_1.default.post('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { snippet: Object.assign(Object.assign({}, videoDetails(content)), { categoryId: '22' }), status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } }, { headers: Object.assign({ Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4' }, (length ? { 'X-Upload-Content-Length': String(length) } : {})), timeout: 30000 });
            uploadUrl = init.headers.location;
        }
        catch (error) {
            video.data.destroy();
            throw platformError(error, { status: 502, code: 'upload_init', message: 'YouTube did not accept the upload' });
        }
        try {
            const done = yield axios_1.default.put(uploadUrl, video.data, { headers: Object.assign({ 'Content-Type': 'video/mp4' }, (length ? { 'Content-Length': String(length) } : {})), maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 15 * 60 * 1000 });
            return { id: (_a = done.data) === null || _a === void 0 ? void 0 : _a.id };
        }
        catch (error) {
            throw platformError(error, { status: 502, code: 'upload', message: 'YouTube upload failed' });
        }
    });
}
