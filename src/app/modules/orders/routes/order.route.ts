import express from "express";
import { orderController } from "../controllers/order.controller";
import auth from "../../../middlewares/auth";
import tenantGuard from "../../../middlewares/tenantGuard";

const router = express.Router();

router.get("/", auth(), tenantGuard, orderController.getOrders);

export const orderRoutes = router;
