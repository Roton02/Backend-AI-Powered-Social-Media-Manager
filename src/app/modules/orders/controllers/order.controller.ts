import catchAsync from "../../../../shared/catchAsync";
import sendResponse from "../../../../shared/sendResponse";
import prisma from "../../../../shared/prisma";
import httpStatus from "http-status";
import { Request, Response } from "express";

const getOrders = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const orders = await prisma.order.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Orders retrieved successfully",
    data: orders,
  });
});

export const orderController = {
  getOrders,
};
