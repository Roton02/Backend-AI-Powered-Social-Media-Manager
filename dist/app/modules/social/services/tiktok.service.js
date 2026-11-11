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
exports.refreshTiktok = exports.TIKTOK_TEXT_LIMIT = exports.tiktokCallback = exports.tiktokScopes = void 0;
exports.tiktokPkce = tiktokPkce;
exports.tiktokAuthUrl = tiktokAuthUrl;
exports.connectTiktok = connectTiktok;
exports.chunkPlan = chunkPlan;
exports.publishTiktok = publishTiktok;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const config_1 = __importDefault(require("../../../../config"));
const refreshable_token_service_1 = require("./refreshable-token.service");
// TikTok video posting (Login Kit + Content Posting API, Direct Post). Until TikTok audits the app,
// posts are private-only. Local development uses the Desktop platform, which allows an
// http://localhost:<port> redirect and needs PKCE with a HEX-encoded SHA-256 challenge.
exports.tiktokScopes = ['user.info.basic', 'video.publish'];
const tiktokCallback = () => `${config_1.default.app.backendUrl}/api/v1/social/callback/tiktok`;
exports.tiktokCallback = tiktokCallback;
exports.TIKTOK_TEXT_LIMIT = 2200;
const api = 'https://open.tiktokapis.com/v2';
const MB = 1024 * 1024;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function tiktokPkce() {
    const verifier = (0, crypto_1.randomBytes)(48).toString('base64url');
    return { verifier, challenge: (0, crypto_1.createHash)('sha256').update(verifier).digest('hex') };
}
function tiktokAuthUrl(state, challenge) {
    return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: config_1.default.social.tiktok_client_id, scope: exports.tiktokScopes.join(','), response_type: 'code', redirect_uri: (0, exports.tiktokCallback)(), state, code_challenge: challenge, code_challenge_method: 'S256' })}`;
}
// TikTok's token endpoint can answer an error with HTTP 200, so check the body too.
function tokenRequest(body) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = (yield axios_1.default.post(`${api}/oauth/token/`, new URLSearchParams(Object.assign({ client_key: config_1.default.social.tiktok_client_id, client_secret: config_1.default.social.tiktok_client_secret }, body)), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data;
        if (!(data === null || data === void 0 ? void 0 : data.access_token))
            throw Object.assign(new Error((data === null || data === void 0 ? void 0 : data.error) || 'TikTok token request failed'), { rejected: true });
        return data;
    });
}
const readError = (body) => { var _a, _b; return ({ code: (_a = body.error) === null || _a === void 0 ? void 0 : _a.code, message: (_b = body.error) === null || _b === void 0 ? void 0 : _b.message }); };
function tiktokRequest(account_1, token_1, path_1) {
    return __awaiter(this, arguments, void 0, function* (account, token, path, data = {}) {
        var _a, _b;
        try {
            const body = (yield axios_1.default.post(`${api}${path}`, data, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' }, timeout: 30000 })).data;
            if (((_a = body === null || body === void 0 ? void 0 : body.error) === null || _a === void 0 ? void 0 : _a.code) && body.error.code !== 'ok')
                throw { response: { status: 422, data: body } };
            return body.data;
        }
        catch (error) {
            if (((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 401 && account.id)
                yield prisma_1.default.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
            throw (0, refreshable_token_service_1.platformFailure)('TikTok', error, readError);
        }
    });
}
const creatorInfo = (account, token) => tiktokRequest(account, token, '/post/publish/creator_info/query/');
/** Exchanges the code and saves the TikTok creator with encrypted tokens. */
function connectTiktok(code, verifier, workspaceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = yield tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: (0, exports.tiktokCallback)(), code_verifier: verifier });
        const granted = String(token.scope || '').split(/[\s,]+/);
        const capabilities = { publishing: granted.includes('video.publish') && Boolean(token.refresh_token), messaging: false, comments: false };
        let name = 'TikTok account';
        if (capabilities.publishing) {
            const info = yield creatorInfo({ id: null }, token.access_token).catch(() => null);
            if (info === null || info === void 0 ? void 0 : info.creator_username)
                name = `${info.creator_nickname || info.creator_username} (@${info.creator_username})`;
        }
        yield (0, refreshable_token_service_1.saveRefreshableAccount)(workspaceId, 'TIKTOK', token.open_id, name, token, capabilities);
    });
}
/** Splits a file using TikTok's rules: 5-64 MB chunks, the last chunk takes the remainder; files up to 64 MB go in one chunk. */
function chunkPlan(size) {
    if (size <= 64 * MB)
        return { chunkSize: size, count: 1 };
    const chunkSize = 10 * MB;
    return { chunkSize, count: Math.floor(size / chunkSize) };
}
/** Uploads the video as a Direct Post and waits for TikTok to confirm it. Returns the post or publish ID. */
const refreshTiktok = (refreshToken) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
exports.refreshTiktok = refreshTiktok;
function publishTiktok(account, content, videoUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const token = yield (0, refreshable_token_service_1.freshAccessToken)(account, 'TikTok', exports.refreshTiktok);
        const info = yield creatorInfo(account, token);
        const options = (info === null || info === void 0 ? void 0 : info.privacy_level_options) || [];
        // Unaudited apps can only post privately; PUBLIC is used only when TikTok offers it.
        const privacy = options.includes('PUBLIC_TO_EVERYONE') && process.env.TIKTOK_PRIVATE_ONLY !== 'true' ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY';
        const video = Buffer.from((yield axios_1.default.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: 110 * MB })).data);
        const { chunkSize, count } = chunkPlan(video.length);
        const init = yield tiktokRequest(account, token, '/post/publish/video/init/', {
            post_info: { title: content.slice(0, exports.TIKTOK_TEXT_LIMIT), privacy_level: privacy, disable_comment: Boolean(info === null || info === void 0 ? void 0 : info.comment_disabled), disable_duet: Boolean(info === null || info === void 0 ? void 0 : info.duet_disabled), disable_stitch: Boolean(info === null || info === void 0 ? void 0 : info.stitch_disabled), brand_content_toggle: false, brand_organic_toggle: false },
            source_info: { source: 'FILE_UPLOAD', video_size: video.length, chunk_size: chunkSize, total_chunk_count: count },
        });
        for (let i = 0; i < count; i++) {
            const start = i * chunkSize, end = i === count - 1 ? video.length - 1 : start + chunkSize - 1;
            try {
                yield axios_1.default.put(init.upload_url, video.subarray(start, end + 1), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${video.length}` }, maxBodyLength: Infinity, timeout: 10 * 60 * 1000 });
            }
            catch (error) {
                throw (0, refreshable_token_service_1.platformFailure)('TikTok', error, () => ({ code: 'upload_failed', message: 'TikTok did not accept the video upload' }));
            }
        }
        // Publishing is asynchronous. Poll up to about 3 minutes; an unknown outcome is reported as ambiguous.
        for (let attempt = 0; attempt < 36; attempt++) {
            const status = yield tiktokRequest(account, token, '/post/publish/status/fetch/', { publish_id: init.publish_id });
            if ((status === null || status === void 0 ? void 0 : status.status) === 'PUBLISH_COMPLETE')
                return { id: String(((_a = status.publicaly_available_post_id) === null || _a === void 0 ? void 0 : _a[0]) || init.publish_id) };
            if ((status === null || status === void 0 ? void 0 : status.status) === 'FAILED')
                throw Object.assign(new Error('TikTok publish failed'), { metaError: { status: 422, code: status.fail_reason || 'failed', message: `TikTok could not publish the video (${status.fail_reason || 'no reason given'})` } });
            yield wait(5000);
        }
        throw new Error('TikTok is still processing the video.');
    });
}
