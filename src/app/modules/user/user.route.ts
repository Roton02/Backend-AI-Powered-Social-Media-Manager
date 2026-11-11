import rateLimit from "express-rate-limit";
import express from "express";
import { UserControllers } from "./user.controller";
import validateRequest from "../../middlewares/validateRequest";
import { userValidation } from "./user.validation";
import { UserRole } from "@prisma/client";
import auth from "../../middlewares/auth";
import { fileUploader } from "../../../helpers/fileUploadHelper";
import { parseBodyData } from "../../middlewares/parseBodyData";

const router = express.Router();
router.use(["/request","/otp-resend","/create"],rateLimit({windowMs:15*60*1000,limit:20}));

router.post(
  "/request",
  validateRequest(userValidation.userRegisterValidationSchema),
  UserControllers.createPendingUser
);
router.post("/otp-resend", UserControllers.resendOTP);
router.post("/create", UserControllers.createUser);
router.get("/clients", auth(UserRole.Admin), UserControllers.getClients);
router.get("/", auth(UserRole.Admin), UserControllers.getUsers);
router.get(
  "/technicians", 
  auth(UserRole.Admin),
  UserControllers.getTechnicians
);
router.get("/single/:id", auth(), UserControllers.getSingleUser);
router.delete(
  "/delete-user/:id",
  auth(UserRole.Admin),
  UserControllers.deleteUser
);
router.delete("/", auth(), UserControllers.deleteMyAccount);
router.patch(
  "/update-user/:userId",
  auth(UserRole.Admin),
  fileUploader.profileImage,
  parseBodyData,
  UserControllers.updateUser
);
router.patch(
  "/:userId/status",
  auth(UserRole.Admin),
  validateRequest(userValidation.updateUserStatusSchema),
  UserControllers.updateUserStatus
);
router.get(
  "/admin-overview",
  auth(UserRole.Admin),
  UserControllers.adminOverview
);

export const userRoutes = router;
