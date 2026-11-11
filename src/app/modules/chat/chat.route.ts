import express from "express";
import auth from "../../middlewares/auth";
import { UserRole } from "@prisma/client";
import { chatController } from "./chat.controller";
import { fileUploader } from "../../../helpers/fileUploadHelper";
import { parseBodyData } from "../../middlewares/parseBodyData";

const router = express.Router();

router.get("/rooms", auth(), chatController.getAllRooms);
router.get("/directory", auth(UserRole.Admin), chatController.getDirectory);
router.post("/rooms", auth(), chatController.openRoom);
router.get("/rooms/:roomId", auth(), chatController.getRoomById);
router.get(
  "/rooms/:roomId/messages",
  auth(),
  chatController.getRoomMessages
);
router.post(
  "/rooms/:roomId/messages",
  auth(),
  fileUploader.uploadFile,
  parseBodyData,
  chatController.sendMessage
);

export const chatRoutes = router;
