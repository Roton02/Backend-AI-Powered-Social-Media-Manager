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
exports.UserControllers = void 0;
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const user_services_1 = require("./user.services");
const createPendingUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_services_1.userService.createPendingUserIntoDB(req.body);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 201,
        message: "Pending User created successfully",
        data: result,
    });
}));
const resendOTP = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_services_1.userService.resendVerifyOTP(req.body);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 201,
        message: "OTP resend successfully",
        data: result,
    });
}));
const createUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, otp, phone } = req.body;
    const result = yield user_services_1.userService.createUserIntoDB(email, otp, phone);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 201,
        message: "User created successfully",
        data: result,
    });
}));
const getClients = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const users = yield user_services_1.userService.getClients(req.query);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 200,
        message: "Clients retrieved successfully",
        data: users,
    });
}));
const getTechnicians = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const users = yield user_services_1.userService.getTechnicians(req.query);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 200,
        message: "Technicians retrieved successfully",
        data: users,
    });
}));
const getUsers = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const users = yield user_services_1.userService.getUsers(req.query);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 200,
        message: "Users retrieved successfully",
        data: users,
    });
}));
const getSingleUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_services_1.userService.getSingleUserIntoDB(req.params.id);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 200,
        message: "User retrieved successfully",
        data: user,
    });
}));
const deleteUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield user_services_1.userService.deleteUser(req.params.id);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 200,
        message: "User deleted successfully",
    });
}));
const updateUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const file = req.file;
    yield user_services_1.userService.updateUser(req.body, req.params.userId, file);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 200,
        message: "User updated successfully",
    });
}));
const deleteMyAccount = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    yield user_services_1.userService.deleteMyAccount(userId);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 200,
        message: "My account deleted successfully",
    });
}));
const adminOverview = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const results = yield user_services_1.userService.adminOverview(req.query);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 200,
        message: "Admin overview retrieved successfully",
        data: results,
    });
}));
const updateUserStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_services_1.userService.updateUserStatus(req.params.userId, req.body.status);
    (0, sendResponse_1.default)(res, {
        success: true,
        statusCode: 200,
        message: `User ${req.body.status === "Blocked" ? "blocked" : "activated"} successfully`,
        data: result,
    });
}));
exports.UserControllers = {
    createUser,
    createPendingUser,
    getClients,
    getTechnicians,
    getUsers,
    getSingleUser,
    updateUser,
    deleteMyAccount,
    deleteUser,
    resendOTP,
    adminOverview,
    updateUserStatus,
};
