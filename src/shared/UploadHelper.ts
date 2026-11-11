import { uploadOne } from "../helpers/uploadService";

export const uploadInSpace = async (
  file: Express.Multer.File,
  folder: string
): Promise<string> => {
  const uploaded = await uploadOne(file, { folder });
  return uploaded.url;
};
