"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoute = void 0;
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../../../config"));
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_controller_1 = require("./auth.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const fileUploadHelper_1 = require("../../../helpers/fileUploadHelper");
const parseBodyData_1 = require("../../middlewares/parseBodyData");
const router = express_1.default.Router();
router.use((0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: 100 }));
router.post("/login", auth_controller_1.authController.loginUser);
router.post("/admin-login", auth_controller_1.authController.adminLogin);
router.get("/profile", (0, auth_1.default)(), auth_controller_1.authController.getProfile);
router.patch("/update/user-location", (0, auth_1.default)(), auth_controller_1.authController.updateUserLocation);
router.post("/send-otp", auth_controller_1.authController.sendForgotPasswordOtp);
router.post("/verify-otp", auth_controller_1.authController.verifyForgotPasswordOtpCode);
router.patch("/reset-password", (req, _res, next) => {
    var _a;
    try {
        const value = jsonwebtoken_1.default.verify(((_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace(/^Bearer\s+/i, "")) || "", config_1.default.jwt.reset_pass_secret);
        if (value.purpose !== "password-reset" || !value.id)
            throw new Error();
        if (typeof req.body.newPassword !== "string" || req.body.newPassword.length < 8)
            throw new ApiErrors_1.default(400, "Use at least 8 characters.");
        req.user = value;
        next();
    }
    catch (error) {
        next(error instanceof ApiErrors_1.default ? error : new ApiErrors_1.default(401, "Please request a new password reset."));
    }
}, auth_controller_1.authController.resetPassword);
router.put("/set-profile", (0, auth_1.default)(), fileUploadHelper_1.fileUploader.profileImage, parseBodyData_1.parseBodyData, auth_controller_1.authController.updateProfile);
router.patch("/change-password", (0, auth_1.default)(), auth_controller_1.authController.changePassword);
exports.authRoute = router;
