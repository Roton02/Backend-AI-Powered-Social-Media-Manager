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
exports.saveRefreshableAccount = saveRefreshableAccount;
exports.freshAccessToken = freshAccessToken;
exports.platformFailure = platformFailure;
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../../errors/ApiErrors"));
const queue_service_1 = require("../../../../shared/queue.service");
const meta_service_1 = require("./meta.service");
const margin = 5 * 60 * 1000;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function saveRefreshableAccount(workspaceId, platform, externalAccountId, accountName, token, capabilities) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = {
            workspaceId, platform, externalAccountId, accountName,
            accessToken: (0, meta_service_1.encryptToken)(token.access_token), refreshToken: token.refresh_token ? (0, meta_service_1.encryptToken)(token.refresh_token) : null, tokenExpiry: null,
            settings: { capabilities, accessExpiresAt: Date.now() + (token.expires_in || 7200) * 1000 },
            connectionStatus: capabilities.publishing ? 'CONNECTED' : 'LIMITED_ACCESS',
        };
        const existing = yield prisma_1.default.socialAccount.findFirst({ where: { workspaceId, platform, externalAccountId } });
        if (existing)
            yield prisma_1.default.socialAccount.update({ where: { id: existing.id }, data });
        else
            yield prisma_1.default.socialAccount.create({ data });
    });
}
const valid = (account) => { var _a; return Number((_a = account === null || account === void 0 ? void 0 : account.settings) === null || _a === void 0 ? void 0 : _a.accessExpiresAt) > Date.now() + margin; };
const reconnect = (label, code) => Object.assign(new ApiErrors_1.default(409, `Reconnect this ${label} account.`), { metaError: { status: 401, code, message: `${label} access expired or was removed. Reconnect the account` } });
/**
 * Returns a usable access token, refreshing it when needed. Refresh tokens are single-use on these
 * platforms, so a Redis lock makes sure parallel jobs for one account never refresh twice.
 */
function freshAccessToken(account, label, refresh) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (valid(account))
            return account.token;
        const lock = `token-refresh:${account.id}`;
        for (let attempt = 0; attempt < 40; attempt++) {
            if (yield queue_service_1.redisConnection.set(lock, '1', 'EX', 30, 'NX')) {
                try {
                    const current = yield prisma_1.default.socialAccount.findUnique({ where: { id: account.id } });
                    if (valid(current))
                        return (0, meta_service_1.decryptToken)(current.accessToken);
                    if (!(current === null || current === void 0 ? void 0 : current.refreshToken))
                        throw reconnect(label, 'no_refresh_token');
                    let token;
                    try {
                        token = yield refresh((0, meta_service_1.decryptToken)(current.refreshToken));
                    }
                    catch (error) {
                        const status = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status;
                        if ((error === null || error === void 0 ? void 0 : error.rejected) || status === 400 || status === 401) {
                            yield prisma_1.default.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
                            throw reconnect(label, 'invalid_refresh_token');
                        }
                        throw error;
                    }
                    yield prisma_1.default.socialAccount.update({ where: { id: account.id }, data: {
                            accessToken: (0, meta_service_1.encryptToken)(token.access_token),
                            refreshToken: token.refresh_token ? (0, meta_service_1.encryptToken)(token.refresh_token) : current.refreshToken,
                            settings: Object.assign(Object.assign({}, current.settings), { accessExpiresAt: Date.now() + (token.expires_in || 7200) * 1000 }),
                        } });
                    return token.access_token;
                }
                finally {
                    yield queue_service_1.redisConnection.del(lock);
                }
            }
            yield wait(500);
        }
        throw new ApiErrors_1.default(503, `${label} access could not be refreshed. Try again.`);
    });
}
/** Same error shape as Meta errors so the worker can tell a definite rejection from an ambiguous failure. Never includes tokens. */
function platformFailure(label, error, read) {
    const apiError = new ApiErrors_1.default(502, 'The platform could not complete this request. Check your connection and try again.');
    if (error === null || error === void 0 ? void 0 : error.response)
        apiError.metaError = Object.assign({ status: error.response.status }, read(error.response.data || {}));
    console.error(`${label} request failed:`, JSON.stringify(apiError.metaError || { network: (error === null || error === void 0 ? void 0 : error.code) || 'no response' }));
    return apiError;
}
