import express from "express";
import jwt from "jsonwebtoken";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import rateLimit from "express-rate-limit";
import { authController } from "./auth.controller";
import auth from "../../middlewares/auth";
import { fileUploader } from "../../../helpers/fileUploadHelper";
import { parseBodyData } from "../../middlewares/parseBodyData";

const router = express.Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

router.post("/login", authController.loginUser);
router.post("/admin-login", authController.adminLogin);
router.get("/profile", auth(), authController.getProfile);
router.patch(
  "/update/user-location",
  auth(),
  authController.updateUserLocation
);
router.post("/send-otp", authController.sendForgotPasswordOtp);
router.post("/verify-otp", authController.verifyForgotPasswordOtpCode);
router.patch("/reset-password", (req, _res, next) => {
  try {
    const value = jwt.verify(req.headers.authorization?.replace(/^Bearer\s+/i, "") || "", config.jwt.reset_pass_secret as string) as jwt.JwtPayload;
    if (value.purpose !== "password-reset" || !value.id) throw new Error();
    if (typeof req.body.newPassword !== "string" || req.body.newPassword.length < 8) throw new ApiError(400, "Use at least 8 characters.");
    (req as any).user = value;
    next();
  } catch (error) { next(error instanceof ApiError ? error : new ApiError(401, "Please request a new password reset.")); }
}, authController.resetPassword);
router.put(
  "/set-profile",
  auth(),
  fileUploader.profileImage,
  parseBodyData,
  authController.updateProfile
);
router.patch("/change-password", auth(), authController.changePassword);

export const authRoute = router;
