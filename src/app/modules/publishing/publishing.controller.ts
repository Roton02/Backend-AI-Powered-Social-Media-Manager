import { Request, Response } from "express";
import { publishingService } from "./publishing.service";
import { SocialPlatform } from "../social/adapters/social-adapter.interface";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import httpStatus from "http-status";

const createPost = catchAsync(async (req: Request, res: Response) => {
  // tenantGuard middleware ensures workspaceId is present
  const workspaceId = req.headers["x-workspace-id"] as string;
  const userId = (req as any).user?.id;

  const result = await publishingService.createPost(workspaceId, userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: { jobId: result.jobId, status: result.status, platforms: result.platforms },
  });
});

const listPosts = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;

  const result = await publishingService.listPosts(workspaceId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Posts retrieved",
    data: result,
  });
});

const getPostStatus = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { jobId } = req.params;

  const result = await publishingService.getPostStatus(workspaceId, jobId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Post status retrieved",
    data: result,
  });
});

const getPostByPlatform = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { jobId, platform } = req.params;

  const result = await publishingService.getPostByPlatform(
    workspaceId,
    jobId,
    platform as SocialPlatform
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Post status retrieved",
    data: result,
  });
});

const retryFailedPost = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { jobId, platform } = req.params;

  const result = await publishingService.retryFailedPost(
    workspaceId,
    jobId,
    platform as SocialPlatform
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
  });
});

const adminListPosts = catchAsync(async (req: Request, res: Response) => {
  const result = await publishingService.adminListPosts();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All posts retrieved (admin)",
    data: result,
  });
});

export const publishingController = {
  createPost,
  listPosts,
  adminListPosts,
  getPostStatus,
  getPostByPlatform,
  retryFailedPost,
};
