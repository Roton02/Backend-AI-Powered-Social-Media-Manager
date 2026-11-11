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
exports.productController = void 0;
const catchAsync_1 = __importDefault(require("../../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../../shared/sendResponse"));
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../../../../errors/ApiErrors"));
const getProducts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const products = yield prisma_1.default.product.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Products retrieved successfully",
        data: products,
    });
}));
const createProduct = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { name, sku, category, price, stock, status } = req.body;
    const existing = yield prisma_1.default.product.findUnique({ where: { sku } });
    if (existing)
        throw new ApiErrors_1.default(409, "Product with this SKU already exists");
    const product = yield prisma_1.default.product.create({
        data: {
            workspaceId,
            name,
            sku,
            category,
            price,
            stock,
            status,
        },
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: "Product created successfully",
        data: product,
    });
}));
const updateProduct = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { id } = req.params;
    const { name, category, price, stock, status } = req.body;
    const existing = yield prisma_1.default.product.findFirst({ where: { id, workspaceId } });
    if (!existing)
        throw new ApiErrors_1.default(404, "Product not found");
    const product = yield prisma_1.default.product.update({
        where: { id },
        data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (name !== undefined && { name })), (category !== undefined && { category })), (price !== undefined && { price: Number(price) })), (stock !== undefined && { stock: Number(stock) })), (status !== undefined && { status })),
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Product updated successfully",
        data: product,
    });
}));
const deleteProduct = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const workspaceId = req.headers["x-workspace-id"];
    const { id } = req.params;
    const existing = yield prisma_1.default.product.findFirst({ where: { id, workspaceId } });
    if (!existing)
        throw new ApiErrors_1.default(404, "Product not found");
    yield prisma_1.default.product.delete({ where: { id } });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Product deleted successfully",
    });
}));
exports.productController = {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
};
