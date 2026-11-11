import express from "express";
import { userRoutes } from "../modules/user/user.route";
import { authRoute } from "../modules/auth/auth.routes";
import { paymentRoute } from "../modules/Payment/payment.route";
import { notificationRoutes } from "../modules/notification/notification.route";
import { chatRoutes } from "../modules/chat/chat.route";
import { uploadRoutes } from "../modules/upload/upload.route";
import automationRoutes from "../modules/automation/automation.route";
import { PublishingRoutes } from "../modules/publishing/publishing.route";
import socialRoutes from "../modules/social/routes/social.route";
import workspaceRoutes from "../modules/workspace/workspace.route";
import { productRoutes } from "../modules/products/routes/product.route";
import { orderRoutes } from "../modules/orders/routes/order.route";
import { aiSettingsRoutes } from "../modules/ai-settings/routes/ai.route";

const router = express.Router();

const moduleRoutes = [
  { path: "/users", route: userRoutes },
  { path: "/auth", route: authRoute },
  { path: "/payment", route: paymentRoute },
  { path: "/notifications", route: notificationRoutes },
  { path: "/chat", route: chatRoutes },
  { path: "/upload", route: uploadRoutes },
  { path: "/automation", route: automationRoutes },
  { path: "/publishing", route: PublishingRoutes },
  { path: "/social", route: socialRoutes },
  { path: "/workspace", route: workspaceRoutes },
  { path: "/products", route: productRoutes },
  { path: "/orders", route: orderRoutes },
  { path: "/ai", route: aiSettingsRoutes },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;