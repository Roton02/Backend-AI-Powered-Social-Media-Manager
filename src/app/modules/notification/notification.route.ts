import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { UserRole } from "@prisma/client";
import { notificationController } from "./notification.controller";
import { notificationValidation } from "./notification.validation";

const router = express.Router();

router.post(
  "/",
  auth(UserRole.Admin),
  validateRequest(notificationValidation.createNotificationSchema),
  notificationController.createNotification
);

router.get("/", auth(), notificationController.getMyNotifications);
router.patch("/read-all", auth(), notificationController.markAllAsRead);
router.patch("/:id/read", auth(), notificationController.markAsRead);

export const notificationRoutes = router;
