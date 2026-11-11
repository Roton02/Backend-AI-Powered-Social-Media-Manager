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
exports.keepAccountAlive = keepAccountAlive;
exports.runTokenKeepAlive = runTokenKeepAlive;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const config_1 = __importDefault(require("../../../../config"));
const queue_service_1 = require("../../../../shared/queue.service");
const meta_service_1 = require("./meta.service");
const refreshable_token_service_1 = require("./refreshable-token.service");
const tiktok_service_1 = require("./tiktok.service");
const x_service_1 = require("./x.service");
const youtube_service_1 = require("./youtube.service");
// Keeps connections alive for accounts that rarely post, and finds dead ones before a scheduled post fails.
// - TikTok / X: renew the rotating refresh token weekly (unused refresh tokens eventually lapse).
// - YouTube: refresh daily; a removed or expired grant is marked EXPIRED right away.
// - Facebook / Instagram: ask Meta daily whether the Page token is valid and when its 90-day data access ends.
const DAY = 24 * 60 * 60 * 1000;
const intervalFor = (platform) => (platform === 'TIKTOK' || platform === 'X' ? 7 * DAY : DAY);
function patchSettings(accountId, patch) {
    return __awaiter(this, void 0, void 0, function* () {
        const fresh = yield prisma_1.default.socialAccount.findUnique({ where: { id: accountId } });
        if (fresh)
            yield prisma_1.default.socialAccount.update({ where: { id: accountId }, data: { settings: Object.assign(Object.assign({}, (fresh.settings || {})), patch) } });
    });
}
function checkMeta(account) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const appToken = `${config_1.default.social.facebook_client_id}|${config_1.default.social.facebook_client_secret}`;
        const info = (_a = (yield axios_1.default.get(`${(0, meta_service_1.graphBase)()}/debug_token`, { params: { input_token: (0, meta_service_1.decryptToken)(account.accessToken), access_token: appToken }, timeout: 15000 })).data) === null || _a === void 0 ? void 0 : _a.data;
        if (!info)
            throw new Error('No token information');
        // Only a definite answer from Meta marks the account expired; network errors are retried next run.
        if (info.is_valid === false)
            yield prisma_1.default.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
        return { dataAccessExpiresAt: info.data_access_expires_at ? info.data_access_expires_at * 1000 : null };
    });
}
/** Runs the keep-alive for one account. Errors never include tokens. */
function keepAccountAlive(account) {
    return __awaiter(this, void 0, void 0, function* () {
        let patch = {};
        if (account.platform === 'FACEBOOK' || account.platform === 'INSTAGRAM')
            patch = yield checkMeta(account);
        else if (account.platform === 'YOUTUBE')
            yield (0, youtube_service_1.freshAccessToken)(account);
        else if (account.platform === 'TIKTOK')
            yield (0, refreshable_token_service_1.freshAccessToken)(Object.assign(Object.assign({}, account), { token: (0, meta_service_1.decryptToken)(account.accessToken) }), 'TikTok', tiktok_service_1.refreshTiktok, true);
        else if (account.platform === 'X')
            yield (0, refreshable_token_service_1.freshAccessToken)(Object.assign(Object.assign({}, account), { token: (0, meta_service_1.decryptToken)(account.accessToken) }), 'X', x_service_1.refreshX, true);
        else
            return false; // LinkedIn cannot be renewed without LinkedIn's approval; the Accounts page warns before it expires.
        yield patchSettings(account.id, Object.assign(Object.assign({}, patch), { keepAliveAt: Date.now() }));
        return true;
    });
}
/** Checks every connected account that is due. Safe to run often: each account is handled at most once per interval. */
function runTokenKeepAlive() {
    return __awaiter(this, arguments, void 0, function* (now = Date.now()) {
        var _a, _b, _c;
        const accounts = yield prisma_1.default.socialAccount.findMany({ where: { connectionStatus: { in: ['CONNECTED', 'LIMITED_ACCESS'] } } });
        let checked = 0;
        for (const account of accounts) {
            if (now - (Number((_a = account.settings) === null || _a === void 0 ? void 0 : _a.keepAliveAt) || 0) < intervalFor(account.platform))
                continue;
            const lock = `keepalive:${account.id}`;
            if (!(yield queue_service_1.redisConnection.set(lock, '1', 'EX', 300, 'NX')))
                continue;
            try {
                if (yield keepAccountAlive(account))
                    checked++;
            }
            catch (error) {
                console.error('Token keep-alive failed:', JSON.stringify({ platform: account.platform, status: ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.status) || ((_c = error === null || error === void 0 ? void 0 : error.metaError) === null || _c === void 0 ? void 0 : _c.status) || (error === null || error === void 0 ? void 0 : error.code) || 'unknown' }));
            }
            finally {
                yield queue_service_1.redisConnection.del(lock);
            }
        }
        return checked;
    });
}
