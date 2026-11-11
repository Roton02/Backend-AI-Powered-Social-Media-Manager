import path from "path";
import fs from "fs";

import prisma from "../shared/prisma";
import redisClient from "./radis";
import { promoteLocalUploadToCloudinary, type CloudinaryPromoteJob } from "./uploadService";

const QUEUE_KEY = "upload:cloudinary";

export async function enqueueCloudinaryUpload(job: CloudinaryPromoteJob) {
  await redisClient.lPush(QUEUE_KEY, JSON.stringify(job));
}

async function rewriteCachedFileUrls(fromUrl: string, toUrl: string) {
  const keys = await redisClient.keys("room:*:messages");
  await Promise.all(
    keys.map(async (key) => {
      const items = await redisClient.lRange(key, 0, -1);
      let changed = false;
      const next = items.map((raw) => {
        try {
          const parsed = JSON.parse(raw) as { fileUrl?: string };
          if (parsed.fileUrl !== fromUrl) return raw;
          changed = true;
          return JSON.stringify({ ...parsed, fileUrl: toUrl });
        } catch {
          return raw;
        }
      });
      if (!changed) return;
      await redisClient.del(key);
      if (next.length) await redisClient.rPush(key, next);
    }),
  );
}

export async function applyPromotedUpload(job: CloudinaryPromoteJob, cloudUrl: string) {
  await prisma.message.updateMany({
    where: { fileUrl: job.localUrl },
    data: { fileUrl: cloudUrl },
  });
  await rewriteCachedFileUrls(job.localUrl, cloudUrl);
  await redisClient.set(`upload:map:${job.localUrl}`, cloudUrl);
}

export function startUploadQueueWorker() {
  const tick = async () => {
    try {
      if (!redisClient.isOpen) {
        setTimeout(tick, 300);
        return;
      }
      const raw = await redisClient.rPop(QUEUE_KEY);
      if (raw) {
        try {
          const job = JSON.parse(raw) as CloudinaryPromoteJob;
          const diskPath = path.join(process.cwd(), "uploads", job.localKey);
          try {
            await fs.promises.access(diskPath);
          } catch {
            setImmediate(tick);
            return;
          }
          const cloudUrl = await promoteLocalUploadToCloudinary(job);
          await applyPromotedUpload(job, cloudUrl);
        } catch (error) {
          console.error("Upload queue worker:", error);
          await redisClient.lPush(QUEUE_KEY, raw);
          setTimeout(tick, 800);
          return;
        }
        setImmediate(tick);
        return;
      }
    } catch (error) {
      console.error("Upload queue worker:", error);
    }
    setTimeout(tick, 200);
  };
  void tick();
}
