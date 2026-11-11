import { AIIntent } from "./ollama.provider";
import prisma from "../../../../shared/prisma";

export interface ToolDefinition {
  name: string;
  description: string;
  execute: (workspaceId: string, args: any) => Promise<any>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools() {
    this.registerTool({
      name: "lookupOrder",
      description: "Fetch order status and tracking info using orderId",
      execute: async (workspaceId, args) => {
        const { orderId } = args;
        // Order details need a verified customer identity; social sender IDs are not linked yet.
        return null;
      },
    });

    this.registerTool({
      name: "checkProductStock",
      description: "Check availability and price of a product using productName",
      execute: async (workspaceId, args) => {
        const { productName } = args;
        return prisma.product.findFirst({where:{workspaceId,name:productName},select:{name:true,price:true,stock:true}});
      },
    });
  }

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  async executeTool(toolName: string, workspaceId: string, args: any) {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool ${toolName} not found`);
    return tool.execute(workspaceId, args);
  }

  getToolsMetadata() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
    }));
  }
}

export const toolRegistry = new ToolRegistry();
