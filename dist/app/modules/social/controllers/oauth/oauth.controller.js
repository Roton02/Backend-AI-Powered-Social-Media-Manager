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
exports.oauthController = void 0;
const crypto_1 = require("crypto");
const axios_1 = __importDefault(require("axios"));
const catchAsync_1 = __importDefault(require("../../../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../../../shared/sendResponse"));
const prisma_1 = __importDefault(require("../../../../../shared/prisma"));
const queue_service_1 = require("../../../../../shared/queue.service");
const config_1 = __importDefault(require("../../../../../config"));
const ApiErrors_1 = __importDefault(require("../../../../../errors/ApiErrors"));
const meta_service_1 = require("../../services/meta.service");
const linkedin_service_1 = require("../../services/linkedin.service");
const youtube_service_1 = require("../../services/youtube.service");
const x_service_1 = require("../../services/x.service");
const tiktok_service_1 = require("../../services/tiktok.service");
// business_management lets /me/accounts include Pages owned by a Meta Business portfolio.
const publishingScopes = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management'];
const hash = (s) => (0, crypto_1.createHash)('sha256').update(s).digest('hex');
const callback = () => `${config_1.default.app.backendUrl}/api/v1/social/callback/facebook`;
const send = (res, data) => (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: 'Connection updated', data });
function startState(req_1, res_1, provider_1) {
    return __awaiter(this, arguments, void 0, function* (req, res, provider, extra = {}) {
        const state = (0, crypto_1.randomBytes)(32).toString('hex');
        yield queue_service_1.redisConnection.set(`oauth:${hash(state)}`, JSON.stringify(Object.assign({ workspaceId: req.headers['x-workspace-id'], userId: req.user.id, provider }, extra)), 'EX', 600);
        // Browser binding prevents a callback URL copied from another browser being used to link an account.
        res.cookie('meta_oauth', state, { httpOnly: true, sameSite: 'lax', secure: callback().startsWith('https:'), maxAge: 600000, path: '/api/v1/social/callback' });
        return state;
    });
}
const getAuthUrl = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!['facebook', 'instagram', 'linkedin', 'linkedin-pages', 'youtube', 'tiktok', 'x'].includes(req.params.platform))
        throw new ApiErrors_1.default(400, 'This platform is coming soon.');
    if (req.params.platform === 'x' || req.params.platform === 'tiktok') {
        const x = req.params.platform === 'x';
        if (!(x ? config_1.default.social.x_client_id : config_1.default.social.tiktok_client_id) || !(x ? config_1.default.social.x_client_secret : config_1.default.social.tiktok_client_secret) || !config_1.default.app.backendUrl)
            throw new ApiErrors_1.default(503, `${x ? 'X' : 'TikTok'} connections are not set up yet. Please contact support.`);
        (0, meta_service_1.encryptToken)('configuration-check');
        // The PKCE verifier stays server-side with the single-use state.
        const { verifier, challenge } = x ? (0, x_service_1.pkcePair)() : (0, tiktok_service_1.tiktokPkce)();
        const state = yield startState(req, res, req.params.platform, { codeVerifier: verifier });
        return send(res, { url: x ? (0, x_service_1.xAuthUrl)(state, challenge) : (0, tiktok_service_1.tiktokAuthUrl)(state, challenge) });
    }
    if (req.params.platform === 'youtube') {
        if (!config_1.default.social.youtube_client_id || !config_1.default.social.youtube_client_secret || !config_1.default.app.backendUrl)
            throw new ApiErrors_1.default(503, 'YouTube connections are not set up yet. Please contact support.');
        (0, meta_service_1.encryptToken)('configuration-check');
        const state = yield startState(req, res, 'youtube');
        return send(res, { url: (0, youtube_service_1.youtubeAuthUrl)(state) });
    }
    if (req.params.platform === 'linkedin-pages') {
        if (!config_1.default.social.linkedin_pages_client_id || !config_1.default.social.linkedin_pages_client_secret || !config_1.default.app.backendUrl)
            throw new ApiErrors_1.default(503, 'LinkedIn Page connections are not set up yet. Please contact support.');
        (0, meta_service_1.encryptToken)('configuration-check');
        const state = yield startState(req, res, 'linkedin-pages');
        return send(res, { url: (0, linkedin_service_1.linkedinPagesAuthUrl)(state) });
    }
    if (req.params.platform === 'linkedin') {
        if (!config_1.default.social.linkedin_client_id || !config_1.default.social.linkedin_client_secret || !config_1.default.app.backendUrl)
            throw new ApiErrors_1.default(503, 'LinkedIn connections are not available yet. Please contact support.');
        (0, meta_service_1.encryptToken)('configuration-check');
        const state = yield startState(req, res, 'linkedin');
        return send(res, { url: (0, linkedin_service_1.linkedinAuthUrl)(state) });
    }
    if (!config_1.default.social.facebook_client_id || !config_1.default.social.facebook_client_secret || !config_1.default.app.backendUrl)
        throw new ApiErrors_1.default(503, 'Social connections are not available yet. Please contact support.');
    (0, meta_service_1.encryptToken)('configuration-check');
    const scopes = req.params.platform === 'instagram' ? [...publishingScopes, 'instagram_basic', 'instagram_content_publish'] : publishingScopes;
    const state = yield startState(req, res, 'facebook');
    send(res, { url: `https://www.facebook.com/${process.env.META_GRAPH_VERSION || 'v25.0'}/dialog/oauth?${new URLSearchParams({ client_id: config_1.default.social.facebook_client_id, redirect_uri: callback(), state, scope: scopes.join(','), response_type: 'code' })}` });
}));
const handleCallback = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookie = (_b = (_a = req.headers.cookie) === null || _a === void 0 ? void 0 : _a.split(';').map(v => v.trim()).find(v => v.startsWith('meta_oauth='))) === null || _b === void 0 ? void 0 : _b.slice(11);
    if (!state || cookie !== state)
        throw new ApiErrors_1.default(400, 'Connection expired. Please reconnect.');
    const saved = yield queue_service_1.redisConnection.getdel(`oauth:${hash(state)}`);
    res.clearCookie('meta_oauth', { path: '/api/v1/social/callback' });
    if (!saved)
        throw new ApiErrors_1.default(400, 'Connection expired. Please reconnect.');
    const session = JSON.parse(saved);
    const redirect = (error) => res.redirect(`${config_1.default.app.frontendUrl}/accounts?error=${error}`);
    if (req.query.error || typeof req.query.code !== 'string')
        return redirect('cancelled');
    const provider = ['linkedin', 'linkedin-pages', 'youtube', 'tiktok', 'x'].includes(req.params.platform) ? req.params.platform : 'facebook';
    // A state issued for one provider is never accepted on another provider's callback.
    if ((session.provider || 'facebook') !== provider)
        return redirect('connection_failed');
    if (provider === 'linkedin') {
        try {
            yield (0, linkedin_service_1.connectLinkedin)(req.query.code, session.workspaceId);
            return res.redirect(`${config_1.default.app.frontendUrl}/accounts?connected=linkedin`);
        }
        catch (_e) {
            return redirect('connection_failed');
        }
    }
    if (provider === 'x' || provider === 'tiktok') {
        try {
            yield (provider === 'x' ? x_service_1.connectX : tiktok_service_1.connectTiktok)(req.query.code, session.codeVerifier, session.workspaceId);
            return res.redirect(`${config_1.default.app.frontendUrl}/accounts?connected=${provider}`);
        }
        catch (_f) {
            return redirect('connection_failed');
        }
    }
    if (provider === 'youtube') {
        try {
            yield (0, youtube_service_1.connectYoutube)(req.query.code, session.workspaceId);
            return res.redirect(`${config_1.default.app.frontendUrl}/accounts?connected=youtube`);
        }
        catch (e) {
            return redirect((e === null || e === void 0 ? void 0 : e.message) === 'NO_CHANNEL' ? 'youtube_no_channel' : 'connection_failed');
        }
    }
    if (provider === 'linkedin-pages') {
        try {
            const found = yield (0, linkedin_service_1.discoverLinkedinPages)(req.query.code);
            const selection = (0, crypto_1.randomBytes)(32).toString('hex');
            // Same encrypted, expiring, user/workspace-bound selection as Facebook Pages.
            yield queue_service_1.redisConnection.set(`selection:${hash(selection)}`, (0, meta_service_1.encryptToken)(JSON.stringify(Object.assign(Object.assign({}, session), found))), 'EX', 600);
            return res.redirect(`${config_1.default.app.frontendUrl}/accounts?selection=${selection}`);
        }
        catch (_g) {
            return redirect('connection_failed');
        }
    }
    try {
        const token = (yield axios_1.default.get(`${(0, meta_service_1.graphBase)()}/oauth/access_token`, { params: { client_id: config_1.default.social.facebook_client_id, client_secret: config_1.default.social.facebook_client_secret, redirect_uri: callback(), code: req.query.code }, timeout: 15000 })).data;
        const headers = { Authorization: `Bearer ${token.access_token}` };
        const permissions = (yield axios_1.default.get(`${(0, meta_service_1.graphBase)()}/me/permissions`, { headers, timeout: 15000 })).data.data.filter((p) => p.status === 'granted').map((p) => p.permission);
        const pages = [];
        let after;
        do {
            const response = (yield axios_1.default.get(`${(0, meta_service_1.graphBase)()}/me/accounts`, { headers, params: { fields: permissions.includes('instagram_basic') ? 'id,name,access_token,tasks,instagram_business_account{id,username}' : 'id,name,access_token,tasks', limit: 100, after }, timeout: 15000 })).data;
            pages.push(...response.data);
            after = ((_c = response.paging) === null || _c === void 0 ? void 0 : _c.next) ? (_d = response.paging.cursors) === null || _d === void 0 ? void 0 : _d.after : undefined;
        } while (after && pages.length < 500);
        const selection = (0, crypto_1.randomBytes)(32).toString('hex');
        yield queue_service_1.redisConnection.set(`selection:${hash(selection)}`, (0, meta_service_1.encryptToken)(JSON.stringify(Object.assign(Object.assign({}, session), { pages, permissions, expires: token.expires_in ? Date.now() + token.expires_in * 1000 : null }))), 'EX', 600);
        return res.redirect(`${config_1.default.app.frontendUrl}/accounts?selection=${selection}`);
    }
    catch (_h) {
        return redirect('connection_failed');
    }
}));
function selectionFor(req) {
    return __awaiter(this, void 0, void 0, function* () {
        const id = typeof req.query.selection === 'string' ? req.query.selection : req.body.selection;
        if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))
            throw new ApiErrors_1.default(400, 'Please reconnect to select your pages.');
        const value = yield queue_service_1.redisConnection.get(`selection:${hash(id)}`);
        if (!value)
            throw new ApiErrors_1.default(410, 'Page selection expired. Please reconnect.');
        const session = JSON.parse((0, meta_service_1.decryptToken)(value));
        if (session.workspaceId !== req.headers['x-workspace-id'] || session.userId !== req.user.id)
            throw new ApiErrors_1.default(403, 'This connection belongs to another workspace.');
        return { id, session };
    });
}
const getSelection = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { session } = yield selectionFor(req);
    send(res, session.pages.map((p) => ({ id: p.id, name: p.name, instagram: p.instagram_business_account ? { id: p.instagram_business_account.id, name: p.instagram_business_account.username } : null })));
}));
const confirmSelection = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id, session } = yield selectionFor(req);
    if (!Array.isArray(req.body.pageIds) || !req.body.pageIds.length || req.body.pageIds.some((id) => !session.pages.some((p) => p.id === id)))
        throw new ApiErrors_1.default(400, 'Choose an eligible page.');
    const lock = yield queue_service_1.redisConnection.set(`selection-lock:${hash(id)}`, '1', 'EX', 60, 'NX');
    if (!lock)
        throw new ApiErrors_1.default(409, 'Connection is already being saved.');
    try {
        if (session.provider === 'linkedin-pages') {
            yield (0, linkedin_service_1.saveLinkedinPages)(session, req.body.pageIds);
            yield queue_service_1.redisConnection.del(`selection:${hash(id)}`);
            return send(res, { connected: true });
        }
        for (const page of session.pages.filter((p) => req.body.pageIds.includes(p.id))) {
            const has = (scope) => session.permissions.includes(scope);
            // Scheduler connections do not subscribe to messaging/comment webhooks.
            for (const platform of ['FACEBOOK', 'INSTAGRAM']) {
                if (platform === 'INSTAGRAM' && !page.instagram_business_account)
                    continue;
                const externalAccountId = platform === 'FACEBOOK' ? page.id : page.instagram_business_account.id;
                const tasks = page.tasks || [];
                const can = (task) => tasks.includes('MANAGE') || tasks.includes(task);
                const capabilities = {
                    publishing: platform === 'FACEBOOK' ? has('pages_manage_posts') && has('pages_read_engagement') && can('CREATE_CONTENT') : has('instagram_basic') && has('pages_read_engagement') && has('instagram_content_publish'),
                    messaging: false, comments: false,
                };
                const data = { workspaceId: session.workspaceId, platform, externalAccountId, accountName: platform === 'FACEBOOK' ? page.name : page.instagram_business_account.username || page.name, accessToken: (0, meta_service_1.encryptToken)(page.access_token), tokenExpiry: session.expires ? new Date(session.expires) : null, settings: { capabilities, pageId: page.id }, connectionStatus: capabilities.publishing ? 'CONNECTED' : 'LIMITED_ACCESS' };
                const existing = yield prisma_1.default.socialAccount.findFirst({ where: { workspaceId: session.workspaceId, platform, externalAccountId } });
                if (existing)
                    yield prisma_1.default.socialAccount.update({ where: { id: existing.id }, data });
                else
                    yield prisma_1.default.socialAccount.create({ data });
            }
        }
        yield queue_service_1.redisConnection.del(`selection:${hash(id)}`);
        send(res, { connected: true });
    }
    finally {
        yield queue_service_1.redisConnection.del(`selection-lock:${hash(id)}`);
    }
}));
exports.oauthController = { getAuthUrl, handleCallback, getSelection, confirmSelection };
