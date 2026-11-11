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
exports.toolRegistry = exports.ToolRegistry = void 0;
const prisma_1 = __importDefault(require("../../../../shared/prisma"));
class ToolRegistry {
    constructor() {
        this.tools = new Map();
        this.registerDefaultTools();
    }
    registerDefaultTools() {
        this.registerTool({
            name: "lookupOrder",
            description: "Fetch order status and tracking info using orderId",
            execute: (workspaceId, args) => __awaiter(this, void 0, void 0, function* () {
                const { orderId } = args;
                // Order details need a verified customer identity; social sender IDs are not linked yet.
                return null;
            }),
        });
        this.registerTool({
            name: "checkProductStock",
            description: "Check availability and price of a product using productName",
            execute: (workspaceId, args) => __awaiter(this, void 0, void 0, function* () {
                const { productName } = args;
                return prisma_1.default.product.findFirst({ where: { workspaceId, name: productName }, select: { name: true, price: true, stock: true } });
            }),
        });
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    executeTool(toolName, workspaceId, args) {
        return __awaiter(this, void 0, void 0, function* () {
            const tool = this.tools.get(toolName);
            if (!tool)
                throw new Error(`Tool ${toolName} not found`);
            return tool.execute(workspaceId, args);
        });
    }
    getToolsMetadata() {
        return Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
        }));
    }
}
exports.ToolRegistry = ToolRegistry;
exports.toolRegistry = new ToolRegistry();
