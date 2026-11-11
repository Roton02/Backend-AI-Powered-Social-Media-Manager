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
exports.aiSettingsController = void 0;
const zod_1 = require("zod");
const catchAsync_1 = __importDefault(require("../../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../../shared/sendResponse"));
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../../errors/ApiErrors"));
const getAiSettings = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const workspace = yield prisma_1.default.workspace.findUnique({
        where: { id: workspaceId },
        select: { settings: true },
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "AI settings retrieved successfully",
        data: (workspace === null || workspace === void 0 ? void 0 : workspace.settings) || {},
    });
}));
const updateKnowledgeBase = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { question, answer, category } = zod_1.z.object({ question: zod_1.z.string().trim().min(1).max(500), answer: zod_1.z.string().trim().min(1).max(2000), category: zod_1.z.string().trim().max(100).default("FAQ") }).parse(req.body);
    if (!question || !answer)
        throw new ApiErrors_1.default(400, "Question and answer are required");
    const kb = yield prisma_1.default.aIKnowledgeBase.create({
        data: {
            workspaceId,
            question,
            answer,
            category: category || "General",
        },
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: "Knowledge base updated successfully",
        data: kb,
    });
}));
const getKnowledgeBase = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const items = yield prisma_1.default.aIKnowledgeBase.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Knowledge base retrieved successfully",
        data: items,
    });
}));
const editKnowledgeItem = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers['x-workspace-id'];
    const data = zod_1.z.object({ question: zod_1.z.string().trim().min(1).max(500), answer: zod_1.z.string().trim().min(1).max(2000), category: zod_1.z.string().trim().max(100).default('FAQ') }).parse(req.body);
    const item = yield prisma_1.default.aIKnowledgeBase.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!item)
        throw new ApiErrors_1.default(404, 'Knowledge base item not found');
    const result = yield prisma_1.default.aIKnowledgeBase.update({ where: { id: item.id }, data });
    (0, sendResponse_1.default)(res, { statusCode: 200, success: true, message: 'Knowledge base updated', data: result });
}));
const deleteKnowledgeItem = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { id } = req.params;
    const item = yield prisma_1.default.aIKnowledgeBase.findFirst({ where: { id, workspaceId } });
    if (!item)
        throw new ApiErrors_1.default(404, "Knowledge base item not found");
    yield prisma_1.default.aIKnowledgeBase.delete({ where: { id } });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Knowledge base item deleted",
        data: { success: true },
    });
}));
exports.aiSettingsController = {
    editKnowledgeItem,
    getAiSettings,
    updateKnowledgeBase,
    getKnowledgeBase,
    deleteKnowledgeItem,
};
