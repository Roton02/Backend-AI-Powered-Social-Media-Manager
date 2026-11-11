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
const http_status_1 = __importDefault(require("http-status"));
const ApiErrors_1 = __importDefault(require("../../errors/ApiErrors"));
const prisma_1 = __importDefault(require("../../shared/prisma"));
const tenantGuard = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const workspaceId = req.headers["x-workspace-id"];
        if (!workspaceId || !/^[a-f0-9]{24}$/i.test(workspaceId)) {
            throw new ApiErrors_1.default(http_status_1.default.BAD_REQUEST, "Workspace ID is required.");
        }
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            throw new ApiErrors_1.default(http_status_1.default.UNAUTHORIZED, "User must be authenticated.");
        }
        const membership = yield prisma_1.default.workspaceMember.findUnique({
            where: {
                workspaceId_userId: {
                    workspaceId,
                    userId,
                },
            },
            include: {
                workspace: true,
            },
        });
        if (!membership) {
            throw new ApiErrors_1.default(http_status_1.default.FORBIDDEN, "You are not a member of this workspace.");
        }
        req.workspace = membership.workspace;
        next();
    }
    catch (err) {
        if (err instanceof ApiErrors_1.default) {
            return next(err);
        }
        next(err);
    }
});
exports.default = tenantGuard;
