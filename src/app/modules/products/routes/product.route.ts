import express from "express";
import { productController } from "../controllers/product.controller";
import auth from "../../../middlewares/auth";
import tenantGuard from "../../../middlewares/tenantGuard";

const router = express.Router();

router.get("/", auth(), tenantGuard, productController.getProducts);
router.post("/", auth(), tenantGuard, productController.createProduct);
router.patch("/:id", auth(), tenantGuard, productController.updateProduct);
router.delete("/:id", auth(), tenantGuard, productController.deleteProduct);

export const productRoutes = router;
