import sharp from "sharp";
import ApiError from "../errors/ApiErrors";

/** Cloudinary free plan rejects images over 10MB. Stay under that after compress. */
export const CLOUDINARY_FREE_IMAGE_MAX = 10 * 1024 * 1024;
export const TARGET_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 1920;

export async function compressImageForCloudinary(
  file: Express.Multer.File,
): Promise<Express.Multer.File> {
  if (!file.mimetype.startsWith("image/") || file.mimetype === "image/gif") {
    if (file.mimetype.startsWith("image/") && file.size > CLOUDINARY_FREE_IMAGE_MAX) {
      throw new ApiError(
        400,
        "This image is too large for Cloudinary's free plan (10MB). Please choose a smaller file.",
      );
    }
    return file;
  }

  let quality = 82;
  let output = await sharp(file.buffer)
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (output.length > TARGET_IMAGE_BYTES && quality > 45) {
    quality -= 12;
    output = await sharp(file.buffer)
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  if (output.length > CLOUDINARY_FREE_IMAGE_MAX) {
    throw new ApiError(
      400,
      "This image is still too large after compression for Cloudinary's free 10MB limit.",
    );
  }

  return {
    ...file,
    buffer: output,
    size: output.length,
    mimetype: "image/jpeg",
    originalname: file.originalname.replace(/\.[^.]+$/i, ".jpg"),
  };
}
