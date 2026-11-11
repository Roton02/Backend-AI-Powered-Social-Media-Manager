import { PendingUser, Prisma, User, UserRole } from "@prisma/client";
import ApiError from "../../../errors/ApiErrors";
import bcrypt from "bcryptjs";
import { jwtHelpers } from "../../../helpers/jwtHelpers";
import config from "../../../config";
import prisma from "../../../shared/prisma";
import sendEmail from "../../../helpers/sendEmail";
import generateOTP from "../../../helpers/generateOtp";
import { otpEmailTemplate } from "../../../helpers/otpEmailTemplate";
import { paginationHelper } from "../../../shared/pagination";
import { uploadInSpace } from "../../../shared/UploadHelper";

const createPendingUserIntoDB = async (payload: PendingUser) => {
  const email = payload.email?.trim();
  if (!email) {
    throw new ApiError(400, "Email is required");
  }
  if (!payload.phone?.trim()) {
    throw new ApiError(400, "Phone is required");
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { phone: payload.phone }],
    },
  });
  if (existingUser) {
    throw new ApiError(409, "Email or phone already exists!");
  }

  const hashedPassword = await bcrypt.hash(payload.password as string, 10);
  const otp = generateOTP();
  const OTP_EXPIRATION_TIME = 5 * 60 * 1000;
  const expiresAt = Date.now() + OTP_EXPIRATION_TIME;

  const { subject, html, text } = otpEmailTemplate({
    userName: payload.userName,
    otp,
    purpose: "verify",
  });
  await sendEmail(email, subject, html, text);

  await prisma.pendingUser.upsert({
    where: {
      phone: payload.phone,
    },
    update: {
      userName: payload.userName,
      email,
      role: UserRole.Client,
      password: hashedPassword,
      address: payload.address as string,
      otpCode: otp,
      expiresAt: new Date(expiresAt),
    },
    create: {
      userName: payload.userName,
      email,
      phone: payload.phone,
      role: UserRole.Client,
      password: hashedPassword,
      address: payload.address as string,
      otpCode: otp,
      expiresAt: new Date(expiresAt),
    },
  });

  return { email };
};

const resendVerifyOTP = async (payload: { email?: string; phone?: string }) => {
  const identifier = (payload.email || payload.phone || "").trim();
  if (!identifier) {
    throw new ApiError(400, "Phone or email is required");
  }

  const existingUser = await prisma.pendingUser.findFirst({
    where: {
      OR: [{ email: identifier }, { phone: identifier }],
    },
  });
  if (!existingUser) {
    throw new ApiError(404, "User not found!");
  }
  if (!existingUser.email) {
    throw new ApiError(400, "Email is required to send OTP");
  }

  const otp = generateOTP();
  const OTP_EXPIRATION_TIME = 5 * 60 * 1000;
  const expiresAt = Date.now() + OTP_EXPIRATION_TIME;

  const { subject, html, text } = otpEmailTemplate({
    userName: existingUser.userName,
    otp,
    purpose: "verify",
  });
  await sendEmail(existingUser.email, subject, html, text);

  await prisma.pendingUser.update({
    where: { id: existingUser.id },
    data: {
      otpCode: otp,
      expiresAt: new Date(expiresAt),
    },
  });

  return { email: existingUser.email };
};

const createUserIntoDB = async (email: string, otp: string, phone?: string) => {
  if (!email?.trim()) {
    throw new ApiError(400, "Email is required");
  }
  if (!phone?.trim()) {
    throw new ApiError(400, "Phone is required");
  }
  const userPending = await prisma.pendingUser.findFirst({
    where: {
      email, phone,
    },
  });
  if (!userPending) {
    throw new ApiError(409, "User doesn't exist!");
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        ...(userPending.email ? [{ email: userPending.email }] : []),
        { phone: userPending.phone },
      ],
    },
  });
  if (existingUser) {
    throw new ApiError(409, "User Already exists!");
  }

  const { otpCode, expiresAt, userName } = userPending;

  if (otp !== otpCode) {
    throw new ApiError(401, "Invalid OTP.");
  }

  if (Date.now() > expiresAt.getTime()) {
    throw new ApiError(410, "OTP has expired. Please request a new OTP. Try to resend OTP.");
  }


  const user = await prisma.user.create({
    data: {
      email: userPending.email || undefined,
      phone: userPending.phone as string,
      address: userPending.address as string,
      password: userPending.password as string || Math.random().toString(36).slice(-8),
      userName: userName,
      role: UserRole.Client,
      status: "Active",
    },
  });

  await prisma.pendingUser.delete({ where: { id: userPending.id } });

  const accessToken = jwtHelpers.generateToken(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      userName: user.userName,
    },
    config.jwt.jwt_secret as string,
    config.jwt.expires_in as string
  );

  return {
    accessToken,
    id: user.id,
    role: user.role,
    userName: user.userName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    profileImage: user.profileImage,
  };
};

const getSingleUserIntoDB = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
  });
  if (!user) {
    throw new ApiError(404, "user not found!");
  }

  const { password, ...sanitizedUser } = user;
  return sanitizedUser;
};

const deleteUser = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new ApiError(404, "User not found for delete");
  }

  await prisma.user.update({
    where: { id },
    data: { status: "Deleted" },
  });
};

const getUsers = async (query: Record<string, unknown>) => {
  const { search } = query;
  const whereClause: Prisma.UserWhereInput = search
    ? {
        userName: {
          contains: search as string,
          mode: "insensitive" as const,
        },
      }
    : {};

  const { page, limit, skip } = paginationHelper(query);
  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      userName: true,
      email: true,
      profileImage: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
    },
    take: limit,
    skip,
    orderBy: { createdAt: "desc" },
  });

  const totalCount = await prisma.user.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / limit);

  return { totalCount, totalPages, currentPage: page, users };
};

const getClients = async (query: Record<string, unknown>) => {
  const { page, limit, skip, status } = paginationHelper(query);
  const statusFilter =
    status === "Blocked" || status === "Active" ? status : undefined;
  const where = {
    role: UserRole.Client,
    ...(statusFilter
      ? { status: statusFilter as "Active" | "Blocked" }
      : { status: { in: ["Active", "Blocked"] as ("Active" | "Blocked")[] } }),
  };
  const clients = await prisma.user.findMany({
    where,
    select: {
      id: true,
      userName: true,
      profileImage: true,
      email: true,
      phone: true,
      address: true,
      status: true,
    },
    take: limit,
    skip,
    orderBy: { createdAt: "desc" },
  });

  const totalCount = await prisma.user.count({ where });

  return {
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    clients,
  };
};

const getTechnicians = async (query: Record<string, unknown>) => {
  const { page, limit, skip } = paginationHelper(query);
  const technicians = await prisma.user.findMany({
    where: { role: UserRole.Client, status: "Active" },
    select: {
      id: true,
      userName: true,
      profileImage: true,
      email: true,
      phone: true,
    },
    take: limit,
    skip,
    orderBy: { createdAt: "desc" },
  });

  const totalCount = await prisma.user.count({
    where: { role: UserRole.Client, status: "Active" },
  });

  return {
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    technicians,
  };
};

const updateUser = async (
  payload: User,
  userId: string,
  file?: Express.Multer.File
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "user not found for edit user");
  }

  let profileImage = payload.profileImage || user.profileImage;
  if (file) {
    profileImage = await uploadInSpace(file, "users/profileImage");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      userName: payload.userName ?? user.userName,
      email: payload.email ?? user.email,
      phone: payload.phone ?? user.phone,
      address: payload.address ?? user.address,
      profileImage,
    },
  });
};

const deleteMyAccount = async (userId: string) => {
  await getSingleUserIntoDB(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { status: "Deleted" },
  });
};

const updateUserStatus = async (userId: string, status: "Active" | "Blocked") => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.role === "Admin") {
    throw new ApiError(400, "Admin accounts cannot be blocked here");
  }
  return prisma.user.update({
    where: { id: userId },
    data: { status },
    select: {
      id: true,
      userName: true,
      phone: true,
      email: true,
      address: true,
      status: true,
      role: true,
    },
  });
};

const adminOverview = async (query: Record<string, unknown> = {}) => {
  const to = query.to ? new Date(String(query.to)) : new Date();
  to.setHours(23, 59, 59, 999);
  const from = query.from
    ? new Date(String(query.from))
    : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);

  const range = { gte: from, lte: to };

  const [
    totalWorkspaces,
    activeSubscriptions,
    totalPosts,
    publishedPosts,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.postStatus.count(),
    prisma.postStatus.count({ where: { status: "PUBLISHED" } }),
  ]);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    kpis: [
      { label: "Total Workspaces", value: totalWorkspaces, delta: "0%", up: true },
      { label: "Active Subscriptions", value: activeSubscriptions, delta: "0%", up: true },
      { label: "Total Posts", value: totalPosts, delta: "0%", up: true },
      { label: "Published Posts", value: publishedPosts, delta: "0%", up: true },
    ],
    chart: { labels: [], values: [] },
    income: [],
    technicians: [],
    totals: {
      totalWorkspaces,
      activeSubscriptions,
      totalPosts,
      publishedPosts,
    },
  };
};

export const userService = {
  createUserIntoDB,
  createPendingUserIntoDB,
  getClients,
  getTechnicians,
  getUsers,
  getSingleUserIntoDB,
  updateUser,
  deleteMyAccount,
  resendVerifyOTP,
  adminOverview,
  deleteUser,
  updateUserStatus,
};
