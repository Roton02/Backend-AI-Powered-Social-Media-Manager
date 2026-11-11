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
Object.defineProperty(exports, "__esModule", { value: true });
exports.startInboxSyncWorker = startInboxSyncWorker;
const features_1 = require("../config/features");
const inbox_sync_service_1 = require("../app/modules/social/services/inbox-sync.service");
// Manual inbox: pulls new Messenger / Instagram DMs every 30 seconds. It never sends anything.
function startInboxSyncWorker() {
    if (!features_1.featureFlags.manualInbox)
        return;
    let running = false;
    const run = () => __awaiter(this, void 0, void 0, function* () {
        if (running)
            return;
        running = true;
        try {
            yield (0, inbox_sync_service_1.syncInboxes)();
        }
        catch (_a) {
            console.error('Inbox sync unavailable; will retry.');
        }
        finally {
            running = false;
        }
    });
    void run();
    const timer = setInterval(run, 30000);
    timer.unref();
    return timer;
}
