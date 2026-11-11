import { createHash } from "crypto";
import prisma from "../../../shared/prisma";
import bcrypt from "bcryptjs";
import ApiError from "../../../errors/ApiErrors";
import { jwtHelpers } from "../../../helpers/jwtHelpers";
import config from "../../../config";
import { User } from "@prisma/client";
import generateOTP from "../../../helpers/generateOtp";
import sendEmail from "../../../helpers/sendEmail";
import { otpEmailTemplate } from "../../../helpers/otpEmailTemplate";
import { uploadInSpace } from "../../../shared/UploadHelper";
import httpStatus from "http-status";
import { uploadToDigitalOceanAWS } from "../../../helpers/uploadToDigitalOceanAWS";

const loginUserIntoDB = async (payload: {
  email?: string;
  phone?: string;
  password: string;
}) => {
  const identifier = (payload.email || payload.phone || "").trim();
  if (!identifier) {
    throw new ApiError(400, "Email or phone is required");
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { phone: identifier }],
    },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.status === "Blocked") {
    throw new ApiError(403, "Your account is blocked. Please contact admin.");
  }

  if (user.status === "Deleted") {
    throw new ApiError(
      400,
      "Your account already deleted, please contact Admin"
    );
  }

  const isPasswordValid = await bcrypt.compare(
    payload.password,
    user?.password
  );

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

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

const adminLogin = async (payload: {
  email?: string;
  phone?: string;
  password: string;
}) => {
  const identifier = (payload.email || payload.phone || "").trim();
  if (!identifier) {
    throw new ApiError(400, "Email or phone is required");
  }

  const user = await prisma.user.findFirst({
    where: {
      role: "Admin",
      OR: [{ email: identifier }, { phone: identifier }],
    },
  });

  if (!user) {
    throw new ApiError(404, "Admin not found");
  }

  if (user.status === "Deleted") {
    throw new ApiError(
      400,
      "Your account already deleted, please contact Admin"
    );
  }

  const isPasswordValid = await bcrypt.compare(
    payload.password,
    user?.password
  );

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

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

const userLocationUpdateInDB = async (
  userId: string,
  payload: { longitude: number, latitude: number }
) => {
  const isUserExist = await prisma.user.findFirst({
    where: {
      id: userId
    }
  })
  if (!isUserExist) {
    throw new ApiError(httpStatus.BAD_REQUEST, "You havent any account this site , contact admin")
  }
  if (isUserExist.status === "Deleted") {
    throw new ApiError(httpStatus.BAD_REQUEST, "you are already deleted user , please contact admin ")
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      settings: {
        longitude: payload.longitude,
        latitude: payload.latitude,
      } as any,
    },
  });

  return;
};

const sendForgotPasswordOtpDB = async (identifier: string) => {
  const lookup = (identifier || "").trim();
  if (!lookup) {
    throw new ApiError(400, "Phone or email is required");
  }
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: lookup }, { phone: lookup }],
    },
  });
  if (!existingUser) {
    throw new ApiError(404, "User not found");
  }

  if (existingUser.status === "Deleted") {
    throw new ApiError(
      400,
      "Your account already deleted, please contact Admin"
    );
  }

  if (!existingUser.email) {
    throw new ApiError(400, "This account has no email. OTP can only be sent by Gmail.");
  }

  const otpKey = existingUser.email;
  const otp = generateOTP();
  const OTP_EXPIRATION_TIME = 5 * 60 * 1000;
  const expiresAt = Date.now() + OTP_EXPIRATION_TIME;
  const { subject, html, text } = otpEmailTemplate({
    userName: existingUser.userName,
    otp,
    purpose: "reset",
  });
  await sendEmail(existingUser.email, subject, html, text);
  await prisma.otp.upsert({
    where: {
      email: otpKey,
    },
    update: { otpCode: otp, expiresAt: new Date(expiresAt) },
    create: { email: otpKey, otpCode: otp, expiresAt: new Date(expiresAt) },
  });

  return { email: existingUser.email };
};

const verifyForgotPasswordOtpCodeDB = async (payload: {
  email?: string;
  phone?: string;
  otp: string;
}) => {
  const identifier = (payload.email || payload.phone || "").trim();
  const { otp } = payload;

  if (!identifier || !otp) {
    throw new ApiError(400, "Phone or email and OTP are required.");
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }] },
  });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const otpKey = user.email || user.phone;
  const verifyData = await prisma.otp.findUnique({
    where: { email: otpKey },
  });

  if (!verifyData) {
    throw new ApiError(400, "Invalid or expired OTP.");
  }

  const { otpCode: savedOtp, expiresAt } = verifyData;

  if (otp !== savedOtp) {
    throw new ApiError(401, "Invalid OTP.");
  }

  if (Date.now() > expiresAt.getTime()) {
    await prisma.otp.delete({ where: { email: otpKey } });
    throw new ApiError(410, "OTP has expired. Please request a new OTP.");
  }

  await prisma.otp.delete({ where: { email: otpKey } });

  const forgetToken = jwtHelpers.generateToken(
    { id: user.id, purpose: "password-reset", resetVersion: createHash("sha256").update(user.password).digest("hex") },
    config.jwt.reset_pass_secret as string,
    "10m"
  );

  return { forgetToken };
};

const resetForgotPasswordDB = async (newPassword: string, userId: string, resetVersion: string) => {
  const existingUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!existingUser) {
    throw new ApiError(404, "user not found");
  }
  if (existingUser.status !== "Active" || !resetVersion || createHash("sha256").update(existingUser.password).digest("hex") !== resetVersion) {
    throw new ApiError(401, "Please request a new password reset.");
  }
  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.jwt.gen_salt) || 10
  );

  const result = await prisma.user.updateMany({
    where: { id: userId, password: existingUser.password, status: "Active" },
    data: { password: hashedPassword },
  });
  if (!result.count) throw new ApiError(401, "Please request a new password reset.");
  return;
};

const getProfileFromDB = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new ApiError(404, "user not found!");
  }

  const { password, createdAt, updatedAt, ...sanitizedUser } = user;

  return sanitizedUser;
};

const updateProfileIntoDB = async (
  payload: User & { profileImage?: string },
  userId: string,
  file?: Express.Multer.File
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "user not found for edit user");
  }

  if (user.status === "Deleted") {
    throw new ApiError(
      400,
      "Your account already deleted, please contact Admin"
    );
  }

  let profileImage = payload.profileImage || user.profileImage;

  if (file) {
    const uploaded = await uploadToDigitalOceanAWS(file);
    if (!uploaded?.Location) {
      throw new ApiError(400, "Failed to upload profile image");
    }
    profileImage = uploaded.Location;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      userName: payload.userName ?? user.userName,
      address: payload.address ?? user.address,
      profileImage,
    },
  });
  return getProfileFromDB(userId);
};

const changePassword = async (
  userId: string,
  payload: {
    oldPassword: string;
    newPassword: string;
  }
) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.status === "Deleted") {
    throw new ApiError(
      400,
      "Your account already deleted, please contact Admin"
    );
  }
  const isPasswordValid = await bcrypt.compare(
    payload.oldPassword,
    user?.password
  );

  if (!isPasswordValid) {
    throw new ApiError(400, "Invalid Password");
  }
  const hashedPassword = bcrypt.hashSync(payload.newPassword, 10);
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      password: hashedPassword,
    },
  });
  return;
};

export const authService = {
  loginUserIntoDB,
  adminLogin,
  getProfileFromDB,
  updateProfileIntoDB,
  userLocationUpdateInDB,
  sendForgotPasswordOtpDB,
  verifyForgotPasswordOtpCodeDB,
  resetForgotPasswordDB,
  changePassword,
};
