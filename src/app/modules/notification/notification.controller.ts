import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { notificationServices } from "./notification.service";

const createNotification = catchAsync(async (req, res) => {
  const result = await notificationServices.createNotification(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Notification created successfully",
    data: result,
  });
});

const getMyNotifications = catchAsync(async (req, res) => {
  const result = await notificationServices.getMyNotifications(
    req.user.id,
    req.query
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Notifications retrieved successfully",
    data: result,
  });
});

const markAsRead = catchAsync(async (req, res) => {
  const result = await notificationServices.markAsRead(
    req.params.id,
    req.user.id
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Notification marked as read",
    data: result,
  });
});

const markAllAsRead = catchAsync(async (req, res) => {
  const result = await notificationServices.markAllAsRead(req.user.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "All notifications marked as read",
    data: result,
  });
});

export const notificationController = {
  createNotification,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
};
