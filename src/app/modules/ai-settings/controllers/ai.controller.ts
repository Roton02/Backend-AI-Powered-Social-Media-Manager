import { z } from "zod";
import catchAsync from "../../../../shared/catchAsync";
import sendResponse from "../../../../shared/sendResponse";
import prisma from "../../../../shared/prisma";
import httpStatus from "http-status";
import ApiError from "../../../../errors/ApiErrors";
import { Request, Response } from "express";

const getAiSettings = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { settings: true },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "AI settings retrieved successfully",
    data: workspace?.settings || {},
  });
});

const updateKnowledgeBase = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { question, answer, category } = z.object({question:z.string().trim().min(1).max(500),answer:z.string().trim().min(1).max(2000),category:z.string().trim().max(100).default("FAQ")}).parse(req.body);

  if (!question || !answer) throw new ApiError(400, "Question and answer are required");

  const kb = await prisma.aIKnowledgeBase.create({
    data: {
      workspaceId,
      question,
      answer,
      category: category || "General",
    },
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Knowledge base updated successfully",
    data: kb,
  });
});

const getKnowledgeBase = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const items = await prisma.aIKnowledgeBase.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Knowledge base retrieved successfully",
    data: items,
  });
});

const editKnowledgeItem = catchAsync(async(req:Request,res:Response)=>{
 const workspaceId=req.headers['x-workspace-id'] as string;
 const data=z.object({question:z.string().trim().min(1).max(500),answer:z.string().trim().min(1).max(2000),category:z.string().trim().max(100).default('FAQ')}).parse(req.body);
 const item=await prisma.aIKnowledgeBase.findFirst({where:{id:req.params.id,workspaceId}});
 if(!item)throw new ApiError(404,'Knowledge base item not found');
 const result=await prisma.aIKnowledgeBase.update({where:{id:item.id},data});
 sendResponse(res,{statusCode:200,success:true,message:'Knowledge base updated',data:result});
});
const deleteKnowledgeItem = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { id } = req.params;

  const item = await prisma.aIKnowledgeBase.findFirst({ where: { id, workspaceId } });
  if (!item) throw new ApiError(404, "Knowledge base item not found");

  await prisma.aIKnowledgeBase.delete({ where: { id } });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Knowledge base item deleted",
    data: { success: true },
  });
});

export const aiSettingsController = {
  editKnowledgeItem,
  getAiSettings,
  updateKnowledgeBase,
  getKnowledgeBase,
  deleteKnowledgeItem,
};
