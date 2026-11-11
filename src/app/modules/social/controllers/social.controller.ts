import { z } from "zod";
import { publicAccount } from "../services/meta.service";
import { Request, Response } from "express";
import { inboxService } from "../services/inbox.service";
import { canSyncInbox, syncInboxes } from "../services/inbox-sync.service";
import { conversationList, conversationMessages } from "../services/inbox-cache.service";
import { SocialAdapterFactory } from "../adapters/social-adapter.factory";
import { SocialPlatform } from "../adapters/social-adapter.interface";
import catchAsync from "../../../../shared/catchAsync";
import sendResponse from "../../../../shared/sendResponse";
import httpStatus from "http-status";
import prisma from "../../../../shared/prisma";
import ApiError from "../../../../errors/ApiErrors";

const getInboxMessages = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const offset = req.query.offset ? Number(req.query.offset) : 0;

  const messages = await inboxService.getMessages(workspaceId, { limit, offset });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Messages retrieved",
    data: messages,
  });
});

const markMessageAsRead = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { id } = req.params;

  const message = await inboxService.markAsRead(id, workspaceId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Message marked as read",
    data: message,
  });
});

const replyToMessage = catchAsync(async(req,res)=>{
  const data=z.object({text:z.string().trim().min(1).max(2000),requestId:z.string().uuid()}).parse(req.body);
  const result=await inboxService.sendReply(req.headers['x-workspace-id'] as string,req.params.id,data.text,data.requestId);
  sendResponse(res,{statusCode:200,success:true,message:"Reply sent",data:result});
});

const getAccounts = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;

  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Accounts retrieved",
    data: accounts.map(publicAccount),
  });
});

const getComments = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const offset = req.query.offset ? Number(req.query.offset) : 0;

  const comments = await inboxService.getComments(workspaceId, { limit, offset });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Comments retrieved",
    data: comments,
  });
});

const replyToComment = catchAsync(async(req,res)=>{
  const data=z.object({text:z.string().trim().min(1).max(2000),requestId:z.string().uuid()}).parse(req.body);
  const result=await inboxService.sendReply(req.headers['x-workspace-id'] as string,req.params.id,data.text,data.requestId);
  sendResponse(res,{statusCode:200,success:true,message:"Reply sent",data:result});
});

const disconnectAccount = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { id } = req.params;

  const account = await prisma.socialAccount.findFirst({
    where: { id, workspaceId },
  });

  if (!account) {
    throw new ApiError(404, "Account not found");
  }

  await prisma.socialAccount.update({ where: { id }, data: { accessToken: "", refreshToken: null, connectionStatus: "DISCONNECTED" } });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Account disconnected",
    data: { success: true },
  });
});

const adminListAccounts = catchAsync(async (req: Request, res: Response) => {
  const accounts = await prisma.socialAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      workspace: { select: { name: true, slug: true } },
    },
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All social accounts retrieved (admin)",
    data: accounts.map(publicAccount),
  });
});

const getConversations=catchAsync(async(req,res)=>{
 sendResponse(res,{statusCode:200,success:true,message:"Conversations retrieved",data:await conversationList(req.headers['x-workspace-id'] as string)});
});
const getConversationMessages=catchAsync(async(req,res)=>{
 const before=typeof req.query.before==='string'?req.query.before:undefined;
 sendResponse(res,{statusCode:200,success:true,message:"Messages retrieved",data:await conversationMessages(req.headers['x-workspace-id'] as string,req.params.id,before)});
});
const markConversationRead=catchAsync(async(req,res)=>{
 sendResponse(res,{statusCode:200,success:true,message:"Conversation read",data:await inboxService.markConversationRead(req.headers['x-workspace-id'] as string,req.params.id)});
});
// Only files uploaded through our own upload endpoint can be sent.
const attachmentSchema=z.object({type:z.enum(['image','video','audio','file']),url:z.string().url().refine(u=>u.startsWith('https://res.cloudinary.com/'),'Upload the file first.'),name:z.string().max(200).optional()});
const replyInConversation=catchAsync(async(req,res)=>{
 const data=z.object({text:z.string().trim().max(2000).default(''),attachment:attachmentSchema.optional(),requestId:z.string().uuid()}).refine(d=>Boolean(d.text)!==Boolean(d.attachment),'Send either text or one attachment.').parse(req.body);
 const result=await inboxService.replyInConversation(req.headers['x-workspace-id'] as string,req.params.id,data.text,data.requestId,data.attachment);
 sendResponse(res,{statusCode:200,success:true,message:"Reply sent",data:result});
});
// Which accounts feed the inbox, and why one is not updating. Never returns tokens.
const getInboxAccounts=catchAsync(async(req,res)=>{
 const workspaceId=req.headers['x-workspace-id'] as string;
 const accounts=await prisma.socialAccount.findMany({where:{workspaceId,platform:{in:['FACEBOOK','INSTAGRAM']}},orderBy:{createdAt:'asc'}});
 sendResponse(res,{statusCode:200,success:true,message:"Inbox accounts",data:accounts.map(a=>{const s=(a.settings||{}) as any;return {id:a.id,platform:a.platform,accountName:a.accountName,messaging:canSyncInbox(a),syncedAt:s.inboxSyncedAt||null,error:canSyncInbox(a)?s.inboxError||null:null};})});
});
const syncInbox=catchAsync(async(req,res)=>{
 const saved=await syncInboxes(req.headers['x-workspace-id'] as string);
 sendResponse(res,{statusCode:200,success:true,message:"Inbox synced",data:{saved}});
});
const setTakeover=catchAsync(async(req,res)=>{
 const {enabled}=z.object({enabled:z.boolean()}).parse(req.body);
 const result=await inboxService.setTakeover(req.headers['x-workspace-id'] as string,req.params.id,enabled);
 sendResponse(res,{statusCode:200,success:true,message:"Conversation updated",data:result});
});
export const socialController = {
  getConversations,
  getConversationMessages,
  markConversationRead,
  replyInConversation,
  getInboxAccounts,
  syncInbox,
  setTakeover,
  getInboxMessages,
  markMessageAsRead,
  replyToMessage,
  getAccounts,
  getComments,
  replyToComment,
  disconnectAccount,
  adminListAccounts,
};
