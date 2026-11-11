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
exports.X_TEXT_LIMIT = exports.xCallback = exports.xScopes = void 0;
exports.pkcePair = pkcePair;
exports.xAuthUrl = xAuthUrl;
exports.connectX = connectX;
exports.publishX = publishX;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const config_1 = __importDefault(require("../../../../config"));
const refreshable_token_service_1 = require("./refreshable-token.service");
// X (Twitter) posting with OAuth 2.0 + PKCE. X API usage is billed per request (pay-per-use).
exports.xScopes = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'];
const xCallback = () => `${config_1.default.app.backendUrl}/api/v1/social/callback/x`;
exports.xCallback = xCallback;
exports.X_TEXT_LIMIT = 280;
const tokenUrl = 'https://api.x.com/2/oauth2/token';
function pkcePair() {
    const verifier = (0, crypto_1.randomBytes)(48).toString('base64url');
    return { verifier, challenge: (0, crypto_1.createHash)('sha256').update(verifier).digest('base64url') };
}
function xAuthUrl(state, challenge) {
    return `https://x.com/i/oauth2/authorize?${new URLSearchParams({ response_type: 'code', client_id: config_1.default.social.x_client_id, redirect_uri: (0, exports.xCallback)(), scope: exports.xScopes.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256' })}`;
}
// Confidential client: credentials go in a Basic header, never in the URL.
const tokenRequest = (body) => __awaiter(void 0, void 0, void 0, function* () {
    return (yield axios_1.default.post(tokenUrl, new URLSearchParams(body), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${config_1.default.social.x_client_id}:${config_1.default.social.x_client_secret}`).toString('base64') }, timeout: 15000,
    })).data;
});
/** Exchanges the code and saves the X profile with encrypted tokens. */
function connectX(code, verifier, workspaceId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const token = yield tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: (0, exports.xCallback)(), code_verifier: verifier });
        const me = (_a = (yield axios_1.default.get('https://api.x.com/2/users/me', { params: { 'user.fields': 'name,username' }, headers: { Authorization: `Bearer ${token.access_token}` }, timeout: 15000 })).data) === null || _a === void 0 ? void 0 : _a.data;
        if (!(me === null || me === void 0 ? void 0 : me.id))
            throw new Error('X profile unavailable');
        const granted = String(token.scope || '').split(/[\s,]+/);
        const capabilities = { publishing: ['tweet.write', 'media.write'].every(s => granted.includes(s)) && Boolean(token.refresh_token), messaging: false, comments: false };
        yield (0, refreshable_token_service_1.saveRefreshableAccount)(workspaceId, 'X', me.id, me.username ? `${me.name || me.username} (@${me.username})` : me.name || 'X profile', token, capabilities);
    });
}
const readError = (body) => { var _a, _b, _c, _d; return ({ code: body.title || body.type || ((_b = (_a = body.errors) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.code), message: body.detail || ((_d = (_c = body.errors) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) || body.title }); };
function xRequest(account, request) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            return (yield axios_1.default.request(Object.assign({ timeout: 30000 }, request))).data;
        }
        catch (error) {
            if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 401)
                yield prisma_1.default.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
            const failure = (0, refreshable_token_service_1.platformFailure)('X', error, readError);
            if (((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 402)
                failure.metaError.message = 'Your X developer account has no API credits. Add credits in the X developer console';
            throw failure;
        }
    });
}
/** Posts text with up to one image and returns the post ID. */
function publishX(account, content, imageUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const token = yield (0, refreshable_token_service_1.freshAccessToken)(account, 'X', refreshToken => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }));
        const headers = { Authorization: `Bearer ${token}` };
        let media;
        if (imageUrl) {
            let image;
            try {
                image = yield axios_1.default.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 5 * 1024 * 1024 });
            }
            catch (error) {
                // Nothing was sent to X yet, so a too-large image is a definite rejection.
                if (/maxContentLength/i.test(String(error === null || error === void 0 ? void 0 : error.message)))
                    throw Object.assign(new Error('Image too large'), { metaError: { status: 413, code: 'image_too_large', message: 'X accepts images up to 5 MB' } });
                throw error;
            }
            const form = new FormData();
            form.append('media', new Blob([image.data], { type: ((_a = image.headers) === null || _a === void 0 ? void 0 : _a['content-type']) || 'image/jpeg' }), 'image.jpg');
            form.append('media_category', 'tweet_image');
            media = { media_ids: [(yield xRequest(account, { method: 'POST', url: 'https://api.x.com/2/media/upload', data: form, headers })).data.id] };
        }
        const post = yield xRequest(account, { method: 'POST', url: 'https://api.x.com/2/tweets', data: Object.assign(Object.assign({}, (content ? { text: content } : {})), (media ? { media } : {})), headers });
        return { id: (_b = post.data) === null || _b === void 0 ? void 0 : _b.id };
    });
}
