import { z } from "zod";
import catchAsync from "../../../shared/catchAsync";
import { authService } from "./auth.service";
import sendResponse from "../../../shared/sendResponse";

const loginUser = catchAsync(async (req, res) => {
  const result = await authService.loginUserIntoDB(z.object({email:z.string().email().optional(),phone:z.string().min(1).optional(),password:z.string().min(1).max(200)}).parse(req.body));
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User successfully logged in",
    data: result,
  });
});

const adminLogin = catchAsync(async (req, res) => {
  const result = await authService.adminLogin(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Admin successfully logged in",
    data: result,
  });
});


const updateUserLocation = catchAsync(async (req, res) => {
  const { id } = req.user;
  const updatedUser = await authService.userLocationUpdateInDB(id, req.body as { longitude: number, latitude: number });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User location added successfully",
    data: updatedUser,
  });
});

const sendForgotPasswordOtp = catchAsync(async (req, res) => {
  const identifier = (req.body.email || req.body.phone) as string;
  const response = await authService.sendForgotPasswordOtpDB(identifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "OTP send successfully",
    data: response,
  });
});

const verifyForgotPasswordOtpCode = catchAsync(async (req, res) => {
  const payload = req.body;
  const response = await authService.verifyForgotPasswordOtpCodeDB(payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "OTP verified successfully.",
    data: response,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { newPassword } = req.body;
  const result = await authService.resetForgotPasswordDB(newPassword, userId, req.user.resetVersion);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Password updated successfully.",
    data: result,
  });
});

const getProfile = catchAsync(async (req: any, res) => {
  const { id } = req.user;
  const user = await authService.getProfileFromDB(id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User profile retrieved successfully",
    data: user,
  });
});

const updateProfile = catchAsync(async (req, res) => {
  const file = req.file as Express.Multer.File;
  await authService.updateProfileIntoDB(req.body, req.user.id, file);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User profile update successfully",
  });
});

const changePassword = catchAsync(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Your password has been changed successfully",
  });
});

export const authController = {
  loginUser,
  adminLogin,
  getProfile,
  updateProfile,
  updateUserLocation,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtpCode,
  resetPassword,
  changePassword,
};
