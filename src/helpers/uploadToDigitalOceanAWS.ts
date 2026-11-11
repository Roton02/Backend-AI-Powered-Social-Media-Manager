import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";
import ffmpegStatic from "ffmpeg-static";
import { deleteUploadedFile, uploadOne } from "./uploadService";

ffmpeg.setFfprobePath(ffprobeStatic.path);
ffmpeg.setFfmpegPath(ffmpegStatic!);

interface UploadResponse {
  Location: string;
}

export const uploadVideoToDigitalOcean = async (
  file: Express.Multer.File
): Promise<{ Location: string; duration: number }> => {
  const fileName = file.originalname.replace(/\s+/g, "-");
  const tempPath = path.join("/tmp", fileName);
  await fs.promises.writeFile(tempPath, new Uint8Array(file.buffer));

  try {
    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tempPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration || 0);
      });
    });
    const uploaded = await uploadOne(file, { folder: "videos" });
    return { Location: uploaded.url, duration };
  } finally {
    await fs.promises.unlink(tempPath).catch(() => undefined);
  }
};

export const uploadToDigitalOceanAWS = async (
  file: Express.Multer.File,
  folder?: string
): Promise<UploadResponse> => {
  const uploaded = await uploadOne(file, { folder });
  return { Location: uploaded.url };
};

export const deleteFromDigitalOceanAWS = async (fileUrl: string): Promise<void> => {
  await deleteUploadedFile(fileUrl);
};
