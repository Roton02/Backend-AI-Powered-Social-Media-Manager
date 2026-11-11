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
exports.escapeLinkedinText = exports.linkedinPagesCallback = exports.linkedinPageScopes = exports.linkedinCallback = exports.linkedinScopes = void 0;
exports.linkedinAuthUrl = linkedinAuthUrl;
exports.connectLinkedin = connectLinkedin;
exports.linkedinPagesAuthUrl = linkedinPagesAuthUrl;
exports.discoverLinkedinPages = discoverLinkedinPages;
exports.saveLinkedinPages = saveLinkedinPages;
exports.publishLinkedin = publishLinkedin;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../../errors/ApiErrors"));
const config_1 = __importDefault(require("../../../../config"));
const meta_service_1 = require("./meta.service");
// LinkedIn member posting ("Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" products).
// Company Page posting needs LinkedIn's Community Management API approval and is not included.
exports.linkedinScopes = ['openid', 'profile', 'w_member_social'];
const apiVersion = () => process.env.LINKEDIN_API_VERSION || '202606';
const linkedinCallback = () => `${config_1.default.app.backendUrl}/api/v1/social/callback/linkedin`;
exports.linkedinCallback = linkedinCallback;
function linkedinAuthUrl(state) {
    return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: 'code', client_id: config_1.default.social.linkedin_client_id, redirect_uri: (0, exports.linkedinCallback)(), state, scope: exports.linkedinScopes.join(' ') })}`;
}
/** Exchanges the OAuth code and saves (or refreshes) the member's account in the workspace. */
function connectLinkedin(code, workspaceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = (yield axios_1.default.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: (0, exports.linkedinCallback)(), client_id: config_1.default.social.linkedin_client_id, client_secret: config_1.default.social.linkedin_client_secret }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data;
        const me = (yield axios_1.default.get('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` }, timeout: 15000 })).data;
        if (!(me === null || me === void 0 ? void 0 : me.sub))
            throw new Error('LinkedIn profile unavailable');
        const granted = String(token.scope || '').split(/[\s,]+/);
        const capabilities = { publishing: granted.includes('w_member_social'), messaging: false, comments: false };
        const data = {
            workspaceId, platform: 'LINKEDIN', externalAccountId: me.sub, accountName: me.name || 'LinkedIn profile',
            accessToken: (0, meta_service_1.encryptToken)(token.access_token), tokenExpiry: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
            settings: { capabilities, authorUrn: `urn:li:person:${me.sub}` }, connectionStatus: capabilities.publishing ? 'CONNECTED' : 'LIMITED_ACCESS',
        };
        const existing = yield prisma_1.default.socialAccount.findFirst({ where: { workspaceId, platform: 'LINKEDIN', externalAccountId: me.sub } });
        if (existing)
            yield prisma_1.default.socialAccount.update({ where: { id: existing.id }, data });
        else
            yield prisma_1.default.socialAccount.create({ data });
    });
}
// ---- Company Pages (Community Management API, separate app) ----
exports.linkedinPageScopes = ['r_organization_admin', 'w_organization_social'];
const linkedinPagesCallback = () => `${config_1.default.app.backendUrl}/api/v1/social/callback/linkedin-pages`;
exports.linkedinPagesCallback = linkedinPagesCallback;
// Roles allowed to publish organic posts for a Page.
const posterRoles = ['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR'];
function linkedinPagesAuthUrl(state) {
    return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: 'code', client_id: config_1.default.social.linkedin_pages_client_id, redirect_uri: (0, exports.linkedinPagesCallback)(), state, scope: exports.linkedinPageScopes.join(' ') })}`;
}
/** Exchanges the code and lists the Pages this member can post for. The token is returned for the encrypted selection only. */
function discoverLinkedinPages(code) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = (yield axios_1.default.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: (0, exports.linkedinPagesCallback)(), client_id: config_1.default.social.linkedin_pages_client_id, client_secret: config_1.default.social.linkedin_pages_client_secret }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data;
        const headers = { Authorization: `Bearer ${token.access_token}`, 'LinkedIn-Version': apiVersion(), 'X-Restli-Protocol-Version': '2.0.0' };
        const acls = (yield axios_1.default.get('https://api.linkedin.com/rest/organizationAcls', { params: { q: 'roleAssignee', state: 'APPROVED', count: 100 }, headers, timeout: 15000 })).data.elements || [];
        const urns = [...new Set(acls.filter((a) => posterRoles.includes(a.role)).map((a) => a.organization))].slice(0, 50);
        const pages = [];
        for (const urn of urns) {
            const id = urn.split(':').pop();
            let name = `LinkedIn Page ${id}`;
            try {
                name = (yield axios_1.default.get(`https://api.linkedin.com/rest/organizations/${id}`, { headers, timeout: 15000 })).data.localizedName || name;
            }
            catch ( /* keep fallback name */_a) { /* keep fallback name */ }
            pages.push({ id: urn, name });
        }
        return { pages, accessToken: token.access_token, expires: token.expires_in ? Date.now() + token.expires_in * 1000 : null, scope: String(token.scope || '') };
    });
}
/** Saves the chosen Pages as LINKEDIN accounts that publish with the Page as author. */
function saveLinkedinPages(session, pageIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const granted = session.scope.split(/[\s,]+/);
        const capabilities = { publishing: granted.includes('w_organization_social'), messaging: false, comments: false };
        for (const page of session.pages.filter((p) => pageIds.includes(p.id))) {
            const data = {
                workspaceId: session.workspaceId, platform: 'LINKEDIN', externalAccountId: page.id, accountName: `${page.name} (Page)`,
                accessToken: (0, meta_service_1.encryptToken)(session.accessToken), tokenExpiry: session.expires ? new Date(session.expires) : null,
                settings: { capabilities, authorUrn: page.id, kind: 'page' }, connectionStatus: capabilities.publishing ? 'CONNECTED' : 'LIMITED_ACCESS',
            };
            const existing = yield prisma_1.default.socialAccount.findFirst({ where: { workspaceId: session.workspaceId, platform: 'LINKEDIN', externalAccountId: page.id } });
            if (existing)
                yield prisma_1.default.socialAccount.update({ where: { id: existing.id }, data });
            else
                yield prisma_1.default.socialAccount.create({ data });
        }
    });
}
function linkedinRequest(account, request) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            return yield axios_1.default.request(Object.assign(Object.assign({ timeout: 20000 }, request), { headers: Object.assign({ Authorization: `Bearer ${account.token}`, 'LinkedIn-Version': apiVersion(), 'X-Restli-Protocol-Version': '2.0.0' }, request.headers) }));
        }
        catch (error) {
            if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 401)
                yield prisma_1.default.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
            const apiError = new ApiErrors_1.default(502, 'The platform could not complete this request. Check your connection and try again.');
            const body = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data;
            // Same shape as Meta errors so the worker can tell a definite rejection from an ambiguous failure. Never includes the token.
            if (error.response)
                apiError.metaError = { status: error.response.status, code: (_d = (_c = body === null || body === void 0 ? void 0 : body.serviceErrorCode) !== null && _c !== void 0 ? _c : body === null || body === void 0 ? void 0 : body.code) !== null && _d !== void 0 ? _d : error.response.status, message: body === null || body === void 0 ? void 0 : body.message };
            console.error('LinkedIn request failed:', JSON.stringify(Object.assign({ url: String(request.url).split('?')[0] }, (apiError.metaError || { network: error.code || 'no response' }))));
            throw apiError;
        }
    });
}
// Post text uses LinkedIn's "little text format": reserved characters must be escaped or the text is cut off/rejected.
const escapeLinkedinText = (text) => text.replace(/[\\|{}@\[\]()<>#*_~]/g, '\\$&');
exports.escapeLinkedinText = escapeLinkedinText;
/** Publishes a text post, optionally with one image, as the connected member. Returns the post URN. */
function publishLinkedin(account, content, imageUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const author = ((_a = account.settings) === null || _a === void 0 ? void 0 : _a.authorUrn) || `urn:li:person:${account.externalAccountId}`;
        let media;
        if (imageUrl) {
            const init = (yield linkedinRequest(account, { method: 'POST', url: 'https://api.linkedin.com/rest/images?action=initializeUpload', data: { initializeUploadRequest: { owner: author } } })).data.value;
            const image = yield axios_1.default.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 8 * 1024 * 1024 });
            yield linkedinRequest(account, { method: 'PUT', url: init.uploadUrl, data: image.data, headers: { 'Content-Type': 'application/octet-stream' } });
            media = { media: { id: init.image } };
        }
        const response = yield linkedinRequest(account, { method: 'POST', url: 'https://api.linkedin.com/rest/posts', data: Object.assign({ author, commentary: (0, exports.escapeLinkedinText)(content), visibility: 'PUBLIC', lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false, distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] } }, (media ? { content: media } : {})) });
        return { id: response.headers['x-restli-id'] || ((_b = response.data) === null || _b === void 0 ? void 0 : _b.id) };
    });
}
