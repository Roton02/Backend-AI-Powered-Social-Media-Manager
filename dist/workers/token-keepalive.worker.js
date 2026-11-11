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
exports.startTokenKeepAliveWorker = startTokenKeepAliveWorker;
const token_keepalive_service_1 = require("../app/modules/social/services/token-keepalive.service");
// Hourly pass; each account is actually renewed or checked at most once a day (TikTok/X once a week).
function startTokenKeepAliveWorker() {
    let running = false;
    const run = () => __awaiter(this, void 0, void 0, function* () {
        if (running)
            return;
        running = true;
        try {
            yield (0, token_keepalive_service_1.runTokenKeepAlive)();
        }
        catch (_a) {
            console.error('Token keep-alive unavailable; will retry.');
        }
        finally {
            running = false;
        }
    });
    const first = setTimeout(run, 60000);
    first.unref();
    const timer = setInterval(run, 60 * 60 * 1000);
    timer.unref();
    return timer;
}
