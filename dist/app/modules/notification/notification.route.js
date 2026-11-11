"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRoutes = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const client_1 = require("@prisma/client");
const notification_controller_1 = require("./notification.controller");
const notification_validation_1 = require("./notification.validation");
const router = express_1.default.Router();
router.post("/", (0, auth_1.default)(client_1.UserRole.Admin), (0, validateRequest_1.default)(notification_validation_1.notificationValidation.createNotificationSchema), notification_controller_1.notificationController.createNotification);
router.get("/", (0, auth_1.default)(), notification_controller_1.notificationController.getMyNotifications);
router.patch("/read-all", (0, auth_1.default)(), notification_controller_1.notificationController.markAllAsRead);
router.patch("/:id/read", (0, auth_1.default)(), notification_controller_1.notificationController.markAsRead);
exports.notificationRoutes = router;
