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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphBase = void 0;
exports.encryptToken = encryptToken;
exports.decryptToken = decryptToken;
exports.publicAccount = publicAccount;
exports.connectedAccount = connectedAccount;
exports.metaRequest = metaRequest;
const crypto_1 = require("crypto");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../../errors/ApiErrors"));
const graphBase = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v25.0'}`;
exports.graphBase = graphBase;
function key() {
    const value = process.env.TOKEN_ENCRYPTION_KEY || '';
    if (!/^[a-f0-9]{64}$/i.test(value))
        throw new ApiErrors_1.default(503, 'Social connections are temporarily unavailable. Please contact support.');
    return Buffer.from(value, 'hex');
}
function encryptToken(value) {
    const iv = (0, crypto_1.randomBytes)(12), cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', key(), iv);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return ['enc1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join('.');
}
function decryptToken(value) {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'enc1')
        throw new ApiErrors_1.default(409, 'Please reconnect this account.');
    const cipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([cipher.update(Buffer.from(data, 'hex')), cipher.final()]).toString('utf8');
}
function publicAccount(account) {
    const { accessToken, refreshToken, settings } = account, safe = __rest(account, ["accessToken", "refreshToken", "settings"]);
    const expired = account.tokenExpiry && new Date(account.tokenExpiry).getTime() <= Date.now();
    const state = expired ? 'EXPIRED' : account.connectionStatus || 'ACTION_REQUIRED';
    return Object.assign(Object.assign({}, safe), { kind: (settings === null || settings === void 0 ? void 0 : settings.kind) || null, connectionStatus: state, capabilities: ['CONNECTED', 'LIMITED_ACCESS'].includes(state) ? (settings === null || settings === void 0 ? void 0 : settings.capabilities) || {} : { publishing: false, messaging: false, comments: false } });
}
function connectedAccount(workspaceId, accountId, capability) {
    return __awaiter(this, void 0, void 0, function* () {
        const account = yield prisma_1.default.socialAccount.findFirst({ where: { id: accountId, workspaceId } });
        if (!account || !account.externalAccountId || !publicAccount(account).capabilities[capability])
            throw new ApiErrors_1.default(409, 'This account needs reconnection or additional permissions.');
        return Object.assign(Object.assign({}, account), { token: decryptToken(account.accessToken) });
    });
}
function metaRequest(account, path, data) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        try {
            const response = yield axios_1.default.request({ method: data ? 'POST' : 'GET', url: `${(0, exports.graphBase)()}/${path}`, data, headers: { Authorization: `Bearer ${account.token}` }, timeout: 20000 });
            return response.data;
        }
        catch (error) {
            if (((_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.code) === 190)
                yield prisma_1.default.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
            const apiError = new ApiErrors_1.default(502, 'The platform could not complete this request. Check your connection and try again.');
            // Keep Meta's own error (never the token) so callers can tell a definite rejection from an ambiguous failure.
            const meta = (_e = (_d = error.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.error;
            if (error.response)
                apiError.metaError = { status: error.response.status, code: meta === null || meta === void 0 ? void 0 : meta.code, subcode: meta === null || meta === void 0 ? void 0 : meta.error_subcode, type: meta === null || meta === void 0 ? void 0 : meta.type, message: (meta === null || meta === void 0 ? void 0 : meta.error_user_msg) || (meta === null || meta === void 0 ? void 0 : meta.message), fbtraceId: meta === null || meta === void 0 ? void 0 : meta.fbtrace_id };
            console.error('Meta request failed:', JSON.stringify(Object.assign({ path: path.split('?')[0] }, (apiError.metaError || { network: error.code || 'no response' }))));
            throw apiError;
        }
    });
}
