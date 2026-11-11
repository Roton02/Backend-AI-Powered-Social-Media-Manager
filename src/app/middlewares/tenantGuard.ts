import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import ApiError from "../../errors/ApiErrors";
import prisma from "../../shared/prisma";

const tenantGuard = async (
  req: Request & { user?: any; workspace?: any },
  res: Response,
  next: NextFunction
) => {
  try {
    const workspaceId = req.headers["x-workspace-id"] as string;

    if (!workspaceId || !/^[a-f0-9]{24}$/i.test(workspaceId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Workspace ID is required.");
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "User must be authenticated.");
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!membership) {
      throw new ApiError(httpStatus.FORBIDDEN, "You are not a member of this workspace.");
    }

    req.workspace = membership.workspace;
    next();
  } catch (err: any) {
    if (err instanceof ApiError) {
      return next(err);
    }
    next(err);
  }
};

export default tenantGuard;
