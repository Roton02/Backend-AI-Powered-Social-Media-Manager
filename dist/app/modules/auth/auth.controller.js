"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const zod_1 = require("zod");
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const auth_service_1 = require("./auth.service");
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const loginUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.authService.loginUserIntoDB(zod_1.z.object({ email: zod_1.z.string().email().optional(), phone: zod_1.z.string().min(1).optional(), password: zod_1.z.string().min(1).max(200) }).parse(req.body));
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "User successfully logged in",
        data: result,
    });
}));
const adminLogin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.authService.adminLogin(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Admin successfully logged in",
        data: result,
    });
}));
const updateUserLocation = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.user;
    const updatedUser = yield auth_service_1.authService.userLocationUpdateInDB(id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "User location added successfully",
        data: updatedUser,
    });
}));
const sendForgotPasswordOtp = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const identifier = (req.body.email || req.body.phone);
    const response = yield auth_service_1.authService.sendForgotPasswordOtpDB(identifier);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "OTP send successfully",
        data: response,
    });
}));
const verifyForgotPasswordOtpCode = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const payload = req.body;
    const response = yield auth_service_1.authService.verifyForgotPasswordOtpCodeDB(payload);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "OTP verified successfully.",
        data: response,
    });
}));
const resetPassword = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const { newPassword } = req.body;
    const result = yield auth_service_1.authService.resetForgotPasswordDB(newPassword, userId, req.user.resetVersion);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Password updated successfully.",
        data: result,
    });
}));
const getProfile = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.user;
    const user = yield auth_service_1.authService.getProfileFromDB(id);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "User profile retrieved successfully",
        data: user,
    });
}));
const updateProfile = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const file = req.file;
    yield auth_service_1.authService.updateProfileIntoDB(req.body, req.user.id, file);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "User profile update successfully",
    });
}));
const changePassword = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield auth_service_1.authService.changePassword(req.user.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Your password has been changed successfully",
    });
}));
exports.authController = {
    loginUser,
    adminLogin,
    getProfile,
    updateProfile,
    updateUserLocation,
    sendForgotPasswordOtp,
    verifyForgotPasswordOtpCode,
    resetPassword,
    changePassword,
};
