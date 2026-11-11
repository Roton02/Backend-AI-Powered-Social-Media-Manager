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
const config_1 = __importDefault(require("../../config"));
const http_status_1 = __importDefault(require("http-status"));
const prisma_1 = __importDefault(require("../../shared/prisma"));
const jwtHelpers_1 = require("../../helpers/jwtHelpers");
const ApiErrors_1 = __importDefault(require("../../errors/ApiErrors"));
const optionalAuth = (required = true, ...roles) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace(/^Bearer\s+/i, "");
            if (!token) {
                if (required) {
                    throw new ApiErrors_1.default(http_status_1.default.UNAUTHORIZED, "Please sign in to continue.");
                }
                else {
                    return next();
                }
            }
            const verifiedUser = jwtHelpers_1.jwtHelpers.verifyToken(token, config_1.default.jwt.jwt_secret);
            const { id, role } = verifiedUser;
            const user = yield prisma_1.default.user.findUnique({
                where: { id },
            });
            if (!user) {
                throw new ApiErrors_1.default(http_status_1.default.NOT_FOUND, "User not found.");
            }
            req.user = verifiedUser;
            if (roles.length && !roles.includes(role)) {
                throw new ApiErrors_1.default(http_status_1.default.FORBIDDEN, "You don't have permission to do this.");
            }
            next();
        }
        catch (err) {
            if (err instanceof ApiErrors_1.default) {
                return next(err);
            }
            if ((err === null || err === void 0 ? void 0 : err.name) === "TokenExpiredError") {
                return next(new ApiErrors_1.default(http_status_1.default.UNAUTHORIZED, "Your session has expired. Please sign in again."));
            }
            if ((err === null || err === void 0 ? void 0 : err.name) === "JsonWebTokenError" || (err === null || err === void 0 ? void 0 : err.name) === "NotBeforeError") {
                return next(new ApiErrors_1.default(http_status_1.default.UNAUTHORIZED, "Invalid session. Please sign in again."));
            }
            next(err);
        }
    });
};
exports.default = optionalAuth;
