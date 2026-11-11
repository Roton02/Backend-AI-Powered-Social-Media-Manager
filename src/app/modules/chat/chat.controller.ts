import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { chatServices } from "./chat.service";

const getAllRooms = catchAsync(async (req, res) => {
  const result = await chatServices.getAllRooms(req.query, {
    id: req.user.id,
    role: req.user.role,
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Chat rooms retrieved successfully",
    data: result,
  });
});

const getDirectory = catchAsync(async (req, res) => {
  const result = await chatServices.getDirectory(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Chat directory retrieved successfully",
    data: result,
  });
});

const openRoom = catchAsync(async (req, res) => {
  const result = await chatServices.openRoom(
    { id: req.user.id, role: req.user.role },
    req.body.receiverId
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Chat room ready",
    data: result,
  });
});

const getRoomById = catchAsync(async (req, res) => {
  const result = await chatServices.getRoomById(req.params.roomId, {
    id: req.user.id,
    role: req.user.role,
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Chat room retrieved successfully",
    data: result,
  });
});

const getRoomMessages = catchAsync(async (req, res) => {
  const result = await chatServices.getRoomMessages(
    req.params.roomId,
    req.query,
    {
      id: req.user.id,
      role: req.user.role,
    }
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Room messages retrieved successfully",
    data: result,
  });
});

const sendMessage = catchAsync(async (req, res) => {
  const result = await chatServices.sendMessage(
    req.params.roomId,
    { id: req.user.id, role: req.user.role, userName: req.user.userName },
    req.body.content,
    req.file,
    req.body.fileUrl
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Message sent successfully",
    data: result,
  });
});

export const chatController = {
  getAllRooms,
  getDirectory,
  openRoom,
  getRoomById,
  getRoomMessages,
  sendMessage,
};
