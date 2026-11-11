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
exports.ensureTechnicianCanWork = exports.getApprovedTechnicianProfile = void 0;
const prisma_1 = __importDefault(require("../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../errors/ApiErrors"));
const http_status_1 = __importDefault(require("http-status"));
const getApprovedTechnicianProfile = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const profile = yield prisma_1.default.technicianProfile.findUnique({
        where: { userId },
        include: { subscription: true },
    });
    if (!profile) {
        throw new ApiErrors_1.default(http_status_1.default.NOT_FOUND, "Technician profile not found");
    }
    if (profile.status !== "Approved") {
        throw new ApiErrors_1.default(http_status_1.default.FORBIDDEN, "Your technician profile is not approved yet");
    }
    if (!profile.subscriptionId || ((_a = profile.subscription) === null || _a === void 0 ? void 0 : _a.status) !== "ACTIVE") {
        throw new ApiErrors_1.default(http_status_1.default.FORBIDDEN, "Subscribe to a plan before you can bid or take jobs.");
    }
    return profile;
});
exports.getApprovedTechnicianProfile = getApprovedTechnicianProfile;
const ensureTechnicianCanWork = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const profile = yield (0, exports.getApprovedTechnicianProfile)(userId);
    if (!profile.isActive) {
        throw new ApiErrors_1.default(http_status_1.default.FORBIDDEN, "You are currently unavailable (vacation mode)");
    }
    return profile;
});
exports.ensureTechnicianCanWork = ensureTechnicianCanWork;
