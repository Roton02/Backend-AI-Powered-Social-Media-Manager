import { Request, Response } from "express";
import { automationService } from "./automation.service";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import httpStatus from "http-status";

const executeAction = catchAsync(async (req: Request, res: Response) => {
  const result = await automationService.executeAction(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Automation action executed successfully",
    data: result,
  });
});

export const automationController = {
  executeAction,
};
