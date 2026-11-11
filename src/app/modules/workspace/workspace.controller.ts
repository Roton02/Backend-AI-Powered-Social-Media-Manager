import { Request, Response } from "express";
import { workspaceService } from "./workspace.service";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { z } from "zod";
import httpStatus from "http-status";

const createWorkspace = catchAsync(async (req: Request, res: Response) => {
  const data = z.object({ name: z.string().trim().min(1).max(100), slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }).parse(req.body);
  const workspace = await workspaceService.createWorkspace(data as any, (req as any).user.id);
  sendResponse(res, { statusCode: 201, success: true, message: "Workspace created", data: workspace });
});

const getMyWorkspace = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const workspace = await workspaceService.getMyWorkspace(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Workspace retrieved",
    data: workspace,
  });
});

const getWorkspace = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const workspace = await workspaceService.getWorkspace(workspaceId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Workspace retrieved",
    data: workspace,
  });
});

const updateWorkspace = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { name, slug, settings } = req.body;

  const payload: Record<string, unknown> = {};
  if (name !== undefined) payload.name = name;
  if (slug !== undefined) payload.slug = slug;
  if (settings !== undefined) payload.settings = settings;

  const workspace = await workspaceService.updateWorkspace(
    payload as any,
    workspaceId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Workspace updated",
    data: workspace,
  });
});

const getStats = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const stats = await workspaceService.getWorkspaceStats(workspaceId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Workspace stats retrieved",
    data: stats,
  });
});

const getAnalytics = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const analytics = await workspaceService.getWorkspaceAnalytics(workspaceId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Workspace analytics retrieved",
    data: analytics,
  });
});

const adminListWorkspaces = catchAsync(async (req: Request, res: Response) => {
  const workspaces = await workspaceService.adminListWorkspaces();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All workspaces retrieved (admin)",
    data: workspaces,
  });
});

export const workspaceController = {
  createWorkspace,
  getMyWorkspace,
  getWorkspace,
  updateWorkspace,
  getStats,
  getAnalytics,
  adminListWorkspaces,
};
