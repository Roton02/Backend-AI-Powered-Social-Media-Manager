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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const client_1 = require("@prisma/client");
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jwtHelpers_1 = require("../../../helpers/jwtHelpers");
const config_1 = __importDefault(require("../../../config"));
const prisma_1 = __importDefault(require("../../../shared/prisma"));
const sendEmail_1 = __importDefault(require("../../../helpers/sendEmail"));
const generateOtp_1 = __importDefault(require("../../../helpers/generateOtp"));
const otpEmailTemplate_1 = require("../../../helpers/otpEmailTemplate");
const pagination_1 = require("../../../shared/pagination");
const UploadHelper_1 = require("../../../shared/UploadHelper");
const createPendingUserIntoDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const email = (_a = payload.email) === null || _a === void 0 ? void 0 : _a.trim();
    if (!email) {
        throw new ApiErrors_1.default(400, "Email is required");
    }
    if (!((_b = payload.phone) === null || _b === void 0 ? void 0 : _b.trim())) {
        throw new ApiErrors_1.default(400, "Phone is required");
    }
    const existingUser = yield prisma_1.default.user.findFirst({
        where: {
            OR: [{ email }, { phone: payload.phone }],
        },
    });
    if (existingUser) {
        throw new ApiErrors_1.default(409, "Email or phone already exists!");
    }
    const hashedPassword = yield bcryptjs_1.default.hash(payload.password, 10);
    const otp = (0, generateOtp_1.default)();
    const OTP_EXPIRATION_TIME = 5 * 60 * 1000;
    const expiresAt = Date.now() + OTP_EXPIRATION_TIME;
    const { subject, html, text } = (0, otpEmailTemplate_1.otpEmailTemplate)({
        userName: payload.userName,
        otp,
        purpose: "verify",
    });
    yield (0, sendEmail_1.default)(email, subject, html, text);
    yield prisma_1.default.pendingUser.upsert({
        where: {
            phone: payload.phone,
        },
        update: {
            userName: payload.userName,
            email,
            role: client_1.UserRole.Client,
            password: hashedPassword,
            address: payload.address,
            otpCode: otp,
            expiresAt: new Date(expiresAt),
        },
        create: {
            userName: payload.userName,
            email,
            phone: payload.phone,
            role: client_1.UserRole.Client,
            password: hashedPassword,
            address: payload.address,
            otpCode: otp,
            expiresAt: new Date(expiresAt),
        },
    });
    return { email };
});
const resendVerifyOTP = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const identifier = (payload.email || payload.phone || "").trim();
    if (!identifier) {
        throw new ApiErrors_1.default(400, "Phone or email is required");
    }
    const existingUser = yield prisma_1.default.pendingUser.findFirst({
        where: {
            OR: [{ email: identifier }, { phone: identifier }],
        },
    });
    if (!existingUser) {
        throw new ApiErrors_1.default(404, "User not found!");
    }
    if (!existingUser.email) {
        throw new ApiErrors_1.default(400, "Email is required to send OTP");
    }
    const otp = (0, generateOtp_1.default)();
    const OTP_EXPIRATION_TIME = 5 * 60 * 1000;
    const expiresAt = Date.now() + OTP_EXPIRATION_TIME;
    const { subject, html, text } = (0, otpEmailTemplate_1.otpEmailTemplate)({
        userName: existingUser.userName,
        otp,
        purpose: "verify",
    });
    yield (0, sendEmail_1.default)(existingUser.email, subject, html, text);
    yield prisma_1.default.pendingUser.update({
        where: { id: existingUser.id },
        data: {
            otpCode: otp,
            expiresAt: new Date(expiresAt),
        },
    });
    return { email: existingUser.email };
});
const createUserIntoDB = (email, otp, phone) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(email === null || email === void 0 ? void 0 : email.trim())) {
        throw new ApiErrors_1.default(400, "Email is required");
    }
    if (!(phone === null || phone === void 0 ? void 0 : phone.trim())) {
        throw new ApiErrors_1.default(400, "Phone is required");
    }
    const userPending = yield prisma_1.default.pendingUser.findFirst({
        where: {
            email, phone,
        },
    });
    if (!userPending) {
        throw new ApiErrors_1.default(409, "User doesn't exist!");
    }
    const existingUser = yield prisma_1.default.user.findFirst({
        where: {
            OR: [
                ...(userPending.email ? [{ email: userPending.email }] : []),
                { phone: userPending.phone },
            ],
        },
    });
    if (existingUser) {
        throw new ApiErrors_1.default(409, "User Already exists!");
    }
    const { otpCode, expiresAt, userName } = userPending;
    if (otp !== otpCode) {
        throw new ApiErrors_1.default(401, "Invalid OTP.");
    }
    if (Date.now() > expiresAt.getTime()) {
        throw new ApiErrors_1.default(410, "OTP has expired. Please request a new OTP. Try to resend OTP.");
    }
    const user = yield prisma_1.default.user.create({
        data: {
            email: userPending.email || undefined,
            phone: userPending.phone,
            address: userPending.address,
            password: userPending.password || Math.random().toString(36).slice(-8),
            userName: userName,
            role: client_1.UserRole.Client,
            status: "Active",
        },
    });
    yield prisma_1.default.pendingUser.delete({ where: { id: userPending.id } });
    const accessToken = jwtHelpers_1.jwtHelpers.generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        userName: user.userName,
    }, config_1.default.jwt.jwt_secret, config_1.default.jwt.expires_in);
    return {
        accessToken,
        id: user.id,
        role: user.role,
        userName: user.userName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        profileImage: user.profileImage,
    };
});
const getSingleUserIntoDB = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma_1.default.user.findUnique({
        where: { id },
    });
    if (!user) {
        throw new ApiErrors_1.default(404, "user not found!");
    }
    const { password } = user, sanitizedUser = __rest(user, ["password"]);
    return sanitizedUser;
});
const deleteUser = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma_1.default.user.findUnique({ where: { id } });
    if (!user) {
        throw new ApiErrors_1.default(404, "User not found for delete");
    }
    yield prisma_1.default.user.update({
        where: { id },
        data: { status: "Deleted" },
    });
});
const getUsers = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const { search } = query;
    const whereClause = search
        ? {
            userName: {
                contains: search,
                mode: "insensitive",
            },
        }
        : {};
    const { page, limit, skip } = (0, pagination_1.paginationHelper)(query);
    const users = yield prisma_1.default.user.findMany({
        where: whereClause,
        select: {
            id: true,
            userName: true,
            email: true,
            profileImage: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
        },
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
    });
    const totalCount = yield prisma_1.default.user.count({ where: whereClause });
    const totalPages = Math.ceil(totalCount / limit);
    return { totalCount, totalPages, currentPage: page, users };
});
const getClients = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const { page, limit, skip, status } = (0, pagination_1.paginationHelper)(query);
    const statusFilter = status === "Blocked" || status === "Active" ? status : undefined;
    const where = Object.assign({ role: client_1.UserRole.Client }, (statusFilter
        ? { status: statusFilter }
        : { status: { in: ["Active", "Blocked"] } }));
    const clients = yield prisma_1.default.user.findMany({
        where,
        select: {
            id: true,
            userName: true,
            profileImage: true,
            email: true,
            phone: true,
            address: true,
            status: true,
        },
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
    });
    const totalCount = yield prisma_1.default.user.count({ where });
    return {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        clients,
    };
});
const getTechnicians = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const { page, limit, skip } = (0, pagination_1.paginationHelper)(query);
    const technicians = yield prisma_1.default.user.findMany({
        where: { role: client_1.UserRole.Client, status: "Active" },
        select: {
            id: true,
            userName: true,
            profileImage: true,
            email: true,
            phone: true,
        },
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
    });
    const totalCount = yield prisma_1.default.user.count({
        where: { role: client_1.UserRole.Client, status: "Active" },
    });
    return {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        technicians,
    };
});
const updateUser = (payload, userId, file) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const user = yield prisma_1.default.user.findUnique({ where: { id: userId } });
    if (!user) {
        throw new ApiErrors_1.default(404, "user not found for edit user");
    }
    let profileImage = payload.profileImage || user.profileImage;
    if (file) {
        profileImage = yield (0, UploadHelper_1.uploadInSpace)(file, "users/profileImage");
    }
    yield prisma_1.default.user.update({
        where: { id: userId },
        data: {
            userName: (_a = payload.userName) !== null && _a !== void 0 ? _a : user.userName,
            email: (_b = payload.email) !== null && _b !== void 0 ? _b : user.email,
            phone: (_c = payload.phone) !== null && _c !== void 0 ? _c : user.phone,
            address: (_d = payload.address) !== null && _d !== void 0 ? _d : user.address,
            profileImage,
        },
    });
});
const deleteMyAccount = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    yield getSingleUserIntoDB(userId);
    yield prisma_1.default.user.update({
        where: { id: userId },
        data: { status: "Deleted" },
    });
});
const updateUserStatus = (userId, status) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma_1.default.user.findUnique({ where: { id: userId } });
    if (!user) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    if (user.role === "Admin") {
        throw new ApiErrors_1.default(400, "Admin accounts cannot be blocked here");
    }
    return prisma_1.default.user.update({
        where: { id: userId },
        data: { status },
        select: {
            id: true,
            userName: true,
            phone: true,
            email: true,
            address: true,
            status: true,
            role: true,
        },
    });
});
const adminOverview = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (query = {}) {
    const to = query.to ? new Date(String(query.to)) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = query.from
        ? new Date(String(query.from))
        : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);
    const range = { gte: from, lte: to };
    const [totalWorkspaces, activeSubscriptions, totalPosts, publishedPosts,] = yield Promise.all([
        prisma_1.default.workspace.count(),
        prisma_1.default.subscription.count({ where: { status: "ACTIVE" } }),
        prisma_1.default.postStatus.count(),
        prisma_1.default.postStatus.count({ where: { status: "PUBLISHED" } }),
    ]);
    return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        kpis: [
            { label: "Total Workspaces", value: totalWorkspaces, delta: "0%", up: true },
            { label: "Active Subscriptions", value: activeSubscriptions, delta: "0%", up: true },
            { label: "Total Posts", value: totalPosts, delta: "0%", up: true },
            { label: "Published Posts", value: publishedPosts, delta: "0%", up: true },
        ],
        chart: { labels: [], values: [] },
        income: [],
        technicians: [],
        totals: {
            totalWorkspaces,
            activeSubscriptions,
            totalPosts,
            publishedPosts,
        },
    };
});
exports.userService = {
    createUserIntoDB,
    createPendingUserIntoDB,
    getClients,
    getTechnicians,
    getUsers,
    getSingleUserIntoDB,
    updateUser,
    deleteMyAccount,
    resendVerifyOTP,
    adminOverview,
    deleteUser,
    updateUserStatus,
};
