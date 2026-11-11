import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { userService } from "./user.services";

const createPendingUser = catchAsync(async (req, res) => {
  const result = await userService.createPendingUserIntoDB(req.body);
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "Pending User created successfully",
    data: result,
  });
});

const resendOTP = catchAsync(async (req, res) => {
  const result = await userService.resendVerifyOTP(req.body);
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "OTP resend successfully",
    data: result,
  });
});

const createUser = catchAsync(async (req, res) => {
  const { email, otp, phone } = req.body;
  const result = await userService.createUserIntoDB(email, otp, phone);
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "User created successfully",
    data: result,
  });
});


const getClients = catchAsync(async (req, res) => {
  const users = await userService.getClients(req.query);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Clients retrieved successfully",
    data: users,
  });
});

const getTechnicians = catchAsync(async (req, res) => {
  const users = await userService.getTechnicians(req.query);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Technicians retrieved successfully",
    data: users,
  });
});

const getUsers = catchAsync(async (req, res) => {
  const users = await userService.getUsers(req.query);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Users retrieved successfully",
    data: users,
  });
});

const getSingleUser = catchAsync(async (req, res) => {
  const user = await userService.getSingleUserIntoDB(req.params.id);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "User retrieved successfully",
    data: user,
  });
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUser(req.params.id);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "User deleted successfully",
  });
});

const updateUser = catchAsync(async (req, res) => {
  const file = req.file as Express.Multer.File;
  await userService.updateUser(req.body, req.params.userId, file);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "User updated successfully",
  });
});

const deleteMyAccount = catchAsync(async (req, res) => {
  const userId = req.user.id;
  await userService.deleteMyAccount(userId);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "My account deleted successfully",
  });
});

const adminOverview = catchAsync(async (req, res) => {
  const results = await userService.adminOverview(req.query);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Admin overview retrieved successfully",
    data: results,
  });
});

const updateUserStatus = catchAsync(async (req, res) => {
  const result = await userService.updateUserStatus(
    req.params.userId,
    req.body.status
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: `User ${req.body.status === "Blocked" ? "blocked" : "activated"} successfully`,
    data: result,
  });
});

export const UserControllers = {
  createUser,
  createPendingUser,
  getClients,
  getTechnicians,
  getUsers,
  getSingleUser,
  updateUser,
  deleteMyAccount,
  deleteUser,
  resendOTP,
  adminOverview,
  updateUserStatus,
};
