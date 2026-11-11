import { UserRole } from "@prisma/client";
import { z } from "zod";

const userRegisterValidationSchema = z.object({
  userName: z.string().min(1, "User name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Phone is required"),
  password: z.string().min(8, "Use at least 8 characters"),
  role: z.literal(UserRole.Client).default(UserRole.Client),
  address: z.string().min(1, "Address is required"),
});

const updateUserStatusSchema = z.object({
  status: z.enum(["Active", "Blocked"]),
});

export const userValidation = {
  userRegisterValidationSchema,
  updateUserStatusSchema,
};
