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
require("./loadEnv");
const app_1 = __importDefault(require("./app"));
const config_1 = __importDefault(require("./config"));
const prisma_1 = __importDefault(require("./shared/prisma"));
const radis_1 = __importDefault(require("./helpers/radis"));
const publishing_worker_1 = require("./workers/publishing.worker");
const inbox_sync_worker_1 = require("./workers/inbox-sync.worker");
const token_keepalive_worker_1 = require("./workers/token-keepalive.worker");
const socket_controller_1 = require("./app/modules/socket/socket.controller");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        yield prisma_1.default.$connect();
        yield radis_1.default.connect();
        const server = app_1.default.listen(config_1.default.port, () => {
            console.log(" Server is running on port ", config_1.default.port);
        });
        (0, socket_controller_1.setupWebSocketServer)(server);
        (0, publishing_worker_1.startPublishingWorker)();
        // Manual inbox sync (owner-approved 2026-11-11). The AI inbox worker stays paused.
        (0, inbox_sync_worker_1.startInboxSyncWorker)();
        // Keeps social connections alive and flags dead ones before a post fails.
        (0, token_keepalive_worker_1.startTokenKeepAliveWorker)();
        const exitHandler = () => {
            if (server) {
                server.close(() => {
                    console.info("💥 Server closed!");
                });
            }
            process.exit(1);
        };
        process.on("uncaughtException", (error) => {
            console.error("Backend stopped after an unexpected error.");
            exitHandler();
        });
        process.on("unhandledRejection", (error) => {
            console.error("Backend stopped after an unexpected error.");
            exitHandler();
        });
    });
}
main().catch(() => { console.error("Could not start backend. Check database and Redis configuration."); process.exit(1); });
