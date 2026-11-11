import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { uploadServices } from "./upload.service";

const uploadSingle = catchAsync(async (req, res) => {
  const folder = (req.query.folder as string) || (req.body?.folder as string);

  const result = await uploadServices.uploadSingleFile(req.file, folder);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "File uploaded successfully",
    data: result,
  });
});

const uploadMultiple = catchAsync(async (req, res) => {
  const folder = (req.query.folder as string) || (req.body?.folder as string);

  const result = await uploadServices.uploadMultipleFiles(
    req.files as Express.Multer.File[],
    folder
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Files uploaded successfully",
    data: result,
  });
});

export const uploadController = {
  uploadSingle,
  uploadMultiple,
};
