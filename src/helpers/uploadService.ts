import path from "path";
import fs from "fs";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import ApiError from "../errors/ApiErrors";
import {
  isStorageAuthError,
  storageErrorToApiError,
} from "../errors/handleStorageError";
import config from "../config";
import redisClient from "./radis";
import { compressImageForCloudinary } from "./compressImage";

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "video/mp4",
  "video/x-matroska",
  "video/mpeg",
  "audio/mpeg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
];

export type UploadedFileMeta = {
  url: string;
  key: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export type CloudinaryPromoteJob = {
  localKey: string;
  localUrl: string;
  folder: string;
  fileId: string;
  mimeType: string;
  originalName: string;
};

const CLOUDINARY_QUEUE = "upload:cloudinary";

const cloudName = (config.cloudinary.cloud_name || "").trim();
const apiKey = (config.cloudinary.api_key || "").trim();
const apiSecret = (config.cloudinary.api_secret || "").trim();
const isProduction = process.env.NODE_ENV === "production";
const hasCloudinary = Boolean(cloudName && apiKey && apiSecret);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

const sanitizeFolder = (folder?: string) => {
  if (!folder) return "uploads";

  const cleaned = folder
    .trim()
    .replace(/[^a-zA-Z0-9-_/]/g, "")
    .replace(/^\/+|\/+$/g, "");

  return cleaned || "uploads";
};

const buildFileId = (originalName: string) => {
  const ext = path.extname(originalName);
  const baseName = path
    .basename(originalName, ext)
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 80);

  const safeBase = baseName || "file";

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeBase}`;
};

const resourceTypeFor = (mimeType: string): "image" | "video" | "raw" => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) return "video";
  return "raw";
};

const validateFile = (file: Express.Multer.File) => {
  if (!file) {
    throw new ApiError(400, "No file provided");
  }

  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
    throw new ApiError(400, "File type not allowed");
  }
};

const saveLocal = async (
  file: Express.Multer.File,
  key: string
): Promise<UploadedFileMeta> => {
  const diskPath = path.join(process.cwd(), "uploads", key);
  await fs.promises.mkdir(path.dirname(diskPath), { recursive: true });
  await fs.promises.writeFile(diskPath, file.buffer);

  const base = (config.backend_base_url || "http://localhost:5003").replace(
    /\/$/,
    "",
  );
  return {
    url: `${base}/uploads/${key}`,
    key,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };
};

const uploadToCloudinary = (
  file: Express.Multer.File,
  folder: string,
  fileId: string,
) =>
  new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `nirapod-sheba/${folder}`,
        public_id: fileId,
        resource_type: resourceTypeFor(file.mimetype),
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Cloudinary upload returned no result."));
          return;
        }
        resolve(result);
      },
    );
    stream.end(file.buffer);
  });

// direct: upload to Cloudinary before responding (no background queue), for URLs
// that third parties such as Meta must fetch immediately.
type UploadOptions = { folder?: string; direct?: boolean };

const uploadBuffer = async (
  file: Express.Multer.File,
  options?: UploadOptions
): Promise<UploadedFileMeta> => {
  validateFile(file);

  const prepared = await compressImageForCloudinary(file);
  const folder = sanitizeFolder(options?.folder);
  const fileId = buildFileId(prepared.originalname);
  const ext = prepared.mimetype === "image/jpeg" ? ".jpg" : path.extname(prepared.originalname);
  const localKey = `${folder}/${fileId}${ext}`;
  const saved = await saveLocal(prepared, localKey);

  if (!hasCloudinary) {
    if (isProduction) {
      throw new ApiError(
        503,
        "File storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env.",
      );
    }
    // eslint-disable-next-line no-console
    console.warn("Cloudinary is not configured. Saving the file locally instead.");
    return saved;
  }

  const job: CloudinaryPromoteJob = {
    localKey,
    localUrl: saved.url,
    folder,
    fileId,
    mimeType: prepared.mimetype,
    originalName: prepared.originalname,
  };

  try {
    if (!options?.direct && redisClient.isOpen) {
      await redisClient.lPush(CLOUDINARY_QUEUE, JSON.stringify(job));
      return saved;
    }
  } catch {
    /* fall through and upload inline */
  }

  try {
    const result = await uploadToCloudinary(prepared, folder, fileId);
    return {
      url: result.secure_url || result.url,
      key: result.public_id,
      originalName: prepared.originalname,
      mimeType: prepared.mimetype,
      size: prepared.size,
    };
  } catch (error) {
    if (!isProduction && isStorageAuthError(error)) {
      // eslint-disable-next-line no-console
      console.warn("Cloudinary rejected the credentials. Saving the file locally instead.");
      return saved;
    }
    throw storageErrorToApiError(error);
  }
};

export const promoteLocalUploadToCloudinary = async (job: CloudinaryPromoteJob) => {
  const diskPath = path.join(process.cwd(), "uploads", job.localKey);
  const buffer = await fs.promises.readFile(diskPath);
  const file = {
    buffer,
    mimetype: job.mimeType,
    originalname: job.originalName,
    size: buffer.length,
  } as Express.Multer.File;
  const result = await uploadToCloudinary(file, job.folder, job.fileId);
  return result.secure_url || result.url;
};

export const uploadOne = async (
  file: Express.Multer.File,
  options?: UploadOptions
): Promise<UploadedFileMeta> => {
  return uploadBuffer(file, options);
};

export const uploadMany = async (
  files: Express.Multer.File[],
  options?: { folder?: string }
): Promise<UploadedFileMeta[]> => {
  if (!files?.length) {
    throw new ApiError(400, "No files provided");
  }

  return Promise.all(files.map((file) => uploadOne(file, options)));
};

const publicIdFromUrl = (fileUrl: string) => {
  try {
    const parsed = new URL(fileUrl);
    if (!parsed.hostname.includes("cloudinary.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = parts.findIndex((part) => part === "upload");
    if (uploadIndex < 0) return parts.at(-1)?.replace(/\.[^.]+$/, "") ?? null;
    const afterUpload = parts.slice(uploadIndex + 1);
    const withoutVersion = afterUpload[0]?.startsWith("v")
      ? afterUpload.slice(1)
      : afterUpload;
    const joined = withoutVersion.join("/");
    return joined.replace(/\.[^.]+$/, "");
  } catch {
    return null;
  }
};

export const deleteUploadedFile = async (fileUrl: string) => {
  if (!fileUrl) return;
  if (!hasCloudinary) {
    const localPrefix = `${(config.backend_base_url || "").replace(/\/$/, "")}/uploads/`;
    if (fileUrl.startsWith(localPrefix)) {
      const relative = fileUrl.slice(localPrefix.length);
      const diskPath = path.join(process.cwd(), "uploads", relative);
      await fs.promises.unlink(diskPath).catch(() => undefined);
    }
    return;
  }

  const publicId = publicIdFromUrl(fileUrl) || fileUrl;
  const types: Array<"image" | "video" | "raw"> = ["image", "video", "raw"];
  for (const resource_type of types) {
    try {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type });
      if (result.result === "ok" || result.result === "not found") return;
    } catch {
      /* try next resource type */
    }
  }
};
