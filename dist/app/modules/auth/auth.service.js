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
exports.authService = void 0;
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../../../shared/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const jwtHelpers_1 = require("../../../helpers/jwtHelpers");
const config_1 = __importDefault(require("../../../config"));
const generateOtp_1 = __importDefault(require("../../../helpers/generateOtp"));
const sendEmail_1 = __importDefault(require("../../../helpers/sendEmail"));
const otpEmailTemplate_1 = require("../../../helpers/otpEmailTemplate");
const http_status_1 = __importDefault(require("http-status"));
const uploadToDigitalOceanAWS_1 = require("../../../helpers/uploadToDigitalOceanAWS");
const loginUserIntoDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const identifier = (payload.email || payload.phone || "").trim();
    if (!identifier) {
        throw new ApiErrors_1.default(400, "Email or phone is required");
    }
    const user = yield prisma_1.default.user.findFirst({
        where: {
            OR: [{ email: identifier }, { phone: identifier }],
        },
    });
    if (!user) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    if (user.status === "Blocked") {
        throw new ApiErrors_1.default(403, "Your account is blocked. Please contact admin.");
    }
    if (user.status === "Deleted") {
        throw new ApiErrors_1.default(400, "Your account already deleted, please contact Admin");
    }
    const isPasswordValid = yield bcryptjs_1.default.compare(payload.password, user === null || user === void 0 ? void 0 : user.password);
    if (!isPasswordValid) {
        throw new ApiErrors_1.default(401, "Invalid credentials");
    }
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
const adminLogin = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const identifier = (payload.email || payload.phone || "").trim();
    if (!identifier) {
        throw new ApiErrors_1.default(400, "Email or phone is required");
    }
    const user = yield prisma_1.default.user.findFirst({
        where: {
            role: "Admin",
            OR: [{ email: identifier }, { phone: identifier }],
        },
    });
    if (!user) {
        throw new ApiErrors_1.default(404, "Admin not found");
    }
    if (user.status === "Deleted") {
        throw new ApiErrors_1.default(400, "Your account already deleted, please contact Admin");
    }
    const isPasswordValid = yield bcryptjs_1.default.compare(payload.password, user === null || user === void 0 ? void 0 : user.password);
    if (!isPasswordValid) {
        throw new ApiErrors_1.default(401, "Invalid credentials");
    }
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
const userLocationUpdateInDB = (userId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const isUserExist = yield prisma_1.default.user.findFirst({
        where: {
            id: userId
        }
    });
    if (!isUserExist) {
        throw new ApiErrors_1.default(http_status_1.default.BAD_REQUEST, "You havent any account this site , contact admin");
    }
    if (isUserExist.status === "Deleted") {
        throw new ApiErrors_1.default(http_status_1.default.BAD_REQUEST, "you are already deleted user , please contact admin ");
    }
    yield prisma_1.default.user.update({
        where: { id: userId },
        data: {
            settings: {
                longitude: payload.longitude,
                latitude: payload.latitude,
            },
        },
    });
    return;
});
const sendForgotPasswordOtpDB = (identifier) => __awaiter(void 0, void 0, void 0, function* () {
    const lookup = (identifier || "").trim();
    if (!lookup) {
        throw new ApiErrors_1.default(400, "Phone or email is required");
    }
    const existingUser = yield prisma_1.default.user.findFirst({
        where: {
            OR: [{ email: lookup }, { phone: lookup }],
        },
    });
    if (!existingUser) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    if (existingUser.status === "Deleted") {
        throw new ApiErrors_1.default(400, "Your account already deleted, please contact Admin");
    }
    if (!existingUser.email) {
        throw new ApiErrors_1.default(400, "This account has no email. OTP can only be sent by Gmail.");
    }
    const otpKey = existingUser.email;
    const otp = (0, generateOtp_1.default)();
    const OTP_EXPIRATION_TIME = 5 * 60 * 1000;
    const expiresAt = Date.now() + OTP_EXPIRATION_TIME;
    const { subject, html, text } = (0, otpEmailTemplate_1.otpEmailTemplate)({
        userName: existingUser.userName,
        otp,
        purpose: "reset",
    });
    yield (0, sendEmail_1.default)(existingUser.email, subject, html, text);
    yield prisma_1.default.otp.upsert({
        where: {
            email: otpKey,
        },
        update: { otpCode: otp, expiresAt: new Date(expiresAt) },
        create: { email: otpKey, otpCode: otp, expiresAt: new Date(expiresAt) },
    });
    return { email: existingUser.email };
});
const verifyForgotPasswordOtpCodeDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const identifier = (payload.email || payload.phone || "").trim();
    const { otp } = payload;
    if (!identifier || !otp) {
        throw new ApiErrors_1.default(400, "Phone or email and OTP are required.");
    }
    const user = yield prisma_1.default.user.findFirst({
        where: { OR: [{ email: identifier }, { phone: identifier }] },
    });
    if (!user) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    const otpKey = user.email || user.phone;
    const verifyData = yield prisma_1.default.otp.findUnique({
        where: { email: otpKey },
    });
    if (!verifyData) {
        throw new ApiErrors_1.default(400, "Invalid or expired OTP.");
    }
    const { otpCode: savedOtp, expiresAt } = verifyData;
    if (otp !== savedOtp) {
        throw new ApiErrors_1.default(401, "Invalid OTP.");
    }
    if (Date.now() > expiresAt.getTime()) {
        yield prisma_1.default.otp.delete({ where: { email: otpKey } });
        throw new ApiErrors_1.default(410, "OTP has expired. Please request a new OTP.");
    }
    yield prisma_1.default.otp.delete({ where: { email: otpKey } });
    const forgetToken = jwtHelpers_1.jwtHelpers.generateToken({ id: user.id, purpose: "password-reset", resetVersion: (0, crypto_1.createHash)("sha256").update(user.password).digest("hex") }, config_1.default.jwt.reset_pass_secret, "10m");
    return { forgetToken };
});
const resetForgotPasswordDB = (newPassword, userId, resetVersion) => __awaiter(void 0, void 0, void 0, function* () {
    const existingUser = yield prisma_1.default.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
        throw new ApiErrors_1.default(404, "user not found");
    }
    if (existingUser.status !== "Active" || !resetVersion || (0, crypto_1.createHash)("sha256").update(existingUser.password).digest("hex") !== resetVersion) {
        throw new ApiErrors_1.default(401, "Please request a new password reset.");
    }
    const hashedPassword = yield bcryptjs_1.default.hash(newPassword, Number(config_1.default.jwt.gen_salt) || 10);
    const result = yield prisma_1.default.user.updateMany({
        where: { id: userId, password: existingUser.password, status: "Active" },
        data: { password: hashedPassword },
    });
    if (!result.count)
        throw new ApiErrors_1.default(401, "Please request a new password reset.");
    return;
});
const getProfileFromDB = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        throw new ApiErrors_1.default(404, "user not found!");
    }
    const { password, createdAt, updatedAt } = user, sanitizedUser = __rest(user, ["password", "createdAt", "updatedAt"]);
    return sanitizedUser;
});
const updateProfileIntoDB = (payload, userId, file) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const user = yield prisma_1.default.user.findUnique({ where: { id: userId } });
    if (!user) {
        throw new ApiErrors_1.default(404, "user not found for edit user");
    }
    if (user.status === "Deleted") {
        throw new ApiErrors_1.default(400, "Your account already deleted, please contact Admin");
    }
    let profileImage = payload.profileImage || user.profileImage;
    if (file) {
        const uploaded = yield (0, uploadToDigitalOceanAWS_1.uploadToDigitalOceanAWS)(file);
        if (!(uploaded === null || uploaded === void 0 ? void 0 : uploaded.Location)) {
            throw new ApiErrors_1.default(400, "Failed to upload profile image");
        }
        profileImage = uploaded.Location;
    }
    yield prisma_1.default.user.update({
        where: { id: userId },
        data: {
            userName: (_a = payload.userName) !== null && _a !== void 0 ? _a : user.userName,
            address: (_b = payload.address) !== null && _b !== void 0 ? _b : user.address,
            profileImage,
        },
    });
    return getProfileFromDB(userId);
});
const changePassword = (userId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma_1.default.user.findUnique({
        where: {
            id: userId,
        },
    });
    if (!user) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    if (user.status === "Deleted") {
        throw new ApiErrors_1.default(400, "Your account already deleted, please contact Admin");
    }
    const isPasswordValid = yield bcryptjs_1.default.compare(payload.oldPassword, user === null || user === void 0 ? void 0 : user.password);
    if (!isPasswordValid) {
        throw new ApiErrors_1.default(400, "Invalid Password");
    }
    const hashedPassword = bcryptjs_1.default.hashSync(payload.newPassword, 10);
    yield prisma_1.default.user.update({
        where: {
            id: userId,
        },
        data: {
            password: hashedPassword,
        },
    });
    return;
});
exports.authService = {
    loginUserIntoDB,
    adminLogin,
    getProfileFromDB,
    updateProfileIntoDB,
    userLocationUpdateInDB,
    sendForgotPasswordOtpDB,
    verifyForgotPasswordOtpCodeDB,
    resetForgotPasswordDB,
    changePassword,
};
