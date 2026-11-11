"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const user_route_1 = require("../modules/user/user.route");
const auth_routes_1 = require("../modules/auth/auth.routes");
const payment_route_1 = require("../modules/Payment/payment.route");
const notification_route_1 = require("../modules/notification/notification.route");
const chat_route_1 = require("../modules/chat/chat.route");
const upload_route_1 = require("../modules/upload/upload.route");
const automation_route_1 = __importDefault(require("../modules/automation/automation.route"));
const publishing_route_1 = require("../modules/publishing/publishing.route");
const social_route_1 = __importDefault(require("../modules/social/routes/social.route"));
const workspace_route_1 = __importDefault(require("../modules/workspace/workspace.route"));
const product_route_1 = require("../modules/products/routes/product.route");
const order_route_1 = require("../modules/orders/routes/order.route");
const ai_route_1 = require("../modules/ai-settings/routes/ai.route");
const router = express_1.default.Router();
const moduleRoutes = [
    { path: "/users", route: user_route_1.userRoutes },
    { path: "/auth", route: auth_routes_1.authRoute },
    { path: "/payment", route: payment_route_1.paymentRoute },
    { path: "/notifications", route: notification_route_1.notificationRoutes },
    { path: "/chat", route: chat_route_1.chatRoutes },
    { path: "/upload", route: upload_route_1.uploadRoutes },
    { path: "/automation", route: automation_route_1.default },
    { path: "/publishing", route: publishing_route_1.PublishingRoutes },
    { path: "/social", route: social_route_1.default },
    { path: "/workspace", route: workspace_route_1.default },
    { path: "/products", route: product_route_1.productRoutes },
    { path: "/orders", route: order_route_1.orderRoutes },
    { path: "/ai", route: ai_route_1.aiSettingsRoutes },
];
moduleRoutes.forEach((route) => router.use(route.path, route.route));
exports.default = router;
