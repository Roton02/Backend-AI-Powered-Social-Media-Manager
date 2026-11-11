import "./loadEnv";
import { Server } from "http";
import app from "./app";
import config from "./config";

import prisma from "./shared/prisma";
import redisClient from "./helpers/radis";
import { startPublishingWorker } from "./workers/publishing.worker";
import { startInboxSyncWorker } from "./workers/inbox-sync.worker";
import { startTokenKeepAliveWorker } from "./workers/token-keepalive.worker";
import { setupWebSocketServer } from "./app/modules/socket/socket.controller";

async function main() {
  await prisma.$connect();
  await redisClient.connect();
  const server: Server = app.listen(config.port, () => {
    console.log(" Server is running on port ", config.port);

  });

  setupWebSocketServer(server);
  startPublishingWorker();
  // Manual inbox sync (owner-approved 2026-11-11). The AI inbox worker stays paused.
  startInboxSyncWorker();
  // Keeps social connections alive and flags dead ones before a post fails.
  startTokenKeepAliveWorker();

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
}

main().catch(() => { console.error("Could not start backend. Check database and Redis configuration."); process.exit(1); });


