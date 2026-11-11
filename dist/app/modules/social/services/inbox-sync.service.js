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
exports.canSyncInbox = void 0;
exports.attachmentsOf = attachmentsOf;
exports.syncAccountInbox = syncAccountInbox;
exports.syncInboxes = syncInboxes;
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const queue_service_1 = require("../../../../shared/queue.service");
const meta_service_1 = require("./meta.service");
const inbox_service_1 = require("./inbox.service");
// Fetches Messenger and Instagram DMs with the Conversations API instead of webhooks, so the inbox
// also works on localhost. Each pass re-reads a few minutes of overlap; saving is idempotent.
const OVERLAP_MS = 5 * 60 * 1000;
const FIRST_SYNC_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAGES = 4;
const fields = 'participants,updated_time,messages.limit(20){id,created_time,from,message,sticker,attachments{mime_type,name,image_data{url,animated_gif_url},video_data{url},file_url}}';
const canSyncInbox = (account) => { var _a, _b; return ['FACEBOOK', 'INSTAGRAM'].includes(account.platform) && ['CONNECTED', 'LIMITED_ACCESS'].includes(account.connectionStatus) && Boolean((_b = (_a = account.settings) === null || _a === void 0 ? void 0 : _a.capabilities) === null || _b === void 0 ? void 0 : _b.messaging); };
exports.canSyncInbox = canSyncInbox;
// Emojis arrive as plain text and are shown as text. Stickers (including Messenger's thumbs-up) and files are typed attachments.
function attachmentsOf(m) {
    var _a, _b, _c;
    const list = [];
    if (typeof m.sticker === 'string')
        list.push({ type: 'sticker', url: m.sticker });
    for (const a of ((_a = m.attachments) === null || _a === void 0 ? void 0 : _a.data) || []) {
        const mime = String(a.mime_type || '');
        if ((_b = a.image_data) === null || _b === void 0 ? void 0 : _b.url)
            list.push({ type: 'image', url: a.image_data.animated_gif_url || a.image_data.url });
        else if ((_c = a.video_data) === null || _c === void 0 ? void 0 : _c.url)
            list.push({ type: 'video', url: a.video_data.url });
        else if (typeof a.file_url === 'string')
            list.push(Object.assign({ type: mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'file', url: a.file_url }, (a.name ? { name: String(a.name) } : {})));
    }
    return list.filter(a => /^https:\/\//.test(a.url));
}
/** Imports new DMs for one account. Returns how many messages were saved. */
function syncAccountInbox(account) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const settings = (account.settings || {});
        const firstSync = !settings.inboxSyncedAt;
        const since = firstSync ? Date.now() - FIRST_SYNC_MS : Number(settings.inboxSyncedAt) - OVERLAP_MS;
        const startedAt = Date.now();
        const pageId = account.platform === 'INSTAGRAM' ? settings.pageId : account.externalAccountId;
        const business = new Set([pageId, account.externalAccountId].filter(Boolean).map(String));
        const authed = Object.assign(Object.assign({}, account), { token: (0, meta_service_1.decryptToken)(account.accessToken) });
        let saved = 0, after = '';
        try {
            for (let page = 0; page < MAX_PAGES; page++) {
                const query = new URLSearchParams(Object.assign({ platform: account.platform === 'INSTAGRAM' ? 'instagram' : 'messenger', fields, limit: '25' }, (after ? { after } : {})));
                const response = yield (0, meta_service_1.metaRequest)(authed, `${pageId}/conversations?${query}`);
                let reachedOld = false;
                for (const thread of (response === null || response === void 0 ? void 0 : response.data) || []) {
                    if (new Date(thread.updated_time).getTime() < since) {
                        reachedOld = true;
                        break;
                    }
                    const customer = (((_a = thread.participants) === null || _a === void 0 ? void 0 : _a.data) || []).find((p) => !business.has(String(p.id)));
                    if (!(customer === null || customer === void 0 ? void 0 : customer.id))
                        continue;
                    // Oldest first, so conversation times and previews end on the newest message.
                    for (const m of [...(((_b = thread.messages) === null || _b === void 0 ? void 0 : _b.data) || [])].reverse()) {
                        const timestamp = new Date(m.created_time);
                        if (!m.id || Number.isNaN(timestamp.getTime()) || timestamp.getTime() < since)
                            continue;
                        const row = yield (0, inbox_service_1.recordDirectMessage)(account, {
                            mid: m.id, customerId: String(customer.id), customerName: customer.name || customer.username, text: m.message || '',
                            attachments: attachmentsOf(m), timestamp, fromBusiness: business.has(String((_c = m.from) === null || _c === void 0 ? void 0 : _c.id)),
                        }, firstSync);
                        if (row)
                            saved++;
                    }
                }
                after = ((_d = response === null || response === void 0 ? void 0 : response.paging) === null || _d === void 0 ? void 0 : _d.next) ? ((_e = response.paging.cursors) === null || _e === void 0 ? void 0 : _e.after) || '' : '';
                if (reachedOld || !after)
                    break;
            }
            yield saveSyncState(account.id, { inboxSyncedAt: startedAt, inboxError: null });
        }
        catch (error) {
            const meta = error === null || error === void 0 ? void 0 : error.metaError;
            // Only Meta's own message is kept (never a token) so the owner can see why the inbox is not updating.
            const message = meta ? `Meta: ${meta.message || 'request rejected'}${meta.code ? ` (code ${meta.code})` : ''}` : 'Could not reach Meta. Will retry.';
            yield saveSyncState(account.id, { inboxError: message });
            throw error;
        }
        return saved;
    });
}
// Re-reads settings first so a reconnect that happened during the sync is not overwritten.
function saveSyncState(accountId, patch) {
    return __awaiter(this, void 0, void 0, function* () {
        const fresh = yield prisma_1.default.socialAccount.findUnique({ where: { id: accountId } });
        if (!fresh)
            return;
        yield prisma_1.default.socialAccount.update({ where: { id: accountId }, data: { settings: Object.assign(Object.assign({}, (fresh.settings || {})), patch) } });
    });
}
/** Syncs every DM-capable account (optionally one workspace). One sync per account at a time. */
function syncInboxes(workspaceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const accounts = (yield prisma_1.default.socialAccount.findMany({ where: Object.assign({ platform: { in: ['FACEBOOK', 'INSTAGRAM'] } }, (workspaceId ? { workspaceId } : {})) })).filter(exports.canSyncInbox);
        let saved = 0;
        for (const account of accounts) {
            const lock = `inbox-sync:${account.id}`;
            if (!(yield queue_service_1.redisConnection.set(lock, '1', 'EX', 120, 'NX')))
                continue;
            try {
                saved += yield syncAccountInbox(account);
            }
            catch ( /* recorded on the account; the next pass retries */_a) { /* recorded on the account; the next pass retries */ }
            finally {
                yield queue_service_1.redisConnection.del(lock);
            }
        }
        return saved;
    });
}
