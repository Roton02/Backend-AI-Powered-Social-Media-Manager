"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderRoutes = void 0;
const express_1 = __importDefault(require("express"));
const order_controller_1 = require("../controllers/order.controller");
const auth_1 = __importDefault(require("../../../middlewares/auth"));
const tenantGuard_1 = __importDefault(require("../../../middlewares/tenantGuard"));
const router = express_1.default.Router();
router.get("/", (0, auth_1.default)(), tenantGuard_1.default, order_controller_1.orderController.getOrders);
exports.orderRoutes = router;
