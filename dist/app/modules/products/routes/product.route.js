"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productRoutes = void 0;
const express_1 = __importDefault(require("express"));
const product_controller_1 = require("../controllers/product.controller");
const auth_1 = __importDefault(require("../../../middlewares/auth"));
const tenantGuard_1 = __importDefault(require("../../../middlewares/tenantGuard"));
const router = express_1.default.Router();
router.get("/", (0, auth_1.default)(), tenantGuard_1.default, product_controller_1.productController.getProducts);
router.post("/", (0, auth_1.default)(), tenantGuard_1.default, product_controller_1.productController.createProduct);
router.patch("/:id", (0, auth_1.default)(), tenantGuard_1.default, product_controller_1.productController.updateProduct);
router.delete("/:id", (0, auth_1.default)(), tenantGuard_1.default, product_controller_1.productController.deleteProduct);
exports.productRoutes = router;
