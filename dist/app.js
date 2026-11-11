"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./loadEnv");
const express_1 = __importDefault(require("express"));
const http_status_1 = __importDefault(require("http-status"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = __importDefault(require("./app/routes"));
const globalErrorHandler_1 = __importDefault(require("./app/middlewares/globalErrorHandler"));
const path_1 = __importDefault(require("path"));
const payment_controller_1 = require("./app/modules/Payment/payment.controller");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: process.env.FRONTEND_URL || "http://localhost:3005", credentials: true }));
app.post("/api/v1/payment/webhook", express_1.default.raw({ type: "application/json" }), payment_controller_1.paymentControllers.handelPaymentWebhook);
app.use(express_1.default.json({ limit: "10mb", verify: (req, _res, buffer) => { req.rawBody = buffer; } }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "..", "uploads")));
app.get("/", (req, res) => {
    res.send({
        Message: "🎉 Welcome Nirapod Sheba Backend",
    });
});
app.use("/api/v1", routes_1.default);
app.use(globalErrorHandler_1.default);
app.use((req, res, next) => {
    res.status(http_status_1.default.NOT_FOUND).json({
        success: false,
        message: "API NOT FOUND!",
        error: {
            path: req.originalUrl,
            message: "Your requested path is not found!",
        },
    });
});
exports.default = app;
