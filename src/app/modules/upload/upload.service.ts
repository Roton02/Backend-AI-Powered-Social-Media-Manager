import ApiError from "../../../errors/ApiErrors";
import { uploadMany, uploadOne } from "../../../helpers/uploadService";

const uploadSingleFile = async (
  file: Express.Multer.File | undefined,
  folder?: string
) => {
  if (!file) {
    throw new ApiError(400, "No file provided");
  }

  return uploadOne(file, { folder });
};

const uploadMultipleFiles = async (
  files: Express.Multer.File[] | undefined,
  folder?: string
) => {
  if (!files?.length) {
    throw new ApiError(400, "No files provided");
  }

  const uploaded = await uploadMany(files, { folder });
  return { count: uploaded.length, files: uploaded };
};

export const uploadServices = {
  uploadSingleFile,
  uploadMultipleFiles,
};
