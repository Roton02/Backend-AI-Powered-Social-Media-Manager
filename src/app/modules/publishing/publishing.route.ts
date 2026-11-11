import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { publishingService } from "./publishing.service";
import express from "express";
import { publishingController } from "./publishing.controller";
import auth from "../../middlewares/auth";
import tenantGuard from "../../middlewares/tenantGuard";
import { UserRole } from "@prisma/client";

const router = express.Router();

// Admin: all queued/published jobs across workspaces
router.get("/admin/all", auth(UserRole.Admin), publishingController.adminListPosts);

router.get("/", auth(), tenantGuard, publishingController.listPosts);
router.post("/", auth(), tenantGuard, publishingController.createPost);
router.post("/:jobId/cancel", auth(), tenantGuard, catchAsync(async(req,res)=>{
  sendResponse(res,{statusCode:200,success:true,message:"Post cancelled",data:await publishingService.cancelPost(req.headers['x-workspace-id'] as string,req.params.jobId)});
}));
router.post("/:jobId/publish", auth(), tenantGuard, catchAsync(async(req,res)=>{
  sendResponse(res,{statusCode:200,success:true,message:"Draft queued",data:await publishingService.publishDraft(req.headers['x-workspace-id'] as string,req.params.jobId)});
}));
router.get("/:jobId", auth(), tenantGuard, publishingController.getPostStatus);
router.get(
  "/:jobId/platform/:platform",
  auth(),
  tenantGuard,
  publishingController.getPostByPlatform
);
router.post(
  "/:jobId/platform/:platform/retry",
  auth(),
  tenantGuard,
  publishingController.retryFailedPost
);

export const PublishingRoutes = router;
